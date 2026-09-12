# SaaS Local Commerce Platform

Une plateforme SaaS complète pour la digitalisation des commerces locaux. Permet aux petits commerçants de créer leur boutique en ligne, gérer leurs produits et commandes, et accepter les paiements en ligne.

**Stack technologique:**
- **Frontend**: Next.js 14 + React 18 + Tailwind CSS
- **Backend**: Express.js + Node.js + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Payments**: Stripe
- **Cache**: Redis
- **Deployment**: Railway

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis (optional, for production)
- Stripe Account (for payment processing)

### Installation

#### 1. Clone and install dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
npx prisma generate

# Install frontend dependencies
cd ../frontend
npm install
```

#### 2. Setup Environment Variables

**Backend** (`.env`)
```bash
cd backend
cp .env.example .env

# Edit .env with your values:
# - DATABASE_URL: Your PostgreSQL connection string
# - JWT_SECRET and JWT_REFRESH_SECRET: Generate random 32+ char strings
# - STRIPE_SECRET_KEY: Your Stripe secret key
```

**Frontend** (`.env.local`)
```bash
cd frontend
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_STRIPE=true
EOF
```

#### 3. Setup Database

```bash
cd backend

# Push Prisma schema to database
npx prisma db push

# (Optional) Open Prisma Studio
npx prisma studio
```

#### 4. Start Development Servers

**Terminal 1: Backend**
```bash
cd backend
npm run dev
# Server runs on http://localhost:3001
```

**Terminal 2: Frontend**
```bash
cd frontend
npm run dev
# App runs on http://localhost:3000
```

### Testing the Application

1. **Homepage**: http://localhost:3000
2. **Sign Up**: http://localhost:3000/signup
   - Create an account (auto-creates organization)
3. **Dashboard**: http://localhost:3000/dashboard
   - View your stores and recent orders
4. **Store View**: http://localhost:3000/store
   - View as customer, browse products, checkout
5. **API Documentation**: Check routes in `backend/src/routes/`

---

## 📁 Project Structure

```
saas-project/
├── backend/
│   ├── src/
│   │   ├── routes/       # API endpoints (auth, stores, products, orders, payments)
│   │   ├── services/     # Business logic (User, Store, Product, Order, Payment)
│   │   ├── middleware/   # Auth, error handling
│   │   ├── config/       # Environment, logger, stripe, email
│   │   ├── utils/        # Validation, helpers
│   │   ├── app.ts        # Express app setup
│   │   └── server.ts     # Server entry point
│   ├── prisma/
│   │   └── schema.prisma # Database schema (multi-tenant, stores, products, orders)
│   └── package.json
│
├── frontend/
│   ├── app/              # Next.js pages
│   │   ├── login/        # Login page
│   │   ├── signup/       # Signup page
│   │   ├── dashboard/    # Merchant dashboard
│   │   ├── store/        # Customer storefront
│   │   ├── checkout/     # Checkout page
│   │   └── page.tsx      # Homepage
│   ├── lib/
│   │   └── api.ts        # API client
│   └── package.json
│
├── .claude/              # Claude Code configuration
│   ├── hooks/
│   │   └── session-start.sh  # Auto-install dependencies
│   └── settings.json
│
└── README.md            # This file
```

---

## 🔑 Key Features

### For Merchants
- ✅ Create unlimited stores
- ✅ Manage products and inventory
- ✅ Track orders in real-time
- ✅ Accept online payments via Stripe
- ✅ Multi-tenant dashboard
- ✅ Role-based access control (Admin, Manager, Staff)

### For Customers
- ✅ Browse product catalogs
- ✅ Add items to cart
- ✅ Secure checkout
- ✅ Multiple delivery options (pickup/delivery)
- ✅ Real-time order status

---

## 🔐 Authentication

The project uses JWT (JSON Web Tokens) for stateless authentication:

1. **Signup**: User provides email, password, name
   - Password hashed with bcrypt
   - Default organization created
   - Access + Refresh tokens issued

2. **Login**: Email + password
   - Returns access token (7 days) + refresh token (30 days)
   - Tokens stored in localStorage

3. **Protected Routes**: All routes marked with `authMiddleware`
   - Verifies JWT signature and expiration
   - Extracts user, org, roles from token

See `backend/src/middleware/auth.ts` for middleware implementation.

---

## 💳 Stripe Integration

Payment flow:
1. Customer submits order → Backend creates Stripe PaymentIntent
2. Frontend receives `clientSecret`
3. Customer completes payment in Stripe form
4. Backend handles webhook → Updates order status
5. Customer receives confirmation

**Setup Stripe:**
1. Get API keys from Stripe Dashboard
2. Add to `.env`: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
3. Configure webhook in Stripe Dashboard pointing to `/api/payments/webhook`

---

## 🗄️ Database Schema (Prisma)

**Core Models:**
- **User**: Authentication + account management
- **Organization**: Multi-tenancy - groups stores + members
- **Membership**: User-Org relationship with roles
- **Store**: Individual shop/establishment
- **Product**: Items for sale
- **Order**: Customer purchases
- **Payment**: Stripe payment records
- **Theme**: Store customization (colors, fonts)

See `backend/prisma/schema.prisma` for complete schema.

---

## 🚀 Deployment to Railway

### Option 1: Deploy from GitHub

1. Push code to GitHub
2. Connect repo on https://railway.app
3. Railway auto-detects monorepo structure
4. Set environment variables in Railway dashboard
5. Deploy!

### Option 2: Manual Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Set variables
railway variables set DATABASE_URL=...
railway variables set JWT_SECRET=...
# ... set all env vars from .env

# Deploy
railway up
```

### Environment Variables for Production

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host/db
JWT_SECRET=<generate-random-32-char-string>
JWT_REFRESH_SECRET=<generate-random-32-char-string>
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
FRONTEND_URL=https://your-domain.com
API_URL=https://api-your-domain.com
SENDGRID_API_KEY=SG.xxxxx
REDIS_URL=redis://...
```

**Postdeploy Script (runs after deploy):**
```bash
# Run Prisma migrations
npx prisma migrate deploy
```

---

## 📊 API Documentation

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Stores (Protected)
- `POST /api/stores` - Create store
- `GET /api/stores` - List org stores
- `GET /api/stores/:id` - Get store details
- `PATCH /api/stores/:id` - Update store
- `DELETE /api/stores/:id` - Delete store

### Products (Public Read, Protected Write)
- `GET /api/products/store/:storeId` - List products
- `GET /api/products/search/:storeId` - Search products
- `POST /api/products` - Create product (protected)
- `PATCH /api/products/:id` - Update product (protected)
- `DELETE /api/products/:id` - Delete product (protected)

### Orders (Public Create, Protected Read)
- `POST /api/orders` - Create order (guest checkout)
- `GET /api/orders/:id` - Get order
- `GET /api/orders/store/:storeId` - List store orders (protected)
- `PATCH /api/orders/:id/status` - Update status (protected)

### Payments (Protected)
- `POST /api/payments/create-intent` - Create Stripe PaymentIntent
- `POST /api/payments/confirm` - Confirm payment
- `POST /api/payments/webhook` - Stripe webhook

---

## 🛠️ Development Tips

### Adding a new feature:

1. **Database**: Add model to `backend/prisma/schema.prisma`
   ```bash
   cd backend
   npx prisma migrate dev --name <feature_name>
   ```

2. **Backend Service**: Create in `backend/src/services/`
   ```typescript
   export class FeatureService {
     static async create(data) { ... }
     static async getById(id) { ... }
   }
   ```

3. **Backend Route**: Create in `backend/src/routes/`
   ```typescript
   router.post("/", authMiddleware, async (req, res, next) => {
     try {
       const data = schema.parse(req.body);
       const result = await FeatureService.create(data);
       res.status(201).json(result);
     } catch (err) {
       next(err);
     }
   });
   ```

4. **Frontend Integration**: Add API call to `frontend/lib/api.ts`
   ```typescript
   feature: async (data, token) => {
     const response = await fetch(`${API_BASE_URL}/api/feature`, {
       method: "POST",
       headers: { Authorization: `Bearer ${token}` },
       body: JSON.stringify(data),
     });
     return response.json();
   }
   ```

### Running Tests
```bash
cd backend
npm run test
```

### Linting & Formatting
```bash
cd backend
npm run lint
npm run format

cd ../frontend
npm run lint
npm run format
```

---

## 🐛 Troubleshooting

**Frontend can't connect to backend**
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Ensure backend is running on `localhost:3001`
- Check CORS settings in `backend/src/app.ts`

**Database connection fails**
- Verify PostgreSQL is running
- Check `DATABASE_URL` format: `postgresql://user:password@host:5432/dbname`
- Test with: `psql $DATABASE_URL`

**Stripe payments not working**
- Verify Stripe keys are correct (should be test keys in dev)
- Check webhook is configured in Stripe Dashboard
- Review logs in `backend/src/config/logger.ts`

**Emails not sending**
- Set `ENABLE_EMAIL_VERIFICATION=false` in `.env` to disable
- Or configure SendGrid: Add `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`

---

## 📝 License

MIT

---

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Commit changes: `git commit -m "feat: add my feature"`
3. Push: `git push origin feature/my-feature`
4. Open Pull Request

---

## 📞 Support

For issues and questions:
1. Check troubleshooting section above
2. Review API documentation
3. Check backend logs: `backend/logs/`
4. Open an issue on GitHub

---

**Happy selling! 🚀**
