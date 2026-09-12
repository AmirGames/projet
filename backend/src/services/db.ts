import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "saas.db");

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables if they don't exist
db.exec(`
CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  "passwordHash" TEXT NOT NULL,
  "emailVerified" BOOLEAN DEFAULT 0,
  "emailToken" TEXT UNIQUE,
  "emailTokenExpiresAt" DATETIME,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Organization" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  tier TEXT DEFAULT 'FREE',
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Membership" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "orgId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  "storeIds" TEXT DEFAULT '[]',
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "orgId")
);

CREATE TABLE IF NOT EXISTS "Store" (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  address TEXT,
  city TEXT,
  "postalCode" TEXT,
  phone TEXT,
  email TEXT,
  description TEXT,
  settings TEXT DEFAULT '{}',
  "pickupSlots" TEXT DEFAULT '[]',
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("orgId", slug)
);

CREATE TABLE IF NOT EXISTS "Category" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "displayOrder" INTEGER DEFAULT 0,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("storeId", name)
);

CREATE TABLE IF NOT EXISTS "Product" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  "categoryId" TEXT REFERENCES "Category"(id) ON DELETE SET NULL,
  stock INTEGER DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("storeId", sku)
);

CREATE TABLE IF NOT EXISTS "Order" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"(id) ON DELETE CASCADE,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "deliveryType" TEXT NOT NULL,
  "pickupTime" DATETIME,
  "deliveryAddress" TEXT,
  "deliveryCity" TEXT,
  "deliveryPostal" TEXT,
  status TEXT DEFAULT 'PENDING',
  "totalAmount" REAL NOT NULL,
  "taxAmount" REAL NOT NULL,
  "feesAmount" REAL NOT NULL,
  "paymentStatus" TEXT DEFAULT 'PENDING',
  "paymentId" TEXT,
  notes TEXT,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OrderItem" (
  id TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  "selectedOptions" TEXT DEFAULT '{}',
  price REAL NOT NULL,
  total REAL NOT NULL,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);