#!/usr/bin/env bash
# Raccourcis d'exploitation, à lancer depuis n'importe où sur le VPS.
#
#   ./deploy/zup.sh up        construit et (re)démarre tout
#   ./deploy/zup.sh update    git pull + up
#   ./deploy/zup.sh logs [service]
#   ./deploy/zup.sh ps
#   ./deploy/zup.sh down
#   ./deploy/zup.sh backup    sauvegarde base + fichiers dans ~/sauvegardes
#   ./deploy/zup.sh restore <fichier.sql.gz>
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
  down)  dc down ;;
  restart) shift; dc restart "$@" ;;
  psql)  dc exec postgres psql -U "$PGU" -d "$PGD" ;;
  backup)
    mkdir -p "$SAUVEGARDES"
    horodatage="$(date +%Y%m%d-%H%M%S)"
    dc exec -T postgres pg_dump -U "$PGU" -d "$PGD" --no-owner | gzip > "$SAUVEGARDES/base-$horodatage.sql.gz"
    dc exec -T backend tar czf - -C /app uploads > "$SAUVEGARDES/uploads-$horodatage.tar.gz"
    # 14 jours gardés sur le serveur.
    find "$SAUVEGARDES" -name '*.gz' -mtime +14 -delete
    echo "✅ Sauvegarde : $SAUVEGARDES/*-$horodatage.*"
    ;;
  restore)
    fichier="${2:?Usage : $0 restore <base-....sql.gz>}"
    read -r -p "⚠️  Écraser la base $PGD avec $fichier ? (oui/non) " rep
    [ "$rep" = "oui" ] || exit 1
    dc stop backend
    dc exec -T postgres psql -U "$PGU" -d postgres -c "DROP DATABASE IF EXISTS \"$PGD\" WITH (FORCE);" -c "CREATE DATABASE \"$PGD\" OWNER \"$PGU\";"
    gunzip -c "$fichier" | dc exec -T postgres psql -q -U "$PGU" -d "$PGD"
    dc start backend
    echo "✅ Base restaurée."
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
