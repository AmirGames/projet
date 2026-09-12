\# SaaS Multi-Tenant - Docker Setup



\## Quick Start



\### Prerequisites

\- Docker Desktop installed

\- Docker Compose v3.8+



\### Local Development



```powershell

\# Start all services

.\\docker-start.ps1



\# Stop services

.\\docker-stop.ps1

```



\### Services



\- \*\*Frontend:\*\* http://localhost:3000

\- \*\*Backend API:\*\* http://localhost:3001

\- \*\*Health Check:\*\* http://localhost:3001/health



\### Environment Variables



Create `.env.production` with your credentials:

JWT\_SECRET=your-secret-key

STRIPE\_SECRET\_KEY=sk\_test\_xxx

SMTP\_USER=your-mailtrap-user

SMTP\_PASSWORD=your-mailtrap-password



\### Docker Commands



```powershell

\# Build images

docker-compose build



\# Start containers

docker-compose up -d



\# View logs

docker-compose logs -f backend

docker-compose logs -f frontend



\# Stop containers

docker-compose down



\# Remove volumes (delete data)

docker-compose down -v



\# View running containers

docker-compose ps

```



\### Production Deployment



1\. Update `.env.production` with production credentials

2\. Use managed database (PostgreSQL)

3\. Use managed email service (SendGrid, AWS SES)

4\. Deploy to Vercel (frontend) or Railway/Render (backend)



\### Troubleshooting



\*\*Containers won't start:\*\*

```powershell

docker-compose logs backend

docker-compose logs frontend

```



\*\*Port already in use:\*\*

```powershell

\# Change ports in docker-compose.yml

\# Or stop other services using those ports

```



\*\*Database issues:\*\*

```powershell

\# Reset database

docker-compose down -v

docker-compose up -d

```



\## Next Steps



\- \[ ] Test local deployment with Docker

\- \[ ] Setup CI/CD pipeline

\- \[ ] Deploy to production

\- \[ ] Migrate to PostgreSQL

