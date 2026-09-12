# MODÈLE DE DONNÉES - Prisma Schema

---

## SCHEMA PRISMA COMPLET

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==========================================
// AUTH & USERS
// ==========================================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  password      String    // hashed
  firstName      String?
  lastName       String?
  avatar        String?
  phone         String?
  
  // Account status
  emailVerified DateTime?
  status        UserStatus @default(ACTIVE) // ACTIVE, INACTIVE, SUSPENDED
  
  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?
  
  // Relations
  memberships   Membership[]
  auditLogs     AuditLog[]
  notificationPreferences NotificationPreference?
  
  @@index([email])
  @@index([status])
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

// ==========================================
// ORGANIZATION (TENANT)
// ==========================================

model Organization {
  id              String    @id @default(cuid())
  slug            String    @unique // used for domains, URLs
  name            String    // company name
  legalName       String?   // legal entity name
  description     String?
  logo            String?   // URL
  taxId           String?   // VAT, SIRET, etc.
  email           String?
  phone           String?
  website         String?
  
  // Settings
  locale          String    @default("fr") // fr, nl, en
  timezone        String    @default("Europe/Brussels")
  currency        String    @default("EUR")
  
  // Subscription & Billing
  subscription    Subscription?
  paymentMethods  PaymentMethod[]
  invoices        Invoice[]
  
  // Theme
  theme           Theme?    // organization default theme
  customDomain    CustomDomain?
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relations
  stores          Store[]
  memberships     Membership[]
  products        Product[] // global product catalog (optional)
  auditLogs       AuditLog[]
  
  @@index([slug])
  @@index([createdAt])
}

// ==========================================
// MEMBERSHIP (User → Organization relation)
// ==========================================

model Membership {
  id              String    @id @default(cuid())
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId          String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String
  
  role            Role      // OWNER, MANAGER, EMPLOYEE, ACCOUNTANT, THEME_DEVELOPER
  
  // Store access: which stores can this user access?
  storeAccess     StoreAccess[]
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([userId, organizationId])
  @@index([organizationId])
  @@index([role])
}

enum Role {
  SUPER_ADMIN      // Platform admin
  OWNER            // Organization owner
  GROUP_ADMIN      // Multi-store admin
  MANAGER          // Store manager
  EMPLOYEE         // Store employee
  ACCOUNTANT       // Finance only
  THEME_DEVELOPER  // Agency/developer (theme only)
}

// ==========================================
// STORE (Physical location)
// ==========================================

model Store {
  id              String    @id @default(cuid())
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String
  
  name            String    // "Pizza Namur"
  slug            String
  description     String?
  
  // Address
  address         String?
  postalCode      String?
  city            String?
  country         String    @default("BE")
  latitude        Float?
  longitude       Float?
  
  // Contact
  phone           String?
  email           String?
  
  // Store settings
  sector          String    // "pizzeria", "nightshop", etc.
  status          StoreStatus @default(ACTIVE)
  
  // Opening hours
  openingHours    OpeningHours?
  
  // Theme
  theme           Theme?    // store-specific theme (can override org theme)
  customDomain    CustomDomain?
  
  // Delivery zones
  deliveryZones   DeliveryZone[]
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relations
  storeAccess     StoreAccess[]
  products        Product[]
  orders          Order[]
  customers       Customer[]
  devices         Device[]
  printers        Printer[]
  
  @@unique([organizationId, slug])
  @@index([organizationId])
  @@index([status])
  @@index([sector])
}

enum StoreStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

model StoreAccess {
  id              String    @id @default(cuid())
  membership      Membership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  membershipId    String
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  
  // Custom permissions for this store (optional, overrides role)
  permissions     String[]  // JSON array of permission codes
  
  createdAt       DateTime  @default(now())
  
  @@unique([membershipId, storeId])
}

// ==========================================
// OPENING HOURS
// ==========================================

model OpeningHours {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String    @unique
  
  // Day schedule (JSON format)
  monday          DaySchedule?
  tuesday         DaySchedule?
  wednesday       DaySchedule?
  thursday        DaySchedule?
  friday          DaySchedule?
  saturday        DaySchedule?
  sunday          DaySchedule?
  
  // Special dates (holidays, etc.)
  specialDates    SpecialDate[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

type DaySchedule {
  open    String? // "09:00"
  close   String? // "22:00"
  closed  Boolean @default(false)
}

model SpecialDate {
  id              String    @id @default(cuid())
  openingHours    OpeningHours @relation(fields: [openingHoursId], references: [id], onDelete: Cascade)
  openingHoursId  String
  
  date            DateTime
  status          String    // "closed", "open", "custom"
  customHours     DaySchedule?
  
  @@index([openingHoursId])
}

// ==========================================
// PRODUCTS & CATALOG
// ==========================================

model Category {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  
  name            String
  slug            String
  description     String?
  image           String?
  position        Int       @default(0)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  products        Product[]
  
  @@unique([storeId, slug])
  @@index([storeId])
}

model Product {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  category        Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  categoryId      String
  
  name            String
  slug            String
  description     String?
  image           String?   // URL
  
  // Pricing
  basePrice       Float     // in EUR (or currency)
  discountPrice   Float?
  discountPercent Float?
  
  // Inventory
  inventory       Int       @default(0) // -1 = unlimited
  sku             String?
  
  // Status
  status          ProductStatus @default(ACTIVE)
  
  // Options (like sizes, extras)
  options         ProductOption[]
  variants        ProductVariant[]
  
  // Sector-specific metadata (JSON)
  metadata        Json?     // {allergens: [], preparation_time: 30, etc}
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  orderItems      OrderItem[]
  
  @@unique([storeId, slug])
  @@index([storeId])
  @@index([categoryId])
  @@index([status])
}

enum ProductStatus {
  ACTIVE
  INACTIVE
  ARCHIVED
}

model ProductOption {
  id              String    @id @default(cuid())
  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  productId       String
  
  name            String    // "Size", "Toppings", "Color"
  type            String    // "select", "multiselect", "text"
  required        Boolean   @default(false)
  
  choices         OptionChoice[]
  
  @@index([productId])
}

model OptionChoice {
  id              String    @id @default(cuid())
  option          ProductOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  optionId        String
  
  label           String    // "Small", "Medium", "Large"
  value           String
  priceModifier   Float     @default(0) // additional price
  
  @@index([optionId])
}

model ProductVariant {
  id              String    @id @default(cuid())
  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  productId       String
  
  name            String    // "Small Margherita", "Large Pepperoni"
  sku             String?
  price           Float
  inventory       Int       @default(0)
  
  attributes      Json      // {size: "small", base: "thin"}
  
  @@index([productId])
}

// ==========================================
// ORDERS & PAYMENTS
// ==========================================

model Order {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  customer        Customer @relation(fields: [customerId], references: [id], onDelete: SetNull)
  customerId      String?
  
  // Order details
  orderNumber     String    // "ORD-2024-001234"
  status          OrderStatus @default(PENDING)
  
  // Items
  items           OrderItem[]
  
  // Pricing
  subtotal        Float
  deliveryFee     Float     @default(0)
  discount        Float     @default(0)
  tax             Float     @default(0)
  total           Float
  
  // Payment
  payment         Payment?
  paymentStatus   PaymentStatus @default(PENDING)
  
  // Delivery
  deliveryType    DeliveryType @default(CLICK_AND_COLLECT) // CLICK_AND_COLLECT, DELIVERY
  deliveryZone    DeliveryZone? @relation(fields: [deliveryZoneId], references: [id])
  deliveryZoneId  String?
  
  // For delivery: delivery address
  deliveryAddress Address?
  estimatedDeliveryTime DateTime?
  actualDeliveryTime DateTime?
  
  // For click & collect: pickup time
  pickupTime      DateTime?
  
  // Extra info
  notes           String?
  
  // Commission
  saasCommission  Float?    // calculated commission for platform
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([storeId])
  @@index([customerId])
  @@index([status])
  @@index([paymentStatus])
  @@index([createdAt])
}

enum OrderStatus {
  PENDING          // not yet accepted
  ACCEPTED         // commerçant accepted
  PREPARING        // in preparation
  READY            // ready for pickup/delivery
  OUT_FOR_DELIVERY // on the way
  COMPLETED        // finished
  REJECTED         // commerçant refused
  CANCELLED        // by customer
  REFUNDED         // refunded
}

enum DeliveryType {
  CLICK_AND_COLLECT
  DELIVERY
}

model OrderItem {
  id              String    @id @default(cuid())
  order           Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderId         String
  product         Product  @relation(fields: [productId], references: [id], onDelete: Restrict)
  productId       String
  
  quantity        Int
  unitPrice       Float     // price at the time of order
  totalPrice      Float     // quantity * unitPrice
  
  // Selected options (JSON)
  selectedOptions Json?     // {size: "large", toppings: ["bacon", "cheese"]}
  
  @@index([orderId])
  @@index([productId])
}

model Customer {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  
  // Identification
  firstName       String?
  lastName        String?
  email           String?
  phone           String
  
  // Account
  registered      Boolean   @default(false)
  password        String?   // hashed, if registered
  
  // Loyalty
  loyaltyPoints   Int       @default(0)
  loyaltyTier     String    @default("BRONZE") // BRONZE, SILVER, GOLD, PLATINUM
  
  // Addresses
  addresses       Address[]
  defaultAddress  String?   // address ID
  
  // Orders
  orders          Order[]
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([storeId])
  @@index([email])
  @@index([phone])
}

model Address {
  id              String    @id @default(cuid())
  customer        Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerId      String
  
  label           String?   // "Home", "Work"
  street          String
  number          String?
  postalCode      String
  city            String
  country         String    @default("BE")
  
  isDefault       Boolean   @default(false)
  
  // For orders
  orders          Order[]
  
  @@index([customerId])
}

// ==========================================
// DELIVERY
// ==========================================

model DeliveryZone {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  
  name            String    // "Namur center", "suburbs"
  
  // Geographic
  postalCodes     String[]  // ["5000", "5001"] or null if using radius
  radius          Int?      // in km from store location
  
  // Fees
  deliveryFee     Float
  minOrder        Float     @default(0)
  
  // Timing
  estimatedTime   Int       // in minutes
  
  // Status
  active          Boolean   @default(true)
  
  orders          Order[]
  
  @@index([storeId])
}

// ==========================================
// PAYMENTS & BILLING
// ==========================================

model Payment {
  id              String    @id @default(cuid())
  order           Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderId         String    @unique
  
  // Payment method
  method          PaymentMethod @relation(fields: [paymentMethodId], references: [id])
  paymentMethodId String
  
  // External payment IDs
  stripeId        String?   // Stripe payment intent ID
  bancontactId    String?   // Bancontact transaction ID
  
  // Details
  amount          Float
  currency        String    @default("EUR")
  status          PaymentStatus
  
  // Fees
  processingFee   Float     @default(0) // Stripe/Bancontact fee
  saasCommission  Float     @default(0) // Platform commission
  netAmount       Float     // amount - fees - commission
  
  // Payout
  payout          Payout?
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([orderId])
  @@index([status])
}

enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
  REFUNDED
}

model PaymentMethod {
  id              String    @id @default(cuid())
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String
  
  // Method type
  type            String    // "stripe", "bancontact", "paypal"
  
  // For Stripe
  stripeBankAccount String?
  
  // For Bancontact
  bancontactAccount String?
  
  // Status
  active          Boolean   @default(true)
  isDefault       Boolean   @default(false)
  
  payments        Payment[]
  
  @@index([organizationId])
}

model Payout {
  id              String    @id @default(cuid())
  payment         Payment  @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  paymentId       String    @unique
  
  organization    Organization @relation(fields: [organizationId], references: [id])
  organizationId  String
  
  // Details
  amount          Float
  currency        String    @default("EUR")
  status          PayoutStatus @default(SCHEDULED)
  
  // External
  stripePayout    String?
  
  // Dates
  scheduledDate   DateTime
  completedDate   DateTime?
  
  @@index([organizationId])
  @@index([status])
}

enum PayoutStatus {
  SCHEDULED
  PROCESSING
  COMPLETED
  FAILED
}

model Invoice {
  id              String    @id @default(cuid())
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String
  
  number          String    @unique
  period          String    // "2024-01"
  
  amount          Float
  status          String    // "draft", "sent", "paid"
  
  items           InvoiceItem[]
  
  createdAt       DateTime  @default(now())
  
  @@index([organizationId])
}

model InvoiceItem {
  id              String    @id @default(cuid())
  invoice         Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceId       String
  
  description     String    // "Subscription - Premium"
  amount          Float
  quantity        Int       @default(1)
  
  @@index([invoiceId])
}

// ==========================================
// SUBSCRIPTIONS & BILLING
// ==========================================

model Subscription {
  id              String    @id @default(cuid())
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String    @unique
  
  plan            Plan      @relation(fields: [planId], references: [id])
  planId          String
  
  status          SubscriptionStatus @default(ACTIVE)
  
  // Billing
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelledAt     DateTime?
  
  // Stripe subscription ID
  stripeId        String?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([status])
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
  CANCELLED
  PAST_DUE
}

model Plan {
  id              String    @id @default(cuid())
  
  name            String    @unique // "free", "premium", "pro"
  displayName     String    // "Free", "Premium", "Pro"
  description     String?
  
  // Pricing
  monthlyPrice    Float     @default(0)
  commissionRate  Float     // 3% = 0.03
  
  // Limits
  maxStores       Int       @default(1)
  maxUsers        Int       @default(1)
  maxProducts     Int       @default(100)
  
  // Features
  customDomain    Boolean   @default(false)
  customTheme     Boolean   @default(false)
  developerMode   Boolean   @default(false)
  api             Boolean   @default(false)
  advancedReports Boolean   @default(false)
  
  subscriptions   Subscription[]
  
  @@index([name])
}

// ==========================================
// THEMES
// ==========================================

model Theme {
  id              String    @id @default(cuid())
  organization    Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String?
  store           Store?    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String?
  
  name            String
  slug            String
  description     String?
  
  // Theme settings (Design Tokens)
  config          ThemeConfig
  
  // Active version
  activeVersion   ThemeVersion?
  
  // Status
  status          ThemeStatus @default(DRAFT)
  
  // Versions
  versions        ThemeVersion[]
  assets          ThemeAsset[]
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([organizationId, slug])
  @@unique([storeId, slug])
  @@index([status])
}

enum ThemeStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

type ThemeConfig {
  colors        ThemeColors
  typography    ThemeTypography
  spacing       ThemeSpacing
  components    Json       // component customizations
  layout        Json       // layout customizations
  customCss     String?    // custom CSS
  customJs      String?    // custom JS (restricted)
}

type ThemeColors {
  primary       String     // #D71920
  secondary     String     // #111111
  background    String     // #FFFFFF
  text          String     // #222222
  accent        String?
  success       String?
  warning       String?
  error         String?
}

type ThemeTypography {
  headingFont   String     // font family for headings
  bodyFont      String     // font family for body
  headingSize   Int        // in px
  bodySize      Int
  lineHeight    Float
}

type ThemeSpacing {
  xs            Int        // 4px
  sm            Int        // 8px
  md            Int        // 16px
  lg            Int        // 24px
  xl            Int        // 32px
}

model ThemeVersion {
  id              String    @id @default(cuid())
  theme           Theme    @relation(fields: [themeId], references: [id], onDelete: Cascade)
  themeId         String
  
  version         String    // "1.0.0", "1.1.0"
  
  config          ThemeConfig
  
  // Is this the active version?
  isActive        Boolean   @default(false)
  
  // Status
  status          ThemeVersionStatus @default(DRAFT)
  
  // Notes
  notes           String?
  
  createdAt       DateTime  @default(now())
  createdBy       String?   // user ID
  
  @@unique([themeId, version])
  @@index([themeId])
}

enum ThemeVersionStatus {
  DRAFT
  PREVIEW
  PUBLISHED
  ARCHIVED
}

model ThemeAsset {
  id              String    @id @default(cuid())
  theme           Theme    @relation(fields: [themeId], references: [id], onDelete: Cascade)
  themeId         String
  
  name            String    // "logo.png", "header-bg.jpg"
  type            String    // "image", "font", "css", "js"
  url             String    // S3/Cloudinary URL
  size            Int       // in bytes
  
  createdAt       DateTime  @default(now())
  
  @@index([themeId])
}

// ==========================================
// CUSTOM DOMAINS
// ==========================================

model CustomDomain {
  id              String    @id @default(cuid())
  
  // Can be for organization or store
  organization    Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String?
  store           Store?    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String?
  
  domain          String    @unique // pizzeriaxyz.be
  
  // Verification
  status          DomainStatus @default(PENDING)
  verificationCode String?
  
  // SSL
  certificateUrl  String?
  certificateExpiry DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([status])
}

enum DomainStatus {
  PENDING
  VERIFIED
  FAILED
  EXPIRED
}

// ==========================================
// DEVICES & TERMINALS
// ==========================================

model Device {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  
  type            String    // "terminal_android", "register_ipad"
  name            String    // "Terminal 1", "Register"
  deviceId        String?   // Android device ID or IMEI
  
  // Authentication
  pin             String?   // hashed PIN
  
  // Status
  status          DeviceStatus @default(ACTIVE)
  lastSeen        DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([storeId])
}

enum DeviceStatus {
  ACTIVE
  INACTIVE
  LOST
}

model Printer {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  
  name            String    // "Thermal Printer 1"
  model           String?   // "Epson TM-M30"
  
  // Connection
  type            String    // "network", "bluetooth", "usb"
  ipAddress       String?   // for network printers
  port            Int       @default(9100)
  
  // Settings
  paperWidth      Int       @default(80) // mm
  
  status          PrinterStatus @default(ONLINE)
  lastSeen        DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([storeId])
}

enum PrinterStatus {
  ONLINE
  OFFLINE
  ERROR
}

// ==========================================
// NOTIFICATIONS
// ==========================================

model Notification {
  id              String    @id @default(cuid())
  
  type            String    // "order.created", "order.ready", etc.
  
  recipient       String    // user email, phone, or ID
  channel         String    // "email", "sms", "push", "in_app"
  
  subject         String?
  message         String
  data            Json?     // additional data
  
  status          NotificationStatus @default(PENDING)
  
  sentAt          DateTime?
  
  createdAt       DateTime  @default(now())
  
  @@index([type])
  @@index([status])
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
  BOUNCED
}

model NotificationPreference {
  id              String    @id @default(cuid())
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId          String    @unique
  
  // Email preferences
  emailOrders     Boolean   @default(true)
  emailMarketing  Boolean   @default(false)
  
  // SMS preferences
  smsOrders       Boolean   @default(false)
  
  // Push preferences
  pushOrders      Boolean   @default(true)
  
  // Quiet hours
  quietHoursStart String?   // "22:00"
  quietHoursEnd   String?   // "08:00"
  
  updatedAt       DateTime  @updatedAt
}

// ==========================================
// AUDIT & LOGGING
// ==========================================

model AuditLog {
  id              String    @id @default(cuid())
  user            User      @relation(fields: [userId], references: [id], onDelete: SetNull)
  userId          String?
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String
  
  // Action
  action          String    // "create_product", "update_order", "delete_user"
  resourceType    String    // "product", "order", "user"
  resourceId      String?
  
  // Changes
  oldValue        Json?
  newValue        Json?
  
  // Context
  ipAddress       String?
  userAgent       String?
  
  createdAt       DateTime  @default(now())
  
  @@index([organizationId])
  @@index([action])
  @@index([createdAt])
}

// ==========================================
// DISCOUNTS & PROMOTIONS
// ==========================================

model Discount {
  id              String    @id @default(cuid())
  store           Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  storeId         String
  
  name            String
  code            String    @unique
  
  type            DiscountType // PERCENTAGE, FIXED_AMOUNT
  value           Float
  
  // Validity
  startDate       DateTime
  endDate         DateTime
  maxUses         Int?      // -1 = unlimited
  currentUses     Int       @default(0)
  
  // Conditions
  minAmount       Float     @default(0)
  appliesTo       String    // "all_products", "category", "product"
  targetId        String?   // category_id or product_id
  
  status          Boolean   @default(true)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([storeId])
  @@index([code])
}

enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
}

model LoyaltyAccount {
  id              String    @id @default(cuid())
  customer        Customer @relation("LoyaltyAccount", fields: [customerId], references: [id], onDelete: Cascade)
  customerId      String
  
  points          Int       @default(0)
  tier            String    @default("BRONZE")
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([customerId])
}
```

---

## RELATIONS PRINCIPALES

```
User
  ├── 1:N → Membership
  └── 1:N → AuditLog

Membership
  ├── N:1 → User
  ├── N:1 → Organization
  └── 1:N → StoreAccess

Organization (TENANT)
  ├── 1:N → Store
  ├── 1:N → Membership
  ├── 0:1 → Theme
  ├── 0:1 → CustomDomain
  ├── 0:1 → Subscription
  ├── 1:N → PaymentMethod
  ├── 1:N → Invoice
  └── 1:N → AuditLog

Store
  ├── N:1 → Organization
  ├── 1:N → Product
  ├── 1:N → Category
  ├── 1:N → Order
  ├── 1:N → Customer
  ├── 1:N → Device
  ├── 1:N → Printer
  ├── 1:N → DeliveryZone
  ├── 0:1 → Theme
  ├── 0:1 → OpeningHours
  └── 0:1 → CustomDomain

Product
  ├── N:1 → Store
  ├── N:1 → Category
  ├── 1:N → ProductOption
  ├── 1:N → ProductVariant
  └── 1:N → OrderItem

Order
  ├── N:1 → Store
  ├── N:1 → Customer
  ├── 1:N → OrderItem
  ├── 0:1 → Payment
  ├── 0:1 → DeliveryZone
  └── 0:1 → Address (delivery)

Payment
  ├── 1:1 → Order
  ├── N:1 → PaymentMethod
  ├── 0:1 → Payout
  ├── (Stripe integration)
  └── (Bancontact integration)

Theme
  ├── (0:1 → Organization) OR (0:1 → Store)
  ├── 1:N → ThemeVersion
  ├── 1:N → ThemeAsset
  └── 0:1 → (activeVersion from ThemeVersion)

Customer
  ├── N:1 → Store
  ├── 1:N → Order
  ├── 1:N → Address
  └── 0:1 → LoyaltyAccount
```

---

## INDEXES À CRÉER

```sql
-- Performance critical
CREATE INDEX idx_membership_user_id ON Membership(userId);
CREATE INDEX idx_membership_org_id ON Membership(organizationId);
CREATE INDEX idx_store_access_membership_store ON StoreAccess(membershipId, storeId);

CREATE INDEX idx_product_store ON Product(storeId);
CREATE INDEX idx_product_category ON Product(categoryId);
CREATE INDEX idx_product_status ON Product(status);

CREATE INDEX idx_order_store ON Order(storeId);
CREATE INDEX idx_order_customer ON Order(customerId);
CREATE INDEX idx_order_status ON Order(status);
CREATE INDEX idx_order_payment_status ON Order(paymentStatus);
CREATE INDEX idx_order_created ON Order(createdAt);

CREATE INDEX idx_payment_order ON Payment(orderId);
CREATE INDEX idx_payment_status ON Payment(status);

CREATE INDEX idx_customer_store_phone ON Customer(storeId, phone);
CREATE INDEX idx_customer_email ON Customer(email);

CREATE INDEX idx_theme_org_store ON Theme(organizationId, storeId);
CREATE INDEX idx_theme_version_active ON ThemeVersion(themeId, isActive);

CREATE INDEX idx_audit_log_org ON AuditLog(organizationId);
CREATE INDEX idx_audit_log_action ON AuditLog(action);
CREATE INDEX idx_audit_log_created ON AuditLog(createdAt);
```

---

## MIGRATION INITIALE

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name init

# Push to production
npx prisma db push
```

---

## NOTES IMPORTANTES

1. **Multi-tenancy** : Les données sont isolées par `organizationId` et `storeId`
2. **Cascade deletes** : Suppression d'une organization supprime tout
3. **Soft deletes** : Pas implémentés ici (ajouter si besoin archivage)
4. **JSON fields** : Utilisés pour les données flexibles (metadata, config, etc.)
5. **Timestamps** : `createdAt` et `updatedAt` sur toutes les tables principales
6. **Indexes** : Essentiels pour les performances avec beaucoup de données

---

**PROCHAINE ÉTAPE** : Authentification & Autorisations (JWT + RBAC) ? 👉
