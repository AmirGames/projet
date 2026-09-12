# Docker Stop Script for SaaS

Write-Host "🛑 Stopping SaaS Docker containers..." -ForegroundColor Red

docker-compose down

Write-Host "✅ Containers stopped!" -ForegroundColor Green

# Optional: Remove volumes
Write-Host "`nWant to remove volumes (delete data)? (y/n)" -ForegroundColor Yellow
$response = Read-Host
if ($response -eq 'y') {
    Write-Host "🗑️  Removing volumes..." -ForegroundColor Red
    docker-compose down -v
    Write-Host "✅ Volumes removed!" -ForegroundColor Green
}