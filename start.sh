#!/bin/bash

echo "🚀 Starting ZupOne services..."
echo ""

# Start Docker services
echo "📦 Starting Docker containers..."
docker-compose up -d

echo ""
echo "✅ Services started!"
echo ""
echo "📊 URLs:"
echo "   PostgreSQL: localhost:5432"
echo "   Redis: localhost:6379"
echo "   Mailpit: http://localhost:8025"
echo ""
echo "💡 Tip: Run './stop.sh' to stop services"
echo ""
