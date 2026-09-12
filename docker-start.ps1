# Docker Start Script for SaaS

Write-Host "Starting SaaS with Docker Compose..." -ForegroundColor Green

# Check if Docker is running
$dockerRunning = docker ps 2>&1 | Select-String "CONTAINER"
if (-not $dockerRunning) {
    Write-Host "Docker is not running. Please start Docker Desktop first!" -ForegroundColor Red
    exit 1
}

# Load environment variables
if (Test-Path ".env.production") {
    Write-Host "Loading .env.production..." -ForegroundColor Yellow
}

# Build and start containers
Write-Host "Building Docker images..." -ForegroundColor Yellow
docker-compose build

Write-Host "Starting containers..." -ForegroundColor Yellow
docker-compose up -d

# Wait for services to be healthy
Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check health
Write-Host "`nServices Status:" -ForegroundColor Green
docker-compose ps

Write-Host "`nFrontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:3001" -ForegroundColor Cyan
Write-Host "API Health: http://localhost:3001/health" -ForegroundColor Cyan

Write-Host "`nSaaS is running in Docker!" -ForegroundColor Green