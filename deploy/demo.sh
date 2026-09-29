#!/usr/bin/env bash
# Exploitation de l'environnement de DÉMONSTRATION (serveur à part de la prod).
#
#   ./deploy/demo.sh up        construit et (re)démarre tout
#   ./deploy/demo.sh update    git pull + up
#   ./deploy/demo.sh reset     vide la base et recrée le jeu d'essai
#   ./deploy/demo.sh cron      programme la remise à zéro chaque nuit (3 h)
#   ./deploy/demo.sh logs [service]
#   ./deploy/demo.sh ps
#   ./deploy/demo.sh down
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE"

if [ ! -f .env.demo ]; then
  echo "❌ .env.demo introuvable dans $RACINE"
  echo "   cp deploy/env.demo.example .env.demo, puis remplissez-le."
  exit 1
fi

dc() { docker compose --env-file .env.demo -f docker-compose.demo.yml "$@"; }

# Garde-fou : ce script ne doit jamais tourner là où vit la production.
if [ -f .env.production ]; then
  echo "❌ .env.production existe ici : ce serveur est celui de la production."
  echo "   La démo va sur son propre serveur."
  exit 1
fi

reset() {
  # L'API doit répondre : le jeu d'essai se crée par elle, pas par la base.
  dc up -d backend
  dc --profile outils run --rm --no-deps reset
  echo "✅ Démo remise à zéro."
}

case "${1:-}" in
  up)
    dc up -d --build --remove-orphans
    dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile.demo --adapter caddyfile
    docker image prune -f >/dev/null
    # Une démo vide ne montre rien : premier démarrage, on crée le jeu d'essai.
    if [ -z "$(dc exec -T postgres psql -U zupone -d zupone_demo -tAc 'SELECT 1 FROM "User" LIMIT 1' 2>/dev/null || true)" ]; then
      reset
    fi
    dc ps
    ;;
  update)
    git pull --ff-only
    "$0" up
    ;;
  reset) reset ;;
  cron)
    ligne="0 3 * * * $RACINE/deploy/demo.sh reset >> $HOME/demo-reset.log 2>&1"
    (crontab -l 2>/dev/null | grep -vF "deploy/demo.sh reset" || true; echo "$ligne") | crontab -
    echo "✅ Remise à zéro programmée : $ligne"
    ;;
  logs) shift; dc logs -f --tail=200 "$@" ;;
  ps)   dc ps ;;
  down) dc down ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
