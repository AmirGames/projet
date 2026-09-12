# API GRAPHQL - Schema complet

---

## 1. SETUP GRAPHQL

### Dependencies

```bash
npm install graphql-yoga graphql graphql-scalars
npm install @graphql-tools/schema @graphql-tools/utils
npm install dataloader # for N+1 optimization
```

### Server Setup

```typescript
// server/graphql.ts

import { createYoga } from 'graphql-yoga';
import { createServer } from 'http';
import { schema } from './schema';

export const yoga = createYoga({
  schema,
  context: async ({ req }) => {
    // Extract JWT token
    const token = req.headers.authorization?.replace('Bearer ', '');

    // Verify token and get user
    let user = null;
    if (token) {
      try {
        user = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        // Token invalid/expired
      }
    }

    return {
      user,
      prisma,
      // Dataloaders for N+1 optimization
      loaders: {
        storeLoader: new DataLoader(async (storeIds) => {
          const stores = await prisma.store.findMany({
            where: { id: { in: storeIds } },
          });
          return storeIds.map((id) =>
            stores.find((s) => s.id === id)
          );
        }),
        // More loaders...
      },
    };
  },
});
```

---

## 2. TYPE DEFINITIONS (SDL)

### Complete Schema

```graphql
# ==========================================
# SCALARS
# ==========================================

scalar DateTime
scalar JSON
scalar Upload

# ==========================================
# ENUMS
# ==========================================

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum Role {
  SUPER_ADMIN
  OWNER
  GROUP_ADMIN
  MANAGER
  EMPLOYEE
  ACCOUNTANT
  THEME_DEVELOPER
}

enum OrderStatus {
  PENDING
  ACCEPTED
  PREPARING
  READY
  OUT_FOR_DELIVERY
  COMPLETED
  REJECTED
  CANCELLED
  REFUNDED
}

enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
  REFUNDED
}

enum DeliveryType {
  CLICK_AND_COLLECT
  DELIVERY
}

enum ThemeStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum ThemeVersionStatus {
  DRAFT
  PREVIEW
  PUBLISHED
  ARCHIVED
}

# ==========================================
# TYPES
# ==========================================

type User {
  id: ID!
  email: String!
  firstName: String
  lastName: String
  avatar: String
  phone: String
  status: UserStatus!
  emailVerified: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
  lastLoginAt: DateTime
  memberships: [Membership!]!
}

type Membership {
  id: ID!
  user: User!
  organization: Organization!
  role: Role!
  storeAccess: [StoreAccess!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type StoreAccess {
  id: ID!
  membership: Membership!
  store: Store!
  permissions: [String!]
  createdAt: DateTime!
}

type Organization {
  id: ID!
  slug: String!
  name: String!
  legalName: String
  description: String
  logo: String
  taxId: String
  email: String
  phone: String
  website: String
  locale: String!
  timezone: String!
  currency: String!
  createdAt: DateTime!
  updatedAt: DateTime!

  stores: [Store!]!
  memberships: [Membership!]!
  subscription: Subscription
  theme: Theme
  customDomain: CustomDomain
  invoices: [Invoice!]!
}

type Store {
  id: ID!
  organization: Organization!
  name: String!
  slug: String!
  description: String
  address: String
  postalCode: String
  city: String
  country: String!
  phone: String
  email: String
  sector: String!
  status: StoreStatus!
  createdAt: DateTime!
  updatedAt: DateTime!

  openingHours: OpeningHours
  theme: Theme
  customDomain: CustomDomain
  deliveryZones: [DeliveryZone!]!
  products(
    first: Int
    after: String
    categoryId: ID
    search: String
  ): ProductConnection!
  orders(
    first: Int
    after: String
    status: OrderStatus
  ): OrderConnection!
  categories: [Category!]!
  customers: [Customer!]!
  employees: [User!]!
}

type Category {
  id: ID!
  store: Store!
  name: String!
  slug: String!
  description: String
  image: String
  position: Int!
  createdAt: DateTime!
  updatedAt: DateTime!

  products: [Product!]!
}

type Product {
  id: ID!
  store: Store!
  category: Category!
  name: String!
  slug: String!
  description: String
  image: String
  basePrice: Float!
  discountPrice: Float
  discountPercent: Float
  inventory: Int!
  sku: String
  status: ProductStatus!
  createdAt: DateTime!
  updatedAt: DateTime!

  options: [ProductOption!]!
  variants: [ProductVariant!]!
  metadata: JSON
}

type ProductOption {
  id: ID!
  product: Product!
  name: String!
  type: String!
  required: Boolean!

  choices: [OptionChoice!]!
}

type OptionChoice {
  id: ID!
  option: ProductOption!
  label: String!
  value: String!
  priceModifier: Float!
}

type ProductVariant {
  id: ID!
  product: Product!
  name: String!
  sku: String
  price: Float!
  inventory: Int!
  attributes: JSON!
}

# Relay connections for pagination
type ProductConnection {
  edges: [ProductEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type ProductEdge {
  cursor: String!
  node: Product!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type Order {
  id: ID!
  store: Store!
  customer: Customer
  orderNumber: String!
  status: OrderStatus!
  createdAt: DateTime!
  updatedAt: DateTime!

  items: [OrderItem!]!
  subtotal: Float!
  deliveryFee: Float!
  discount: Float!
  tax: Float!
  total: Float!

  payment: Payment
  paymentStatus: PaymentStatus!

  deliveryType: DeliveryType!
  deliveryZone: DeliveryZone
  deliveryAddress: Address
  estimatedDeliveryTime: DateTime
  actualDeliveryTime: DateTime

  pickupTime: DateTime

  notes: String
  saasCommission: Float
}

type OrderItem {
  id: ID!
  order: Order!
  product: Product!
  quantity: Int!
  unitPrice: Float!
  totalPrice: Float!
  selectedOptions: JSON
}

type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type OrderEdge {
  cursor: String!
  node: Order!
}

type Customer {
  id: ID!
  store: Store!
  firstName: String
  lastName: String
  email: String
  phone: String!
  registered: Boolean!
  loyaltyPoints: Int!
  loyaltyTier: String!
  createdAt: DateTime!
  updatedAt: DateTime!

  addresses: [Address!]!
  orders: [Order!]!
}

type Address {
  id: ID!
  customer: Customer!
  label: String
  street: String!
  number: String
  postalCode: String!
  city: String!
  country: String!
  isDefault: Boolean!
}

type DeliveryZone {
  id: ID!
  store: Store!
  name: String!
  postalCodes: [String!]
  radius: Int
  deliveryFee: Float!
  minOrder: Float!
  estimatedTime: Int!
  active: Boolean!
}

type OpeningHours {
  id: ID!
  store: Store!
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

type DaySchedule {
  open: String
  close: String
  closed: Boolean!
}

type Payment {
  id: ID!
  order: Order!
  method: PaymentMethod!
  stripeId: String
  bancontactId: String
  amount: Float!
  currency: String!
  status: PaymentStatus!
  processingFee: Float!
  saasCommission: Float!
  netAmount: Float!
  createdAt: DateTime!
  updatedAt: DateTime!

  payout: Payout
}

type PaymentMethod {
  id: ID!
  organization: Organization!
  type: String!
  stripeBankAccount: String
  bancontactAccount: String
  active: Boolean!
  isDefault: Boolean!
}

type Payout {
  id: ID!
  payment: Payment!
  organization: Organization!
  amount: Float!
  currency: String!
  status: String!
  stripePayout: String
  scheduledDate: DateTime!
  completedDate: DateTime
}

type Theme {
  id: ID!
  organization: Organization
  store: Store
  name: String!
  slug: String!
  description: String
  config: JSON!
  status: ThemeStatus!
  createdAt: DateTime!
  updatedAt: DateTime!

  versions: [ThemeVersion!]!
  assets: [ThemeAsset!]!
  activeVersion: ThemeVersion
}

type ThemeVersion {
  id: ID!
  theme: Theme!
  version: String!
  config: JSON!
  customCss: String
  customJs: String
  status: ThemeVersionStatus!
  isActive: Boolean!
  notes: String
  createdBy: String
  createdAt: DateTime!
}

type ThemeAsset {
  id: ID!
  theme: Theme!
  name: String!
  type: String!
  url: String!
  size: Int!
  createdAt: DateTime!
}

type CustomDomain {
  id: ID!
  organization: Organization
  store: Store
  domain: String!
  status: String!
  verificationCode: String
  certificateUrl: String
  certificateExpiry: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Subscription {
  id: ID!
  organization: Organization!
  plan: Plan!
  status: String!
  currentPeriodStart: DateTime!
  currentPeriodEnd: DateTime!
  cancelledAt: DateTime
  stripeId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Plan {
  id: ID!
  name: String!
  displayName: String!
  description: String
  monthlyPrice: Float!
  commissionRate: Float!
  maxStores: Int!
  maxUsers: Int!
  customDomain: Boolean!
  customTheme: Boolean!
  developerMode: Boolean!
}

type Invoice {
  id: ID!
  organization: Organization!
  number: String!
  period: String!
  amount: Float!
  status: String!
  createdAt: DateTime!

  items: [InvoiceItem!]!
}

type InvoiceItem {
  id: ID!
  invoice: Invoice!
  description: String!
  amount: Float!
  quantity: Int!
}

# ==========================================
# AUTH TYPES
# ==========================================

type AuthPayload {
  accessToken: String!
  refreshToken: String!
  expiresIn: Int!
  user: User!
}

type AuthResponse {
  success: Boolean!
  message: String
  userId: String
}

# ==========================================
# STATS TYPES
# ==========================================

type StoreStats {
  storeId: ID!
  period: String!
  ordersCount: Int!
  ordersTotal: Float!
  averageOrderValue: Float!
  topProducts: [ProductStat!]!
  customerCount: Int!
  newCustomers: Int!
  conversionRate: Float!
}

type ProductStat {
  productId: ID!
  name: String!
  ordersCount: Int!
  revenue: Float!
}

type OrganizationStats {
  organizationId: ID!
  period: String!
  storesCount: Int!
  ordersCount: Int!
  ordersTotal: Float!
  storeStats: [StoreStats!]!
  revenue: Float!
  commission: Float!
}

# ==========================================
# ROOT TYPES
# ==========================================

type Query {
  # Auth
  me: User!
  organizations: [Organization!]!
  organization(id: ID!): Organization
  
  # Stores
  stores(organizationId: ID!): [Store!]!
  store(id: ID!): Store
  
  # Products
  products(
    storeId: ID!
    first: Int = 20
    after: String
    categoryId: ID
    search: String
  ): ProductConnection!
  product(id: ID!): Product
  categories(storeId: ID!): [Category!]!
  
  # Orders
  orders(
    storeId: ID!
    first: Int = 20
    after: String
    status: OrderStatus
    from: DateTime
    to: DateTime
  ): OrderConnection!
  order(id: ID!): Order
  
  # Customers
  customers(
    storeId: ID!
    first: Int = 20
    after: String
    search: String
  ): CustomerConnection!
  customer(id: ID!): Customer
  
  # Themes
  theme(id: ID!): Theme
  themeVersions(themeId: ID!): [ThemeVersion!]!
  themeVersion(id: ID!): ThemeVersion
  
  # Stats
  storeStats(
    storeId: ID!
    period: String! # "day", "week", "month"
    from: DateTime
    to: DateTime
  ): StoreStats!
  
  organizationStats(
    organizationId: ID!
    period: String!
    from: DateTime
    to: DateTime
  ): OrganizationStats!
  
  # Domains
  customDomains(organizationId: ID!): [CustomDomain!]!
  
  # Payments
  paymentMethods(organizationId: ID!): [PaymentMethod!]!
  
  # Invoices
  invoices(organizationId: ID!): [Invoice!]!
  invoice(id: ID!): Invoice
}

type Mutation {
  # ==========================================
  # AUTH
  # ==========================================
  
  signup(input: SignupInput!): AuthResponse!
  login(input: LoginInput!): AuthPayload!
  refresh(refreshToken: String!): AuthPayload!
  logout: Boolean!
  verifyEmail(token: String!): Boolean!
  resendVerificationEmail(email: String!): Boolean!
  forgotPassword(email: String!): Boolean!
  resetPassword(token: String!, newPassword: String!): Boolean!
  
  # ==========================================
  # ORGANIZATIONS
  # ==========================================
  
  createOrganization(input: CreateOrganizationInput!): Organization!
  updateOrganization(
    id: ID!
    input: UpdateOrganizationInput!
  ): Organization!
  
  # ==========================================
  # STORES
  # ==========================================
  
  createStore(
    organizationId: ID!
    input: CreateStoreInput!
  ): Store!
  
  updateStore(
    id: ID!
    input: UpdateStoreInput!
  ): Store!
  
  deleteStore(id: ID!): Boolean!
  
  # ==========================================
  # PRODUCTS & CATALOG
  # ==========================================
  
  createProduct(
    storeId: ID!
    input: CreateProductInput!
  ): Product!
  
  updateProduct(
    id: ID!
    input: UpdateProductInput!
  ): Product!
  
  deleteProduct(id: ID!): Boolean!
  
  createCategory(
    storeId: ID!
    input: CreateCategoryInput!
  ): Category!
  
  updateCategory(
    id: ID!
    input: UpdateCategoryInput!
  ): Category!
  
  deleteCategory(id: ID!): Boolean!
  
  # ==========================================
  # ORDERS
  # ==========================================
  
  createOrder(
    storeId: ID!
    input: CreateOrderInput!
  ): Order!
  
  updateOrderStatus(
    id: ID!
    status: OrderStatus!
  ): Order!
  
  acceptOrder(id: ID!, estimatedTime: Int!): Order!
  rejectOrder(id: ID!, reason: String): Order!
  
  # ==========================================
  # PAYMENTS
  # ==========================================
  
  initiatePayment(
    orderId: ID!
    method: String!
  ): PaymentIntent!
  
  confirmPayment(
    paymentId: String!
  ): Payment!
  
  # ==========================================
  # CUSTOMERS
  # ==========================================
  
  createCustomer(
    storeId: ID!
    input: CreateCustomerInput!
  ): Customer!
  
  updateCustomer(
    id: ID!
    input: UpdateCustomerInput!
  ): Customer!
  
  addCustomerAddress(
    customerId: ID!
    input: CreateAddressInput!
  ): Address!
  
  # ==========================================
  # THEMES
  # ==========================================
  
  createTheme(
    organizationId: ID
    storeId: ID
    input: CreateThemeInput!
  ): Theme!
  
  updateTheme(
    id: ID!
    input: UpdateThemeInput!
  ): Theme!
  
  createThemeVersion(
    themeId: ID!
    input: CreateThemeVersionInput!
  ): ThemeVersion!
  
  publishThemeVersion(id: ID!): ThemeVersion!
  rollbackTheme(themeId: ID!, toVersionId: ID!): Theme!
  
  duplicateThemeVersion(
    fromVersionId: ID!
    newVersion: String!
  ): ThemeVersion!
  
  importDesign(
    storeId: ID!
    input: ImportDesignInput!
  ): Theme!
  
  # ==========================================
  # USERS & PERMISSIONS
  # ==========================================
  
  inviteUser(
    organizationId: ID!
    input: InviteUserInput!
  ): Membership!
  
  updateMembership(
    id: ID!
    input: UpdateMembershipInput!
  ): Membership!
  
  revokeMembership(id: ID!): Boolean!
  
  # ==========================================
  # DOMAINS
  # ==========================================
  
  addCustomDomain(
    storeId: ID
    organizationId: ID
    domain: String!
  ): CustomDomain!
  
  verifyCustomDomain(id: ID!): CustomDomain!
  
  removeCustomDomain(id: ID!): Boolean!
  
  # ==========================================
  # PAYMENT METHODS
  # ==========================================
  
  addPaymentMethod(
    organizationId: ID!
    input: AddPaymentMethodInput!
  ): PaymentMethod!
  
  updatePaymentMethod(
    id: ID!
    input: UpdatePaymentMethodInput!
  ): PaymentMethod!
  
  removePaymentMethod(id: ID!): Boolean!
}

# ==========================================
# INPUT TYPES
# ==========================================

input SignupInput {
  email: String!
  password: String!
  firstName: String!
  lastName: String!
}

input LoginInput {
  email: String!
  password: String!
}

input CreateOrganizationInput {
  name: String!
  legalName: String
  description: String
  logo: Upload
  taxId: String
  email: String
  phone: String
  website: String
  locale: String
  timezone: String
  currency: String
}

input UpdateOrganizationInput {
  name: String
  description: String
  logo: Upload
  phone: String
  website: String
}

input CreateStoreInput {
  name: String!
  slug: String!
  description: String
  address: String
  postalCode: String
  city: String
  phone: String
  email: String
  sector: String!
}

input UpdateStoreInput {
  name: String
  description: String
  address: String
  phone: String
  email: String
}

input CreateProductInput {
  categoryId: ID!
  name: String!
  slug: String
  description: String
  image: Upload
  basePrice: Float!
  discountPrice: Float
  inventory: Int
  sku: String
}

input UpdateProductInput {
  categoryId: ID
  name: String
  description: String
  image: Upload
  basePrice: Float
  discountPrice: Float
  inventory: Int
}

input CreateCategoryInput {
  name: String!
  slug: String
  description: String
  image: Upload
}

input UpdateCategoryInput {
  name: String
  description: String
  image: Upload
}

input CreateOrderInput {
  customerId: ID
  items: [OrderItemInput!]!
  deliveryType: DeliveryType!
  deliveryZoneId: ID
  deliveryAddress: CreateAddressInput
  pickupTime: DateTime
  notes: String
}

input OrderItemInput {
  productId: ID!
  quantity: Int!
  selectedOptions: JSON
}

input CreateAddressInput {
  label: String
  street: String!
  number: String
  postalCode: String!
  city: String!
  country: String
}

input CreateCustomerInput {
  firstName: String
  lastName: String
  email: String
  phone: String!
}

input UpdateCustomerInput {
  firstName: String
  lastName: String
  email: String
  phone: String
}

input CreateThemeInput {
  name: String!
  slug: String
  description: String
  config: JSON!
}

input UpdateThemeInput {
  name: String
  description: String
  config: JSON
  customCss: String
  customJs: String
}

input CreateThemeVersionInput {
  version: String!
  config: JSON!
  customCss: String
  customJs: String
  notes: String
}

input ImportDesignInput {
  websiteUrl: String!
}

input InviteUserInput {
  email: String!
  role: Role!
  storeIds: [ID!]
}

input UpdateMembershipInput {
  role: Role
  storeIds: [ID!]
}

input AddPaymentMethodInput {
  type: String!
  stripeBankAccount: String
  bancontactAccount: String
}

input UpdatePaymentMethodInput {
  stripeBankAccount: String
  bancontactAccount: String
  isDefault: Boolean
}

# ==========================================
# PAYMENT TYPES
# ==========================================

type PaymentIntent {
  id: String!
  clientSecret: String!
  status: String!
  method: String!
}

type CustomerConnection {
  edges: [CustomerEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type CustomerEdge {
  cursor: String!
  node: Customer!
}

enum ProductStatus {
  ACTIVE
  INACTIVE
  ARCHIVED
}

enum StoreStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

# ==========================================
# SUBSCRIPTIONS (Real-time)
# ==========================================

type Subscription {
  orderCreated(storeId: ID!): Order!
  orderStatusChanged(storeId: ID!): Order!
  paymentReceived(storeId: ID!): Payment!
}
```

---

## 3. RESOLVERS PRINCIPAUX

### Exemple: Order Resolvers

```typescript
// resolvers/order.ts

export const orderResolvers = {
  Query: {
    orders: requireAuthGuard(
      async (parent, args, context) => {
        const { user, prisma } = context;

        // Vérify user can access store
        const hasAccess = user.organizations.some((org) =>
          org.stores.includes(args.storeId)
        );

        if (!hasAccess) {
          throw new GraphQLError('Access denied');
        }

        // Build where clause
        const where: any = {
          storeId: args.storeId,
        };

        if (args.status) {
          where.status = args.status;
        }

        if (args.from || args.to) {
          where.createdAt = {};
          if (args.from) where.createdAt.gte = args.from;
          if (args.to) where.createdAt.lte = args.to;
        }

        // Count total
        const totalCount = await prisma.order.count({ where });

        // Get paginated results
        const orders = await prisma.order.findMany({
          where,
          take: args.first,
          skip: args.after ? 1 : 0,
          orderBy: { createdAt: 'desc' },
          include: {
            items: true,
            customer: true,
            payment: true,
            deliveryZone: true,
          },
        });

        return {
          edges: orders.map((order, index) => ({
            cursor: Buffer.from(String(index)).toString('base64'),
            node: order,
          })),
          pageInfo: {
            hasNextPage: args.first ? orders.length === args.first : false,
            hasPreviousPage: !!args.after,
            endCursor:
              orders.length > 0
                ? Buffer.from(String(orders.length - 1)).toString('base64')
                : null,
          },
          totalCount,
        };
      }
    ),

    order: requireAuthGuard(async (parent, args, context) => {
      const { user, prisma } = context;

      const order = await prisma.order.findUnique({
        where: { id: args.id },
        include: {
          items: { include: { product: true } },
          customer: true,
          payment: true,
          store: { include: { organization: true } },
        },
      });

      if (!order) {
        throw new GraphQLError('Order not found');
      }

      // Verify user can access
      const hasAccess = user.organizations.some(
        (org) => org.id === order.store.organizationId &&
        org.stores.includes(order.storeId)
      );

      if (!hasAccess) {
        throw new GraphQLError('Access denied');
      }

      return order;
    }),
  },

  Mutation: {
    createOrder: requireAuthGuard(
      async (parent, args, context) => {
        const { user, prisma } = context;

        // Verify store exists and user can access
        const store = await prisma.store.findFirst({
          where: {
            id: args.storeId,
            organization: {
              memberships: {
                some: { userId: user.sub },
              },
            },
          },
        });

        if (!store) {
          throw new GraphQLError('Store not found or access denied');
        }

        // Create customer if provided
        let customerId = args.input.customerId;
        if (!customerId && args.input.email) {
          const customer = await prisma.customer.create({
            data: {
              storeId: args.storeId,
              email: args.input.email,
              firstName: args.input.firstName,
              lastName: args.input.lastName,
              phone: args.input.phone,
            },
          });
          customerId = customer.id;
        }

        // Calculate totals
        const items = await Promise.all(
          args.input.items.map(async (item) => {
            const product = await prisma.product.findUnique({
              where: { id: item.productId },
            });

            if (!product) {
              throw new GraphQLError(
                `Product ${item.productId} not found`
              );
            }

            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: product.discountPrice || product.basePrice,
              totalPrice:
                (product.discountPrice || product.basePrice) *
                item.quantity,
              selectedOptions: item.selectedOptions,
            };
          })
        );

        const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

        // Get delivery fee
        let deliveryFee = 0;
        if (args.input.deliveryType === 'DELIVERY') {
          const zone = await prisma.deliveryZone.findUnique({
            where: { id: args.input.deliveryZoneId! },
          });
          if (!zone) {
            throw new GraphQLError('Delivery zone not found');
          }
          deliveryFee = zone.deliveryFee;
        }

        // Create order
        const order = await prisma.order.create({
          data: {
            storeId: args.storeId,
            customerId,
            orderNumber: `ORD-${Date.now()}`,
            status: 'PENDING',
            deliveryType: args.input.deliveryType,
            deliveryZoneId: args.input.deliveryZoneId,
            pickupTime: args.input.pickupTime,
            notes: args.input.notes,
            subtotal,
            deliveryFee,
            discount: 0,
            tax: 0,
            total: subtotal + deliveryFee,
            paymentStatus: 'PENDING',
            items: {
              create: items,
            },
          },
          include: {
            items: { include: { product: true } },
            customer: true,
          },
        });

        // Emit event for notifications
        // await pubsub.publish('ORDER_CREATED', { orderId: order.id });

        // Send notifications
        // await notificationService.sendOrderCreated(order);

        return order;
      }
    ),

    acceptOrder: requirePermissionGuard('orders:write')(
      async (parent, args, context) => {
        const { user, prisma } = context;

        const order = await prisma.order.findUnique({
          where: { id: args.id },
          include: { store: true },
        });

        if (!order) {
          throw new GraphQLError('Order not found');
        }

        // Verify access
        const hasAccess = user.organizations.some((org) =>
          org.stores.includes(order.storeId)
        );

        if (!hasAccess) {
          throw new GraphQLError('Access denied');
        }

        if (order.status !== 'PENDING') {
          throw new GraphQLError('Order is not pending');
        }

        // Update order
        const updated = await prisma.order.update({
          where: { id: args.id },
          data: {
            status: 'ACCEPTED',
            // Estimé delivery/pickup time
            ...(order.deliveryType === 'CLICK_AND_COLLECT' && {
              pickupTime: new Date(
                Date.now() + args.estimatedTime * 60000
              ),
            }),
            ...(order.deliveryType === 'DELIVERY' && {
              estimatedDeliveryTime: new Date(
                Date.now() + args.estimatedTime * 60000
              ),
            }),
          },
          include: {
            items: { include: { product: true } },
            customer: true,
          },
        });

        // Send notifications
        // await notificationService.sendOrderAccepted(updated);

        return updated;
      }
    ),

    rejectOrder: requirePermissionGuard('orders:write')(
      async (parent, args, context) => {
        const { user, prisma } = context;

        const order = await prisma.order.findUnique({
          where: { id: args.id },
        });

        if (!order) {
          throw new GraphQLError('Order not found');
        }

        if (order.status !== 'PENDING') {
          throw new GraphQLError('Only pending orders can be rejected');
        }

        const updated = await prisma.order.update({
          where: { id: args.id },
          data: { status: 'REJECTED' },
          include: {
            items: { include: { product: true } },
            customer: true,
          },
        });

        return updated;
      }
    ),
  },

  Order: {
    customer: async (parent, args, context) => {
      return context.loaders.customerLoader.load(parent.customerId);
    },
    items: async (parent, args, context) => {
      return context.prisma.orderItem.findMany({
        where: { orderId: parent.id },
      });
    },
  },
};
```

---

## 4. CONTEXT SETUP

```typescript
// graphql/context.ts

import DataLoader from 'dataloader';
import { prisma } from '@/lib/prisma';

export interface GraphQLContext {
  user?: UserPayload;
  prisma: typeof prisma;
  loaders: {
    storeLoader: DataLoader<string, Store | undefined>;
    productLoader: DataLoader<string, Product | undefined>;
    customerLoader: DataLoader<string, Customer | undefined>;
    categoryLoader: DataLoader<string, Category | undefined>;
  };
}

export const createContext = async (req: Request): Promise<GraphQLContext> => {
  // Extract and verify JWT
  let user: UserPayload | undefined;
  const authHeader = req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      user = jwt.verify(token, process.env.JWT_SECRET!) as UserPayload;
    } catch (error) {
      // Token invalid
    }
  }

  // Create dataloaders
  const loaders = {
    storeLoader: new DataLoader(async (storeIds) => {
      const stores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
      });
      return storeIds.map((id) => stores.find((s) => s.id === id));
    }),

    productLoader: new DataLoader(async (productIds) => {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
      });
      return productIds.map((id) => products.find((p) => p.id === id));
    }),

    customerLoader: new DataLoader(async (customerIds) => {
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
      });
      return customerIds.map((id) => customers.find((c) => c.id === id));
    }),

    categoryLoader: new DataLoader(async (categoryIds) => {
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      });
      return categoryIds.map((id) => categories.find((c) => c.id === id));
    }),
  };

  return {
    user,
    prisma,
    loaders,
  };
};
```

---

## 5. ERROR HANDLING

```typescript
// graphql/error-handler.ts

export const formatError = (error: GraphQLError) => {
  // Extract original error if nested
  const originalError = error.originalError;

  // Map common errors to GraphQL errors
  if (originalError instanceof Prisma.NotFoundError) {
    return {
      message: 'Resource not found',
      extensions: { code: 'NOT_FOUND' },
    };
  }

  if (originalError instanceof Prisma.ValidationError) {
    return {
      message: 'Validation error',
      extensions: {
        code: 'VALIDATION_ERROR',
        details: originalError.message,
      },
    };
  }

  if (originalError instanceof Prisma.UniqueConstraintError) {
    return {
      message: 'Resource already exists',
      extensions: { code: 'CONFLICT' },
    };
  }

  // Default error
  return {
    message: error.message,
    extensions: {
      code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
    },
  };
};
```

---

## RÉSUMÉ API GRAPHQL

| Aspect | Détail |
|--------|--------|
| **Framework** | GraphQL Yoga |
| **Authentication** | JWT Bearer tokens |
| **Authorization** | Guards + RBAC matrix |
| **N+1 Prevention** | DataLoaders |
| **Pagination** | Relay cursor-based |
| **Real-time** | Subscriptions (WebSocket) |
| **Validation** | Zod schemas |
| **Error Handling** | Standardized GraphQL errors |
| **Performance** | Query optimization, batching |

---

**PROCHAINE ÉTAPE** : Paiements (Stripe + Bancontact) ? 👉
