#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web
# Installs dependencies for both frontend and backend in parallel

echo '{"async": false}'

echo "🚀 Installing dependencies..."

# npm ci installe exactement les lockfiles, sans jamais les réécrire.
# `npm install --legacy-peer-deps` les modifiait à chaque démarrage de
# session (dépendances « pair » ignorées) ; il n'est plus nécessaire depuis
# que toutes les dépendances acceptent React 19.

# Install backend dependencies
(
  cd backend
  npm ci
  npx prisma generate
) &
BACKEND_PID=$!

# Install frontend dependencies
(
  cd frontend
  npm ci
) &
FRONTEND_PID=$!

# Wait for both to complete
wait $BACKEND_PID $FRONTEND_PID

echo "✅ Dependencies installed successfully"
echo "🔧 Building backend..."
cd backend && npm run build
cd ..

echo "✅ Setup complete!"
