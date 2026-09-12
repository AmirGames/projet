# Super Admin (Super Owner) System Guide

## Overview
A comprehensive administrative system has been implemented to manage the entire platform as a super_owner. This includes merchant management, support tickets, commission tracking, and system configuration.

## Features Implemented

### 1. Dashboard (`/super-admin`)
**Main entry point for super_owner**
- Real-time statistics overview:
  - Active merchants count
  - Total stores and orders
  - Total platform revenue
  - Open support tickets
  - Platform fee percentage
- Maintenance mode status indicator
- Quick action buttons to main admin areas

### 2. Merchant Management (`/super-admin/merchants`)
**Full control over all merchants/organizations**

#### List View
- Filter merchants by status: ACTIVE, SUSPENDED, CLOSED
- Search merchants by name or slug
- View merchant plan (FREE, PREMIUM, PRO)
- See number of stores per merchant
- Quick actions:
  - Suspend/Activate merchant (Lock/Unlock button)
  - View full details (Edit button)

#### Merchant Detail Page (`/super-admin/merchants/[id]`)
- **Merchant Information**
  - Name, slug, tier, status
  - Change status (ACTIVE → SUSPENDED → CLOSED)
  - Upgrade/downgrade plan (FREE ↔ PREMIUM ↔ PRO)

- **Statistics**
  - Total revenue generated
  - Platform commission earned
  - Total orders count

- **Stores List**
  - View all stores owned by merchant
  - See store IDs and names

- **Team Members**
  - View all team members with roles
  - See admin, manager, and staff accounts

- **Recent Tickets**
  - Display merchant's latest support tickets
  - Quick status indicator for issues

### 3. Support Tickets Management (`/super-admin/tickets`)
**Handle all merchant support requests**

#### Features
- **Filter by Status**
  - OPEN: New issues from merchants
  - IN_PROGRESS: Being worked on
  - RESOLVED: Fixed, pending closure
  - CLOSED: Completed issues

- **Priority Levels**
  - LOW: General inquiries
  - MEDIUM: Standard issues
  - HIGH: Urgent problems
  - CRITICAL: Platform-affecting issues

- **Ticket Details**
  - Title and full description
  - Merchant/organization name
  - Category (TECHNICAL, BILLING, ACCOUNT, OTHER)
  - Creation date
  - Status and priority badges

#### Actions
- Update ticket status to track resolution
- Assign priority levels
- See ticket resolution timeline
- Leave tickets open until fully resolved

### 4. Commission & Analytics (`/super-admin/analytics`)
**Monitor revenue and merchant performance**

#### Key Metrics
- **Total Commission**: Sum of all platform fees collected
- **Average Commission**: Commission per billing period
- **Monthly Trend**: Growth/decline percentage month-over-month
- Trend indicator (📈 up or 📉 down)

#### Monthly Breakdown
- Commission amount per period
- Revenue generated
- Number of orders processed
- Month-over-month change percentage
- Sort by date (newest first)

#### Top Merchants
- Ranked by total revenue
- Show revenue and order count
- Performance insights

### 5. System Configuration (`/super-admin/settings`)
**Control platform-wide settings**

#### Commission & Fees
- **Platform Fee Percentage**: 0-100% commission on each order
  - Default: 5%
  - Applied to all merchants
  - Example: 5% commission = €5 per €100 order

- **Order Amount Limits**
  - Minimum order amount (€)
  - Maximum order amount (€)
  - Enforce business rules across platform

#### Maintenance Mode
- **Toggle maintenance mode** ON/OFF
  - Disable during platform updates
  - Display custom message to users
  - Optional maintenance message:
    - Explain what's happening
    - Expected restoration time
    - Alternative contact info

#### Settings Save
- Real-time saving with confirmation
- Audit trail of all changes
- Immediate effect across platform

## Database Schema

### New Models

#### SystemConfig
```
- platformFeePercent: Decimal (5.2)
- minOrderAmount: Decimal (10.2)
- maxOrderAmount: Decimal (10.2)
- maintenanceMode: Boolean
- maintenanceMessage: String (optional)
- settings: Json
```

#### MerchantTicket
```
- id: String (CUID)
- orgId: String (FK to Organization)
- title: String
- description: String
- status: String (OPEN|IN_PROGRESS|RESOLVED|CLOSED)
- priority: String (LOW|MEDIUM|HIGH|CRITICAL)
- category: String (TECHNICAL|BILLING|ACCOUNT|OTHER)
- createdAt: DateTime
- resolvedAt: DateTime (optional)
```

#### CommissionHistory
```
- id: String (CUID)
- orgId: String (FK to Organization)
- amount: Decimal (10.2) - total commission
- percentage: Decimal (5.2) - fee percentage applied
- period: String - billing period (e.g., "2024-01")
- ordersCount: Int - number of orders
- totalRevenue: Decimal (10.2) - merchant revenue
```

#### SystemAuditLog
```
- id: String (CUID)
- adminId: String (FK to User)
- action: String - what was done
- target: String - which merchant/component
- changes: Json - what changed
- createdAt: DateTime
```

### Modified Models

#### User
```
+ isSystemAdmin: Boolean (default: false)
```

#### Organization
```
+ status: String (ACTIVE|SUSPENDED|CLOSED)
+ tickets: MerchantTicket[]
+ commissionHistory: CommissionHistory[]
```

## API Endpoints

### Admin Routes (`/api/admin`)

#### System Configuration
- `GET /api/admin/config` - Get system settings
- `PUT /api/admin/config` - Update system settings

#### Merchants Management
- `GET /api/admin/merchants` - List all merchants (with filters)
- `GET /api/admin/merchants/:orgId` - Get merchant details
- `PATCH /api/admin/merchants/:orgId` - Update merchant status/tier

#### Tickets
- `GET /api/admin/tickets` - List all tickets (with filters)
- `PATCH /api/admin/tickets/:ticketId` - Update ticket status

#### Statistics & Analytics
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/commissions` - Commission history
- `GET /api/admin/audit-logs` - Admin action logs

## Security

### Authentication
- All admin routes require Bearer token
- `authMiddleware` validates JWT token
- `isSystemAdmin` middleware checks admin status

### Authorization
- Only users with `isSystemAdmin = true` can access admin routes
- Returns 403 FORBIDDEN if not authorized
- Audit log tracks all admin actions

### Audit Trail
- Every admin action is logged:
  - Who performed action
  - What action was performed
  - Which merchant/resource affected
  - What changes were made
- Accessible via `/super-admin/audit-logs` (backend endpoint)

## How to Set Up Super Admin

### 1. Make User a Super Admin (Backend)
```sql
UPDATE "User" 
SET "isSystemAdmin" = true 
WHERE "email" = 'admin@example.com';
```

Or via Prisma:
```typescript
await db.user.update({
  where: { email: 'admin@example.com' },
  data: { isSystemAdmin: true }
});
```

### 2. Access Super Admin Panel
- Navigate to `http://localhost:3000/super-admin`
- Login with super_owner credentials
- Dashboard appears with full admin access

### 3. Configure Platform
- Set commission percentage in Settings
- Configure order amount limits
- Set up maintenance mode if needed

## Workflow Examples

### Scenario 1: Managing a Problematic Merchant

1. Go to `/super-admin/merchants`
2. Search for merchant name
3. Click "Edit" button
4. Review merchant details:
   - Check revenue and order count
   - View team members
   - See recent support tickets
5. If needed:
   - Click "Lock" button to SUSPEND
   - Or update tier to FREE if needed
   - Or contact via support ticket tracking

### Scenario 2: Handling a Support Ticket

1. Go to `/super-admin/tickets`
2. Filter by OPEN status
3. Click ticket to view details
4. Read title and description
5. Change status:
   - Set to IN_PROGRESS while investigating
   - Set to RESOLVED when fixed
   - Set to CLOSED for final close
6. Update priority if needed
7. Click "Mettre à jour" to save

### Scenario 3: Platform-Wide Commission Change

1. Go to `/super-admin/settings`
2. Change "Commission platforme (%)" from 5 to 7
3. Click "Sauvegarder les paramètres"
4. Confirmation message appears
5. All new orders now use 7% commission
6. Previous months keep their original percentage

### Scenario 4: Temporary Platform Maintenance

1. Go to `/super-admin/settings`
2. Check "Activer le mode maintenance"
3. Enter message: "Maintenance until 3 PM CET"
4. Click save
5. All users see maintenance message
6. When done: uncheck and save to restore normal operation

## Metrics to Monitor

### Key Performance Indicators
- **Active Merchants**: Growing = healthy platform
- **Total Orders**: Indicator of platform usage
- **Revenue**: Total money flowing through platform
- **Commission**: Your revenue (platformFeePercent × totalRevenue)
- **Open Tickets**: Problem areas to address

### Health Checks
- Review suspended merchants regularly
- Monitor high-priority tickets
- Track commission trends month-to-month
- Watch for merchant churn

## Future Enhancements

Potential features to add:
- Bulk merchant actions
- Automated commission calculations (scheduled jobs)
- Email notifications for critical tickets
- Merchant performance reports
- Revenue forecasting
- Advanced filtering and exports
- Merchant onboarding workflows
- Automated account suspension for rule violations

## Troubleshooting

### Can't access super-admin
- Check `isSystemAdmin` flag is true
- Verify JWT token is valid
- Check browser console for 403 errors

### Statistics not updating
- Page auto-refreshes on navigation
- Manually refresh page (F5)
- Check network tab for failed requests

### Commission calculations wrong
- Verify `platformFeePercent` is set correctly
- Check order amount is not below `minOrderAmount`
- Commission = order amount × fee % ÷ 100

---

**Version**: 1.0
**Last Updated**: 2024
**System**: Super Admin Management Platform
