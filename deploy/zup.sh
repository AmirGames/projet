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
  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
