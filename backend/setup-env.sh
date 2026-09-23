#!/bin/bash

# Setup script for backend environment configuration
# This script creates a .env file with random JWT secrets if it doesn't exist

set -e

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
    echo "✅ $ENV_FILE already exists. Skipping creation."
    exit 0
fi

echo "🔧 Setting up .env file..."

# Generate random secrets (32+ characters for JWT)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Create .env from example, then replace JWT secrets
cp .env.example .env

# Update JWT secrets (cross-platform sed command)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    sed -i '' "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" .env
else
    # Linux and others
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" .env
fi

echo "✅ .env file created successfully!"
echo "📝 Configuration details:"
echo "   - JWT_SECRET: ${JWT_SECRET:0:16}... (32 chars)"
echo "   - JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:0:16}... (32 chars)"
echo ""
echo "⚠️  Do NOT commit .env to version control."
echo "✨ Environment is ready for development!"
