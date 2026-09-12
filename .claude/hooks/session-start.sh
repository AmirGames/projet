#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web
# Installs dependencies for both frontend and backend in parallel

echo '{"async": false}'

echo "🚀 Installing dependencies..."

# Install backend dependencies
(
  cd backend
  npm install --legacy-peer-deps
  npx prisma generate
) &
BACKEND_PID=$!

# Install frontend dependencies
(
  cd frontend
  npm install --legacy-peer-deps
) &
FRONTEND_PID=$!

# Install root dependencies
npm install --legacy-peer-deps

# Wait for both to complete
wait $BACKEND_PID $FRONTEND_PID

echo "✅ Dependencies installed successfully"
echo "🔧 Building backend..."
cd backend && npm run build
cd ..

echo "✅ Setup complete!"
