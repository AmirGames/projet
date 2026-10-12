#!/usr/bin/env bash
# Raccourcis d'exploitation, à lancer depuis n'importe où sur le VPS.
#
#   ./deploy/zup.sh up        construit et (re)démarre tout
#   ./deploy/zup.sh update    git pull + up
#   ./deploy/zup.sh logs [service]
#   ./deploy/zup.sh ps
#   ./deploy/zup.sh version   le commit qui tourne (API et site), lu sur /health
#   ./deploy/zup.sh down
#   ./deploy/zup.sh backup    sauvegarde chiffrée locale et copie distante vérifiée
#                             (BACKUP_REMOTE obligatoire sauf opt-out explicite)
#   ./deploy/zup.sh planifier-sauvegardes
#                             installe la sauvegarde nocturne (timer systemd, 03 h 15)
#   RESTORE_TEST_DATABASE_URL=… ./deploy/zup.sh restore-test <base.age> <identite-age.txt> <uploads.age>
#                             restaure dans une base distante dédiée et vérifie Prisma
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
    mkdir -p -m 700 "$SAUVEGARDES"
    chmod 700 "$SAUVEGARDES"
    command -v flock >/dev/null || { echo "❌ flock requis pour empêcher deux sauvegardes concurrentes"; exit 1; }
    exec 9>"$SAUVEGARDES/.backup.lock"
    flock -n 9 || { echo "❌ Une sauvegarde est déjà en cours"; exit 1; }
    horodatage="$(date +%Y%m%d-%H%M%S)"
    distant="$(valeur BACKUP_REMOTE)"
    distant_requis="$(valeur BACKUP_REMOTE_REQUIRED)"; distant_requis="${distant_requis:-true}"
    case "$distant_requis" in true|false) ;; *) echo "❌ BACKUP_REMOTE_REQUIRED doit valoir true ou false"; exit 1 ;; esac
    commande_id="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)"
    base="$SAUVEGARDES/base-$horodatage.sql.gz.age"
    uploads="$SAUVEGARDES/uploads-$horodatage.tar.gz.age"
    dc exec -T postgres pg_dump -U "$PGU" -d "$PGD" --no-owner | gzip | age -r "$destinataire" > "$SAUVEGARDES/base-$horodatage.sql.gz.age.partial"
    mv "$SAUVEGARDES/base-$horodatage.sql.gz.age.partial" "$base"
    dc exec -T backend tar czf - -C /app uploads private-documents backups | age -r "$destinataire" > "$SAUVEGARDES/uploads-$horodatage.tar.gz.age.partial"
    mv "$SAUVEGARDES/uploads-$horodatage.tar.gz.age.partial" "$uploads"
    # L'état COMPLETED signifie désormais que les deux objets distants ont été
    # transférés, comparés octet par octet via SHA-256, promus et publiés par manifeste.
    taille="$(stat -c %s "$SAUVEGARDES/base-$horodatage.sql.gz.age")"
    dc exec -T postgres psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -q \
      -v backup_id="$commande_id" -v backup_name="base-distant-$horodatage.sql.gz.age" \
      -v backup_size="$taille" -v backup_path="$base" -c \
      'INSERT INTO "Backup" (id, name, "sizeBytes", status, "filePath", "createdAt", "completedAt") VALUES (:'"'"'backup_id'"'"', :'"'"'backup_name'"'"', LEAST(:'"'"'backup_size'"'"'::numeric, 2147483647)::int, '\''LOCAL_ONLY'\'', :'"'"'backup_path'"'"', now(), now())'
    # Rétention locale de 14 jours, après clôture des deux archives locales.
    find "$SAUVEGARDES" -name '*.age' -mtime +14 -delete
    find "$SAUVEGARDES" -name 'manifest-*.txt' -mtime +14 -delete
    marquer_echec_distant() {
      dc exec -T postgres psql -U "$PGU" -d "$PGD" -q -c \
        "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='Copie distante non vérifiée' WHERE id='$commande_id'" || true
    }
    if [ -n "$distant" ]; then
      command -v rclone >/dev/null || { marquer_echec_distant; echo "❌ BACKUP_REMOTE défini mais rclone absent; sauvegarde locale conservée"; exit 1; }
      command -v timeout >/dev/null || { marquer_echec_distant; echo "❌ timeout requis pour borner le transfert"; exit 1; }
      distant="${distant%/}/$horodatage"
      verifier_et_publier() {
        local local_file="$1" nom temp final local_hash distant_hash
        nom="${local_file##*/}"; temp="$distant/$nom.partial"; final="$distant/$nom"
        timeout 2h rclone copyto "$local_file" "$temp" --immutable --contimeout 30s --timeout 5m --retries 3 --low-level-retries 10
        local_hash="$(sha256sum "$local_file" | cut -d' ' -f1)"
        distant_hash="$(timeout 2h rclone cat "$temp" | sha256sum | cut -d' ' -f1)"
        [ "$local_hash" = "$distant_hash" ] || { echo "❌ SHA-256 distant incorrect : $nom.partial"; return 1; }
        timeout 2h rclone moveto "$temp" "$final" --immutable --contimeout 30s --timeout 5m --retries 3 --low-level-retries 10
        distant_hash="$(timeout 2h rclone cat "$final" | sha256sum | cut -d' ' -f1)"
        [ "$local_hash" = "$distant_hash" ] || { echo "❌ SHA-256 après promotion incorrect : $nom"; return 1; }
        printf '%s  %s\n' "$local_hash" "$nom"
      }
      sommes_base="$(verifier_et_publier "$base")" || { dc exec -T postgres psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -q -c "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='Transfert distant base échoué' WHERE id='$commande_id'" || true; exit 1; }
      sommes_fichiers="$(verifier_et_publier "$uploads")" || { dc exec -T postgres psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -q -c "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='Transfert distant fichiers échoué' WHERE id='$commande_id'" || true; exit 1; }
      manifeste="$SAUVEGARDES/manifest-$horodatage.txt"
      { printf 'createdAt=%s\n' "$horodatage"; printf '%s\n' "$sommes_base" "$sommes_fichiers"; } > "$manifeste"
      chmod 600 "$manifeste"
      timeout 2h rclone copyto "$manifeste" "$distant/manifest-$horodatage.txt.partial" --immutable --contimeout 30s --timeout 5m --retries 3 --low-level-retries 10 || { dc exec -T postgres psql -U "$PGU" -d "$PGD" -q -c "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='Publication du manifeste échouée' WHERE id='$commande_id'" || true; exit 1; }
      hash_manifest="$(sha256sum "$manifeste" | cut -d' ' -f1)"
      test "$(timeout 2h rclone cat "$distant/manifest-$horodatage.txt.partial" | sha256sum | cut -d' ' -f1)" = "$hash_manifest" || { dc exec -T postgres psql -U "$PGU" -d "$PGD" -q -c "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='Manifeste tronqué ou altéré' WHERE id='$commande_id'" || true; exit 1; }
      timeout 2h rclone moveto "$distant/manifest-$horodatage.txt.partial" "$distant/manifest-$horodatage.txt" --immutable --contimeout 30s --timeout 5m --retries 3 --low-level-retries 10 || { dc exec -T postgres psql -U "$PGU" -d "$PGD" -q -c "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='Promotion du manifeste échouée' WHERE id='$commande_id'" || true; exit 1; }
      test "$(timeout 2h rclone cat "$distant/manifest-$horodatage.txt" | sha256sum | cut -d' ' -f1)" = "$hash_manifest" || { dc exec -T postgres psql -U "$PGU" -d "$PGD" -q -c "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='Manifeste final tronqué ou altéré' WHERE id='$commande_id'" || true; exit 1; }
      dc exec -T postgres psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -q -c \
        "UPDATE \"Backup\" SET status='COMPLETED', error=NULL, \"completedAt\"=now() WHERE id='$commande_id'"
      echo "☁️  Copie distante vérifiée et publiée : $distant/manifest-$horodatage.txt"
    else
      echo "⚠️  Sauvegarde locale seulement : $base et $uploads (aucune copie hors serveur)"
      if [ "$distant_requis" = true ]; then
        dc exec -T postgres psql -U "$PGU" -d "$PGD" -v ON_ERROR_STOP=1 -q -c "UPDATE \"Backup\" SET status='REMOTE_FAILED', error='BACKUP_REMOTE absent' WHERE id='$commande_id'" || true
        echo "❌ Copie distante obligatoire absente; les archives locales sont conservées, mais la sauvegarde complète a échoué."
        exit 1
      fi
    fi
    echo "✅ Sauvegarde locale vérifiée : $base et $uploads"
    ;;
  planifier-sauvegardes)
    # Une sauvegarde qui n'est pas planifiée n'existe pas : la santé de la
    # plateforme passe à l'orange après deux jours sans sauvegarde complète.
    # Un timer systemd (et non cron) : « Persistent » rattrape une nuit où le
    # serveur était éteint, et le journal garde la trace de chaque passage.
    command -v systemctl >/dev/null || { echo "systemd requis (sinon, planifiez '$RACINE/deploy/zup.sh backup' avec cron)"; exit 1; }
    utilisateur="${SUDO_USER:-$(id -un)}"
    service="[Unit]
Description=Sauvegarde chiffrée ZupOne (base + fichiers)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$utilisateur
WorkingDirectory=$RACINE
ExecStart=$RACINE/deploy/zup.sh backup
# Un passage ne doit jamais bloquer le suivant.
TimeoutStartSec=2h"
    minuteur="[Unit]
Description=Sauvegarde nocturne ZupOne

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target"
    echo "$service" | sudo tee /etc/systemd/system/zup-sauvegarde.service >/dev/null
    echo "$minuteur" | sudo tee /etc/systemd/system/zup-sauvegarde.timer >/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable --now zup-sauvegarde.timer
    systemctl list-timers zup-sauvegarde.timer --no-pager
    echo "✅ Sauvegarde nocturne planifiée. Suivi : journalctl -u zup-sauvegarde.service"
    echo "   Prochaines étapes : définir BACKUP_REMOTE (copie hors serveur), garder la clé age privée"
    echo "   hors du serveur, puis faire un exercice : $0 restore-test <base-….age> <identite-age.txt> <uploads-….age>"
    ;;
  restore-test)
    # Exercice de restauration : ne touche JAMAIS à la base de production.
    # Utilise exclusivement la base vide et isolée zup_restore_test configurée
    # dans l'environnement du shell, puis la conserve pour inspection manuelle.
    fichier="${2:-}"; identite="${3:-}"; fichiers="${4:-}"
    test_url="${RESTORE_TEST_DATABASE_URL:-}"
    [ -f "$fichier" ] && [ -f "$identite" ] && [ -n "$fichiers" ] && [ -n "$test_url" ] || { echo "Usage : RESTORE_TEST_DATABASE_URL=postgresql://…/zup_restore_test $0 restore-test <base-….sql.gz.age> <identite-age.txt> <uploads-….tar.gz.age>"; exit 1; }
    test -f "$fichiers" || { echo "❌ Archive de fichiers introuvable : $fichiers"; exit 1; }
    printf '%s' "$test_url" | grep -Eq '^postgres(ql)?://[^/]+/zup_restore_test([?]|$)' || { echo "❌ RESTORE_TEST_DATABASE_URL doit viser une base dédiée nommée zup_restore_test"; exit 1; }
    hote_test="$(printf '%s' "$test_url" | sed -E 's#^[^:]+://([^@/]*@)?([^:/?]+).*#\2#')"
    url_production="$(valeur DATABASE_URL)"; hote_production=postgres
    if [ -n "$url_production" ]; then hote_production="$(printf '%s' "$url_production" | sed -E 's#^[^:]+://([^@/]*@)?([^:/?]+).*#\2#')"; fi
    [ -n "$hote_test" ] && [ "$hote_test" != "$hote_production" ] || { echo "❌ La base d'exercice doit être sur un hôte différent de PostgreSQL production."; exit 1; }
    case "$hote_test" in localhost|127.0.0.1|::1) echo "❌ L'infrastructure d'exercice doit être distante et isolée."; exit 1 ;; esac
    debut_exercice=$SECONDS
    command -v age >/dev/null || { echo "age requis"; exit 1; }
    umask 077
    dossier_preuves="$SAUVEGARDES/restore-tests"
    mkdir -p -m 700 "$dossier_preuves"
    chmod 700 "$dossier_preuves"
    preuve="$dossier_preuves/restore-$(date +%Y%m%d-%H%M%S).txt"
    resultat_exercice=FAILED; migrations=0; nombre=0; controle_prisma=NOT_RUN; resume_tables=""
    finaliser_exercice() {
      code_sortie=$?
      trap - EXIT
      duree_exercice=$((SECONDS - debut_exercice))
      { printf 'result=%s\nbase=%s\nfichiers=%s\ndatabase=zup_restore_test\nmigrations=%s\nfichiers_extraits=%s\nprisma=%s\ntables=%s\nduration_seconds=%s\n' \
          "$resultat_exercice" "$(basename "$fichier")" "$(basename "$fichiers")" \
          "$migrations" "$nombre" "$controle_prisma" "$resume_tables" "$duree_exercice"; } > "$preuve"
      chmod 600 "$preuve"
      echo "Durée du contrôle de restauration : ${duree_exercice} s"
      echo "Preuve locale : $preuve"
      exit "$code_sortie"
    }
    trap finaliser_exercice EXIT
    sql() { dc exec -T postgres psql "$test_url" -v ON_ERROR_STOP=1 -q -t -A "$@"; }
    nombre_tables="$(sql -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
    [ "$nombre_tables" = 0 ] || { echo "❌ La base zup_restore_test doit être vide (tables actuelles: $nombre_tables)"; exit 1; }
    age -d -i "$identite" "$fichier" | gunzip -t
    age -d -i "$identite" "$fichier" | gunzip | sql -o /dev/null
    echo "Table                 restaurée   contrôle"
    echec=0
    for table in User Organization Store Order Payment MerchantPayout; do
      restaure="$(sql -c "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ABSENTE)"
      reel="non comparée"
      printf '%-20s %10s %15s\n' "$table" "$restaure" "$reel"
      resume_tables="$resume_tables$table=$restaure;"
      [ "$restaure" = "ABSENTE" ] && echec=1
    done
    migrations="$(sql -c 'SELECT count(*) FROM "_prisma_migrations"' 2>/dev/null || echo 0)"
    echo "Migrations Prisma restaurées : $migrations"
    [ "${migrations:-0}" -gt 0 ] || echec=1
    # Extraire dans un conteneur éphémère sans volume ni réseau : jamais dans
    # les volumes de l'API en exploitation. Le conteneur est supprimé à la fin.
    nombre="$(age -d -i "$identite" "$fichiers" | docker run --rm -i --network none --entrypoint sh zupone-backend -c 'd=$(mktemp -d /tmp/zup-restore.XXXXXX); tar xzf - -C "$d"; find "$d" -type f | wc -l')"
    echo "Fichiers extraits et contrôlés dans le conteneur éphémère : $nombre"
    [ "${nombre:-0}" -gt 0 ] || echec=1
    # Utiliser le client Prisma de production sans démarrer serveur, jobs ou
    # entrypoint (qui pourrait parcourir les volumes de l'API).
    dc run --rm --no-deps --entrypoint node -e "DATABASE_URL=$test_url" backend --input-type=module -e \
      'import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaClient } from "@prisma/client"; const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})}); const r=await p.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations"`; console.log(`Prisma applicatif: ${r[0].n} migrations`); if(!r[0].n) process.exitCode=1; await p.$disconnect();'
    if [ "$echec" -ne 0 ]; then echo "❌ Restauration incomplète : cette sauvegarde n'est pas exploitable"; exit 1; fi
    controle_prisma=PASS
    resultat_exercice=SUCCESS
    echo "✅ La sauvegarde se restaure sur la base d'exercice isolée zup_restore_test."
    echo "   La base zup_restore_test est conservée pour l'inspection; supprimez-la après validation."
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
