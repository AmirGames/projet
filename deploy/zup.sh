#!/usr/bin/env bash
# Raccourcis d'exploitation, à lancer depuis n'importe où sur le VPS.
#
#   ./deploy/zup.sh up        construit et (re)démarre tout
#   ./deploy/zup.sh update    git pull + up
#   ./deploy/zup.sh logs [service]
#   ./deploy/zup.sh ps
#   ./deploy/zup.sh version   le commit qui tourne (API et site), lu sur /health
#   ./deploy/zup.sh down
#   ./deploy/zup.sh backup    sauvegarde base + fichiers dans ~/sauvegardes
#                             (BACKUP_REMOTE : copie hors serveur avec rclone)
#   ./deploy/zup.sh restore-test <base-….sql.gz.age> <identite-age.txt>
#                             exercice : restaure dans une base jetable et vérifie
#   ./deploy/zup.sh restore   explique la restauration de production (manuelle)
#   ./deploy/zup.sh psql
#   ./deploy/zup.sh vapid     crée les clés des notifications push navigateur
#   ./deploy/zup.sh superowner  crée le superowner (SUPEROWNER_* de .env.production)
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE"

if [ ! -f .env.production ]; then
  echo "❌ .env.production introuvable dans $RACINE"
  echo "   cp deploy/env.production.example .env.production, puis remplissez-le."
  exit 1
fi

dc() { docker compose --env-file .env.production -f docker-compose.prod.yml "$@"; }
# Pour psql et pg_dump : les valeurs de .env.production, par défaut zupone.
# Lu ligne à ligne plutôt que sourcé : le fichier suit la syntaxe de Docker
# Compose, pas celle du shell.
valeur() { { grep -E "^$1=" .env.production || true; } | tail -n1 | cut -d= -f2- | tr -d '"'"'" ; }
PGU="$(valeur POSTGRES_USER)"; PGU="${PGU:-zupone}"
PGD="$(valeur POSTGRES_DB)"; PGD="${PGD:-zupone}"
SAUVEGARDES="${SAUVEGARDES:-$HOME/sauvegardes}"

case "${1:-}" in
  up)
    # Le commit construit dans les images : /health et /api/health le rendent,
    # pour savoir quel correctif tourne réellement.
    export GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo inconnue)"
    echo "Révision : ${GIT_SHA:0:12}"
    # Le service « migrate » applique les migrations avant l'API : s'il échoue,
    # l'API de la version précédente reste en place et la commande s'arrête ici.
    dc up -d --build --remove-orphans
    # Caddy ne relit pas son Caddyfile de lui-même : sans cela, une mise à
    # jour de deploy/Caddyfile restait sans effet. Le rechargement ne coupe
    # aucune connexion, et refuse une configuration invalide sans rien casser.
    dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    docker image prune -f >/dev/null
    dc ps
    ;;
  update)
    git pull --ff-only
    "$0" up
    ;;
  logs)  shift; dc logs -f --tail=200 "$@" ;;
  ps)    dc ps ;;
  version)
    # Ce qui tourne vraiment, pas ce qui est dans le dépôt : l'API et le site
    # annoncent le commit construit dans leur image.
    echo "dépôt : $(git rev-parse --short=12 HEAD)"
    echo -n "API   : "; dc exec -T backend wget -qO- http://127.0.0.1:3001/health; echo
    echo -n "Site  : "; dc exec -T frontend wget -qO- http://127.0.0.1:3000/api/health; echo
    ;;
  down)  dc down ;;
  restart) shift; dc restart "$@" ;;
  psql)  dc exec postgres psql -U "$PGU" -d "$PGD" ;;
  backup)
    command -v age >/dev/null || { echo "Installer age avant toute sauvegarde (voir docs/rgpd/exploitation.md)"; exit 1; }
    destinataire="$(valeur AGE_BACKUP_RECIPIENT)"
    [ -n "$destinataire" ] || { echo "AGE_BACKUP_RECIPIENT requis : aucune sauvegarde en clair"; exit 1; }
    umask 077
    mkdir -p "$SAUVEGARDES"
    horodatage="$(date +%Y%m%d-%H%M%S)"
    dc exec -T postgres pg_dump -U "$PGU" -d "$PGD" --no-owner | gzip | age -r "$destinataire" > "$SAUVEGARDES/base-$horodatage.sql.gz.age.partial"
    mv "$SAUVEGARDES/base-$horodatage.sql.gz.age.partial" "$SAUVEGARDES/base-$horodatage.sql.gz.age"
    dc exec -T backend tar czf - -C /app uploads private-documents backups | age -r "$destinataire" > "$SAUVEGARDES/uploads-$horodatage.tar.gz.age.partial"
    mv "$SAUVEGARDES/uploads-$horodatage.tar.gz.age.partial" "$SAUVEGARDES/uploads-$horodatage.tar.gz.age"
    # 14 jours gardés sur le serveur.
    find "$SAUVEGARDES" -name '*.age' -mtime +14 -delete
    # La santé de la plateforme (écran Données/Santé) lit cette ligne : seule une
    # sauvegarde complète, dont le nom commence par « base- », compte. Si cette
    # étape échoue, la santé passera à l'orange au bout de deux jours.
    taille="$(stat -c %s "$SAUVEGARDES/base-$horodatage.sql.gz.age")"
    dc exec -T postgres psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -q -c \
      "INSERT INTO \"Backup\" (id, name, \"sizeBytes\", status, \"filePath\", \"createdAt\", \"completedAt\") VALUES (gen_random_uuid()::text, 'base-$horodatage.sql.gz.age', LEAST($taille, 2147483647), 'COMPLETED', '$SAUVEGARDES/base-$horodatage.sql.gz.age', now(), now())"
    # Copie hors du serveur : sans elle, la perte du VPS emporte aussi les
    # sauvegardes. BACKUP_REMOTE est une destination rclone, par exemple
    # scaleway:mon-bucket/zupone. Les fichiers sont déjà chiffrés par age.
    distant="$(valeur BACKUP_REMOTE)"
    if [ -n "$distant" ]; then
      command -v rclone >/dev/null || { echo "❌ BACKUP_REMOTE est défini mais rclone n'est pas installé"; exit 1; }
      rclone copy "$SAUVEGARDES/base-$horodatage.sql.gz.age" "$distant" --immutable
      rclone copy "$SAUVEGARDES/uploads-$horodatage.tar.gz.age" "$distant" --immutable
      echo "☁️  Copie hors serveur : $distant"
    else
      echo "⚠️  BACKUP_REMOTE non défini : aucune copie hors serveur (voir DEPLOIEMENT-SCALEWAY.md)"
    fi
    echo "✅ Sauvegarde : $SAUVEGARDES/*-$horodatage.*"
    ;;
  restore-test)
    # Exercice de restauration : ne touche JAMAIS à la base de production. La
    # sauvegarde est déchiffrée en flux avec l'identité age (clé privée gardée
    # hors du VPS : copiez-la ici pour l'exercice, puis supprimez-la), restaurée
    # dans une base jetable, comparée à la base réelle, puis la base jetable est
    # supprimée. Une sauvegarde jamais restaurée n'est qu'une hypothèse.
    fichier="${2:-}"; identite="${3:-}"
    [ -f "$fichier" ] && [ -f "$identite" ] || { echo "Usage : $0 restore-test <base-….sql.gz.age> <identite-age.txt>"; exit 1; }
    command -v age >/dev/null || { echo "age requis"; exit 1; }
    TEST_DB="zup_restore_test"
    sql() { dc exec -T postgres psql -U "$PGU" -v ON_ERROR_STOP=1 -q -t -A "$@"; }
    nettoyer() { sql -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB" >/dev/null 2>&1 || true; }
    trap nettoyer EXIT
    nettoyer
    sql -d postgres -c "CREATE DATABASE $TEST_DB"
    age -d -i "$identite" "$fichier" | gunzip | sql -d "$TEST_DB" -o /dev/null
    echo "Table                 restaurée   production"
    echec=0
    for table in User Organization Store Order Payment MerchantPayout; do
      restaure="$(sql -d "$TEST_DB" -c "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ABSENTE)"
      reel="$(sql -d "$PGD" -c "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ABSENTE)"
      printf '%-20s %10s %12s\n' "$table" "$restaure" "$reel"
      [ "$restaure" = "ABSENTE" ] && echec=1
    done
    migrations="$(sql -d "$TEST_DB" -c 'SELECT count(*) FROM "_prisma_migrations"' 2>/dev/null || echo 0)"
    echo "Migrations Prisma restaurées : $migrations"
    [ "${migrations:-0}" -gt 0 ] || echec=1
    if [ "$echec" -ne 0 ]; then echo "❌ Restauration incomplète : cette sauvegarde n'est pas exploitable"; exit 1; fi
    echo "✅ La sauvegarde se restaure. Écarts de comptage normaux si la production a avancé depuis."
    echo "   Pensez à supprimer l'identité age copiée sur ce serveur."
    ;;
  restore)
    echo "Restauration en base isolée requise : réconcilier les effacements postérieurs avant de remettre l'API en service. Voir docs/rgpd/exploitation.md."
    exit 1
    ;;
  vapid)
    # Les clés ne se changent pas à la légère : les abonnements déjà pris
    # par les navigateurs sont liés à la clé publique et deviendraient muets.
    if [ -n "$(valeur VAPID_PUBLIC_KEY)" ] && [ -n "$(valeur VAPID_PRIVATE_KEY)" ]; then
      echo "ℹ️  Clés VAPID déjà présentes dans .env.production : rien à faire."
      echo "   Pour les remplacer, videz d'abord les deux lignes (les abonnements existants seront perdus)."
      exit 0
    fi
    cles="$(dc run --rm --no-deps -T backend node -e \
      'const k=require("web-push").generateVAPIDKeys();console.log(k.publicKey+" "+k.privateKey)' | tail -n1)"
    publique="${cles%% *}"; privee="${cles##* }"
    [ -n "$publique" ] && [ -n "$privee" ] || { echo "❌ Génération des clés impossible"; exit 1; }
    for ligne in "VAPID_PUBLIC_KEY=$publique" "VAPID_PRIVATE_KEY=$privee"; do
      nom="${ligne%%=*}"
      if grep -qE "^$nom=" .env.production; then
        sed -i "s|^$nom=.*|$ligne|" .env.production
      else
        echo "$ligne" >> .env.production
      fi
    done
    grep -qE '^VAPID_SUBJECT=.' .env.production || echo "VAPID_SUBJECT=mailto:$(valeur EMAIL_LETSENCRYPT)" >> .env.production
    # env_file n'est lu qu'à la création du conteneur : on le recrée.
    dc up -d --no-deps backend
    echo "✅ Clés VAPID enregistrées, API redémarrée."
    ;;
  superowner)
    # Sans effet si un superowner existe déjà. Le conteneur le fait aussi à
    # chaque démarrage : cette commande sert à le faire sans redémarrer.
    dc exec -T backend node dist/create-superowner.js
    ;;
  *)
    sed -n '2,14p' "$0"
    exit 1
    ;;
esac
