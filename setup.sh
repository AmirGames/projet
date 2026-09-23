#!/bin/bash

echo "🚀 ZupOne Unified Identity - Setup Script"
echo "=========================================="

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo ""
echo "1️⃣  Starting Docker services..."
docker-compose up -d

echo ""
echo "2️⃣  Waiting for PostgreSQL to be ready..."
sleep 3
while ! docker exec saas-postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "   Waiting..."
    sleep 2
done

echo "✅ PostgreSQL is ready!"

echo ""
echo "3️⃣  Installing backend dependencies..."
cd backend
npm install 2>&1 | tail -5

echo ""
echo "4️⃣  Running Prisma migrations..."
npx prisma migrate deploy
if [ $? -eq 0 ]; then
    echo "✅ Migrations applied successfully!"
else
    echo "⚠️  Migration issue - you may need to run: npx prisma migrate dev"
fi

echo ""
echo "5️⃣  Seeding database..."
npx prisma db seed 2>/dev/null || echo "⚠️  No seed script found (optional)"

echo ""
echo "=========================================="
echo "✅ Setup complete!"
echo ""
echo "📝 Environment configured:"
echo "   DATABASE_URL: postgresql://postgres:postgres@localhost:5432/saas_dev"
echo ""
echo "🎯 Next steps:"
echo "   1. Start backend: npm run dev"
echo "   2. Start frontend: cd ../frontend && npm run dev"
echo "   3. Open http://localhost:3000"
echo ""
