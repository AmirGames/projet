# INFRASTRUCTURE & DEPLOYMENT

---

## 1. ARCHITECTURE INFRASTRUCTURE

```
┌────────────────────────────────────────────────────────────────┐
│                    PRODUCTION INFRASTRUCTURE                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              CLOUDFLARE (CDN + DDoS Protection)          │ │
│  │           (Global edge nodes, SSL/TLS termination)       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                    │                       │                   │
│          ┌─────────┴─────────┐   ┌────────┴──────────┐        │
│          ▼                   ▼   ▼                   ▼        │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐  │
│  │  VERCEL      │   │   API Backend    │   │   Storage    │  │
│  │ (Frontend)   │   │   (AWS/Railway)  │   │ (Cloudinary) │  │
│  │              │   │                  │   │              │  │
│  │ - Dashboard  │   │  - Node.js       │   │ - Images     │  │
│  │ - Storefront │   │  - GraphQL       │   │ - PDFs       │  │
│  │ - Git Deploy │   │  - PostgreSQL    │   │ - Videos     │  │
│  └──────────────┘   │  - Redis         │   └──────────────┘  │
│         │           │  - Stripe/Bancontact│                   │
│         │           │  - Firebase      │                      │
│         │           │  - Monitoring    │                      │
│         │           └──────────────────┘                      │
│         │                   │                                  │
│         └───────────────────┼──────────────────┐              │
│                             │                  │              │
│                    ┌────────▼──────────┐   ┌───▼──────┐      │
│                    │  PostgreSQL DB    │   │ Redis    │      │
│                    │  (AWS RDS)        │   │ Cache    │      │
│                    │                   │   │          │      │
│                    │ - Read replicas   │   └──────────┘      │
│                    │ - Backups (daily) │                      │
│                    │ - Automated failover                    │
│                    └───────────────────┘                      │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                  MONITORING & LOGGING                    │ │
│  │                                                           │ │
│  │  - Sentry (error tracking)                              │ │
│  │  - DataDog (APM, metrics, logs)                         │ │
│  │  - Cloudflare Analytics                                 │ │
│  │  - Google Analytics (storefront traffic)                │ │
│  │  - PagerDuty (on-call alerts)                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                      BACKUPS                             │ │
│  │                                                           │ │
│  │  - Daily automated DB backups (AWS S3)                  │ │
│  │  - Point-in-time recovery (7 days)                      │ │
│  │  - Cross-region backup replication                      │ │
│  │  - Disaster recovery plan (RTO: 1 hour, RPO: 15 min)   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. HOSTING OPTIONS & SETUP

### Option A: Vercel (Frontend) + AWS (Backend)

**Frontend (Vercel)**
```
Pros:
  ✅ Automatic Git deployments (GitHub)
  ✅ Edge functions globally distributed
  ✅ Built-in SSL/TLS
  ✅ Free tier generous
  ✅ Auto-scaling

Cons:
  ❌ Cannot run background jobs
  ❌ Limited to 12 seconds execution

Setup:
  1. Connect GitHub repo to Vercel
  2. Set environment variables
  3. Deploy on git push (automatic)

Cost: $20-100/month (depending on usage)
```

**Backend (AWS EC2 or ECS)**
```
Pros:
  ✅ Full control
  ✅ Can run background jobs
  ✅ Flexible scaling
  ✅ Good for GraphQL

Cons:
  ❌ More complex setup
  ❌ Need to manage infrastructure

Setup:
  1. EC2 instance (t3.medium for MVP)
  2. Docker container
  3. Load balancer
  4. Auto-scaling group

Cost: $50-200/month (depending on scaling)
```

### Option B: Railway (Recommended for MVP)

**All-in-one platform**
```
Pros:
  ✅ Very simple deployment
  ✅ Database + backend in one place
  ✅ Good pricing
  ✅ Auto-scaling included
  ✅ Perfect for Node.js

Cons:
  ❌ Less control than AWS
  ❌ Limited to their infrastructure

Setup:
  1. Connect GitHub repo
  2. Create Node.js service
  3. Add PostgreSQL database
  4. Deploy on git push

Cost: Pay as you go ($5-50/month MVP phase)
```

### Recommended Architecture for MVP

```
PRODUCTION:
├─ Frontend: Vercel
├─ Backend: Railway (Node.js + PostgreSQL)
├─ File Storage: Cloudinary (images)
├─ Email: SendGrid
└─ Push Notifications: Firebase Cloud Messaging

STAGING:
├─ Frontend: Vercel (staging branch)
├─ Backend: Railway (staging environment)
└─ Database: Separate PostgreSQL

DEVELOPMENT:
├─ Frontend: Local (npm run dev)
├─ Backend: Local (npm run dev)
├─ Database: Docker (docker-compose)
└─ Cache: Docker Redis
```

---

## 3. CI/CD PIPELINE

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml

name: Deploy

on:
  push:
    branches:
      - main
      - staging

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/backend

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      # Install dependencies
      - name: Install dependencies
        run: npm ci

      # Run linter
      - name: Run linter
        run: npm run lint

      # Run type check
      - name: Type check
        run: npm run type-check

      # Run tests
      - name: Run tests
        run: npm run test:ci
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

      # Run e2e tests
      - name: Run e2e tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          API_URL: http://localhost:4000

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v3

      # Build Docker image
      - name: Build Docker image
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
          docker tag ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
                     ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

      # Push to registry
      - name: Push Docker image
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ${{ env.REGISTRY }} -u ${{ github.actor }} --password-stdin
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push'

    steps:
      - uses: actions/checkout@v3

      # Deploy to Railway / Vercel
      - name: Deploy to ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
        run: |
          # Using Railway CLI or Vercel CLI
          npm install -g @railway/cli
          railway link ${{ secrets.RAILWAY_PROJECT_ID }}
          railway up

        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      # Send notification
      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "Deployment ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "Deployment to ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }} - ${{ job.status }}"
                  }
                }
              ]
            }
```

---

## 4. DOCKER SETUP

### Dockerfile

```dockerfile
# Dockerfile

FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY . .
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app
COPY --from=builder /app/dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start app
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### Docker Compose (Local Development)

```yaml
# docker-compose.yml

version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: devuser
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: saasdb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U devuser"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: .
    environment:
      DATABASE_URL: postgresql://devuser:devpassword@postgres:5432/saasdb
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
      JWT_SECRET: dev-secret-key-do-not-use-in-production
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres_data:
```

---

## 5. MONITORING & LOGGING

### Sentry Setup

```typescript
// lib/sentry.ts

import * as Sentry from "@sentry/node";

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
  });
}

// Express middleware
export function sentryErrorHandler() {
  return Sentry.Handlers.errorHandler();
}
```

### Logging with Winston

```typescript
// lib/logger.ts

import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

// Usage
logger.info("Server started", { port: 4000 });
logger.error("Database connection failed", { error: err });
```

---

## 6. DATABASE BACKUPS & RECOVERY

### Automated Backups (AWS RDS)

```bash
# Enable automated backups in Terraform
resource "aws_db_instance" "postgres" {
  # ... other config ...
  
  backup_retention_period = 7  # Keep 7 days of backups
  backup_window          = "03:00-04:00"  # Off-peak time
  copy_tags_to_snapshot  = true
  
  enable_cloudwatch_logs_exports = ["postgresql"]
}

# Automated backup to S3
resource "aws_backup_plan" "database" {
  name = "saas-database-backup"

  rule {
    rule_name         = "daily_backup"
    target_backup_vault_name = aws_backup_vault.vault.name
    schedule          = "cron(0 5 * * ? *)"  # Daily at 5 AM
    start_window      = 60
    completion_window = 120
    
    lifecycle {
      delete_after = 7  # Keep for 7 days
    }
  }
}
```

### Manual Backup Script

```bash
#!/bin/bash
# backup.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="saas-db-backup-${TIMESTAMP}.sql.gz"
S3_BUCKET="saas-backups"
REGION="eu-west-1"

# Export database
pg_dump $DATABASE_URL | gzip > "/tmp/${BACKUP_FILE}"

# Upload to S3
aws s3 cp "/tmp/${BACKUP_FILE}" "s3://${S3_BUCKET}/" \
  --region $REGION \
  --sse AES256

# Clean up local copy
rm "/tmp/${BACKUP_FILE}"

# Send notification
curl -X POST $SLACK_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d "{\"text\":\"Database backup completed: ${BACKUP_FILE}\"}"

# Keep only last 30 days of backups
aws s3 rm "s3://${S3_BUCKET}/" \
  --recursive \
  --exclude "*" \
  --include "saas-db-backup-*" \
  --older-than 30
```

---

## 7. SCALING STRATEGY

### Horizontal Scaling

```typescript
// As load increases
// Week 1-4 (MVP): Single instance (t3.medium) = €20/month
// Week 5-8: 2 instances with load balancer = €50/month
// Week 9-12: Auto-scaling group (2-5 instances) = €100-200/month

// Scaling metrics to monitor:
// - CPU usage > 70%
// - Memory > 80%
// - Response time > 500ms
// - Request queue depth > 10
```

### Caching Strategy

```typescript
// Redis cache for frequently accessed data

// Cache patterns:
// - Products: cache for 1 hour
// - Categories: cache for 1 hour
// - Store info: cache for 6 hours
// - Orders: real-time (no cache, or cache with short TTL)
// - Theme config: cache for 24 hours

// Redis service
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// Get from cache or load from DB
async function getProduct(productId: string) {
  const cacheKey = `product:${productId}`;
  
  // Try cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Load from DB
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(product));

  return product;
}
```

### Database Scaling

```typescript
// As data grows:
// - Add read replicas for queries
// - Partition orders table by date
// - Archive old orders (> 1 year) to separate table
// - Use connection pooling (PgBouncer)

// Example: Connection pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,  // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## 8. SECURITY CHECKLIST

```
┌─ INFRASTRUCTURE SECURITY ─────────────────────────────────┐
│                                                            │
│ ✅ SSL/TLS encryption (HTTPS everywhere)                │
│ ✅ Firewall rules (only necessary ports open)            │
│ ✅ VPC + security groups                                 │
│ ✅ DDoS protection (Cloudflare)                          │
│ ✅ WAF (Web Application Firewall)                        │
│ ✅ Secrets management (AWS Secrets Manager)              │
│ ✅ No hardcoded secrets in code                          │
│ ✅ Environment-specific configs                          │
│                                                            │
├─ APPLICATION SECURITY ────────────────────────────────────┤
│                                                            │
│ ✅ JWT token expiry (24 hours access, 7 days refresh)   │
│ ✅ CORS properly configured                              │
│ ✅ Rate limiting on login/API                            │
│ ✅ Input validation (Zod schemas)                        │
│ ✅ SQL injection prevention (Prisma ORM)                 │
│ ✅ XSS prevention (sanitized output)                     │
│ ✅ CSRF tokens (double-submit cookies)                   │
│ ✅ Secure headers (CSP, X-Frame-Options, etc.)          │
│ ✅ Audit logging of sensitive operations                 │
│ ✅ No logging of sensitive data (passwords, tokens)     │
│                                                            │
├─ DATABASE SECURITY ───────────────────────────────────────┤
│                                                            │
│ ✅ Encrypted password storage (bcrypt)                   │
│ ✅ Encrypted at-rest (AWS KMS)                           │
│ ✅ Encrypted in-transit (TLS)                            │
│ ✅ Database user with minimal permissions                │
│ ✅ No hardcoded credentials                              │
│ ✅ Regular backups with encryption                       │
│ ✅ Access logs enabled                                   │
│                                                            │
├─ MONITORING & ALERTING ───────────────────────────────────┤
│                                                            │
│ ✅ Error tracking (Sentry)                               │
│ ✅ Performance monitoring (DataDog APM)                  │
│ ✅ Log aggregation (ELK or CloudWatch)                   │
│ ✅ Uptime monitoring                                      │
│ ✅ Alert on error rate spike                             │
│ ✅ Alert on response time degradation                    │
│ ✅ Alert on security events                              │
│ ✅ On-call rotation (PagerDuty)                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 9. DISASTER RECOVERY PLAN

```
┌─────────────────────────────────────────────────────────────┐
│              DISASTER RECOVERY PROCEDURES                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ RTO (Recovery Time Objective): 1 hour                      │
│ RPO (Recovery Point Objective): 15 minutes                 │
│                                                             │
│ SCENARIO 1: Database failure                              │
│ ─────────────────────────────────────                      │
│ 1. Detect issue (Sentry alert)                             │
│ 2. Switch to read replica (5 min)                          │
│ 3. Promote read replica to primary (5 min)                │
│ 4. Update connection strings (5 min)                       │
│ 5. Verify services (5 min)                                 │
│ 6. Investigation + fix (30 min)                            │
│ Total: 50 minutes                                          │
│                                                             │
│ SCENARIO 2: Application server crash                      │
│ ──────────────────────────────────────                     │
│ 1. Auto-scaling detects unhealthy instance (1 min)       │
│ 2. Launch replacement instance (2 min)                     │
│ 3. Health check passes (1 min)                             │
│ 4. Traffic rerouted by load balancer (0 min)             │
│ Total: 4 minutes (automatic)                               │
│                                                             │
│ SCENARIO 3: Data corruption / accidental deletion         │
│ ──────────────────────────────────────────────────────────│
│ 1. Detect issue (user report or monitoring)                │
│ 2. Restore from backup to staging (10 min)                │
│ 3. Identify good backup point (5 min)                      │
│ 4. Restore production to that point (20 min)               │
│ 5. Verify data integrity (10 min)                          │
│ 6. Switch to restored database (5 min)                     │
│ Total: 50 minutes + data loss = 15 min                     │
│                                                             │
│ SCENARIO 4: Security breach / credential exposure         │
│ ──────────────────────────────────────────────────────────│
│ 1. Detect issue (security alert)                          │
│ 2. Revoke exposed credentials (5 min)                     │
│ 3. Rotate all secrets (15 min)                            │
│ 4. Review access logs (30 min)                            │
│ 5. Issue new credentials (10 min)                         │
│ 6. Update all services with new credentials (10 min)      │
│ Total: 70 minutes                                          │
│                                                             │
│ SCENARIO 5: Region failure (Cloudflare/CDN)              │
│ ──────────────────────────────────────────────────────────│
│ 1. Failover automatic (via Cloudflare) (0 min)            │
│ 2. Monitor region health (continuous)                      │
│ 3. If primary region recovers, failback (5 min)          │
│ Total: Automatic, minimal impact                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. DEPLOYMENT CHECKLIST

```
┌──────────────────────────────────────────────────────────┐
│           PRE-DEPLOYMENT CHECKLIST                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Code Review:                                            │
│ ☐ PR reviewed by at least 1 other developer             │
│ ☐ All tests passing (unit, integration, e2e)           │
│ ☐ Linter passing                                        │
│ ☐ TypeScript no errors                                  │
│ ☐ No security issues (OWASP, SNYK)                     │
│ ☐ No database migrations breaking existing data         │
│                                                          │
│ Performance:                                             │
│ ☐ Bundle size not increased > 10%                       │
│ ☐ Database queries optimized                            │
│ ☐ No N+1 query problems                                 │
│ ☐ Caching strategy reviewed                             │
│                                                          │
│ Documentation:                                          │
│ ☐ API changes documented                                │
│ ☐ Database migrations documented                        │
│ ☐ Env variable changes documented                       │
│ ☐ Breaking changes listed in release notes              │
│                                                          │
│ Staging Verification:                                   │
│ ☐ Deployed to staging successfully                      │
│ ☐ Smoke tests passing                                   │
│ ☐ E2E tests passing on staging                          │
│ ☐ QA sign-off                                           │
│ ☐ Performance benchmarks acceptable                     │
│ ☐ Error rates stable                                    │
│                                                          │
│ Production Readiness:                                   │
│ ☐ Database backup completed                             │
│ ☐ Rollback plan documented                              │
│ ☐ On-call engineer ready                                │
│ ☐ Communication channels ready (Slack, etc.)            │
│ ☐ Monitoring dashboards updated                         │
│ ☐ Alerts configured                                     │
│ ☐ Runbook prepared                                      │
│                                                          │
│ During Deployment:                                      │
│ ☐ Deploy to blue environment first                      │
│ ☐ Health checks passing                                 │
│ ☐ Smoke tests passing                                   │
│ ☐ Monitor error rates (5 min)                           │
│ ☐ Monitor response times (5 min)                        │
│ ☐ Switch traffic to blue (green to blue)                │
│ ☐ Monitor for 10 minutes                                │
│ ☐ Announce deployment complete                          │
│                                                          │
│ Post-Deployment:                                        │
│ ☐ Monitor error rates (24 hours)                        │
│ ☐ Monitor performance metrics (24 hours)                │
│ ☐ Collect user feedback                                 │
│ ☐ Document any issues                                   │
│ ☐ Close deployment ticket                               │
│                                                          │
│ If Issues:                                              │
│ ☐ Immediately switch back to green (rollback)           │
│ ☐ Alert team in Slack                                   │
│ ☐ Create incident ticket                                │
│ ☐ RCA after incident resolved                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## RÉSUMÉ INFRASTRUCTURE

| Aspect | Décision |
|--------|----------|
| **Frontend Hosting** | Vercel (git deploy) |
| **Backend Hosting** | Railway ou AWS (Node.js) |
| **Database** | PostgreSQL managed (RDS ou Railway) |
| **Cache** | Redis (optional, Railway) |
| **File Storage** | Cloudinary (images optimisées) |
| **CDN** | Cloudflare (global edge, DDoS) |
| **Monitoring** | Sentry + DataDog |
| **Logging** | Winston + CloudWatch |
| **Backups** | Automated daily, 7-day retention |
| **RTO** | 1 hour max |
| **RPO** | 15 minutes max |
| **CI/CD** | GitHub Actions → Vercel/Railway |
| **Secrets** | AWS Secrets Manager |
| **SSL/TLS** | Cloudflare (automatic) |

