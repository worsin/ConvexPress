# Shopping Cart - Action Plan

> **Strategic Implementation Order for All Systems**
>
> This document defines the phased implementation approach for all 27 systems mapped in Airtable. Each system's PRD will be created referencing this plan, ensuring all integrations and dependencies are considered from the start.

---

## Overview

| Metric | Count |
|--------|-------|
| Total Systems | 27 |
| P0 Critical | 12 |
| P1 High | 10 |
| P2 Medium | 5 |
| Total Routes | 49 |
| Roles | 6 |

### Implementation Philosophy

**Build with the future in mind.** When creating a PRD for any system:

1. **Reference this Action Plan** - Know what's coming and design for it
2. **Include integration points** - Even if the dependent system isn't built yet, define the hooks
3. **Event-driven architecture** - Every action emits events; other systems listen
4. **Schema-first design** - Define data structures considering all future relationships

### Example: Product Detail Page

When building the Product Catalog PRD, consider:
- Reviews & Ratings (Phase 5) → Reserve space for review display, average rating
- Wishlist (Phase 5) → Add wishlist button placeholder/hook
- Product Variants (Phase 3) → Variant selector component
- Inventory (Phase 3) → Stock status display
- Shopping Cart (Phase 3) → Add to cart with quantity

---

## Dependency Graph

```
Phase 0: Foundation
├── Authentication System (PLT-AUT)
└── Event System (PLT-EVT)

Phase 1: Core Infrastructure
├── Media Library (PLT-MED) ← Auth
├── Payment System (PAY-STR) ← Auth
├── Role & Permission System (PLT-ROL) ← Auth
├── Customer Accounts (USR-ACT) ← Auth
├── Email Notification System (COM-EML) ← Event
└── Site Notification System (COM-NOT) ← Event, Auth

Phase 2: Configuration & Catalog Foundation
├── Airtable Sync System (PLT-SYN) ← Email, Roles
├── Tax Calculation (PAY-TAX) ← Airtable Sync
└── Product Catalog (CAT-PRD) ← Media, Airtable Sync

Phase 3: Product Ecosystem & Commerce Core
├── Category System (CAT-CAT) ← Products
├── Product Variants (CAT-VAR) ← Products
├── Inventory System (INV-STK) ← Products
├── Search System (PLT-SRC) ← Products
└── Shopping Cart (ORD-CRT) ← Products, Auth

Phase 4: Checkout & Orders
├── Checkout System (ORD-CHK) ← Cart, Payment, Inventory, Tax, Accounts
├── Order Management (ORD-MGT) ← Checkout, Payment, Inventory
├── Shipping & Fulfillment (FUL-SHP) ← Orders, Inventory
└── Discounts & Coupons (MKT-DSC) ← Cart, Products

Phase 5: Post-Order & Engagement
├── Returns & Refunds (SUP-RTN) ← Orders, Payment, Inventory
├── Wishlist System (USR-WSH) ← Accounts, Products
├── Reviews & Ratings (CON-REV) ← Accounts, Products, Orders
└── Customer Support (SUP-TKT) ← Accounts, Orders

Phase 6: Admin & Analytics
├── Admin Dashboard (ADM-DSH) ← Auth, Roles, Orders, Inventory
├── Analytics & Reporting (ADM-RPT) ← Orders, Products, Accounts
└── Testing & Debug Tools (ADM-TST) ← Event, Roles
```

---

## Phase 0: Foundation

> **Goal:** Establish the absolute core infrastructure that everything else builds upon.

### 0.1 Authentication System (PLT-AUT)

| Attribute | Value |
|-----------|-------|
| System Code | PLT-AUT |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | Platform Infrastructure |
| Layer | Full Stack |
| Dependencies | None |
| Depended On By | Media, Payment, Notifications, Dashboard, Roles, Accounts, Cart |

**Scope:**
- Clerk or Convex Auth integration
- Login/register flows with email/password
- Password reset flow
- Email verification
- Session management
- Route protection middleware
- Guest user handling (for checkout)

**Routes (4):**
- `/auth/signin` - Sign In
- `/auth/signup` - Sign Up
- `/auth/forgot-password` - Forgot Password
- `/auth/reset-password` - Reset Password

**PRD Considerations:**
- Design auth state to support guest checkout (Phase 4)
- User identity will link to: accounts, orders, wishlists, reviews, support tickets
- Roles table structure (customer, staff, manager, admin) defined here
- OAuth providers (Google, Apple) as optional enhancement

---

### 0.2 Event System (PLT-EVT)

| Attribute | Value |
|-----------|-------|
| System Code | PLT-EVT |
| Priority | P0 - Critical |
| Complexity | Complex |
| Category | Platform Infrastructure |
| Layer | Backend |
| Dependencies | None |
| Depended On By | Email, Site Notifications, Testing Tools |

**Scope:**
- Central `dispatchEvent()` helper function
- Event types enumeration (synced from Airtable)
- Event listeners for email, notifications, analytics
- Event log table for audit trail
- Admin route to view event history

**Routes (1):**
- `/admin/system/events` - Event Log Viewer (Admin only)

**PRD Considerations:**
- Every action in the system will flow through events
- Define standard event payload schema
- Consider event batching for high-volume scenarios
- Event types from Airtable: 40+ event types across all systems
- This is the backbone for all automated responses (emails, notifications)

**Critical Event Categories:**
| Category | Example Events |
|----------|----------------|
| Auth | user_registered, user_logged_in, password_reset_requested |
| Cart | item_added_to_cart, cart_abandoned |
| Order | order_placed, order_shipped, order_delivered |
| Payment | payment_succeeded, payment_failed, refund_processed |
| Inventory | stock_low, stock_depleted, stock_replenished |
| Review | review_submitted, review_approved |
| Support | ticket_created, ticket_resolved |

---

## Phase 1: Core Infrastructure

> **Goal:** Build the services that enable core commerce functionality.

### 1.1 Media Library (PLT-MED)

| Attribute | Value |
|-----------|-------|
| System Code | PLT-MED |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | Platform Infrastructure |
| Layer | Backend |
| Dependencies | Authentication |
| Depended On By | Product Catalog |

**Scope:**
- UploadThing or Convex file storage integration
- Image upload component (drag-drop, multi-file)
- Image optimization on upload (resize, compress)
- CDN delivery
- Admin media library browser
- Image gallery management for products

**Routes (1):**
- `/admin/media` - Media Library Browser

**PRD Considerations:**
- Product images (multiple per product with ordering)
- Category images (hero images for category pages)
- Review photos (user-uploaded review images - Phase 5)
- Marketing banners (promotional content)
- Define image size variants (thumbnail, medium, large, original)

---

### 1.2 Payment System (PAY-STR)

| Attribute | Value |
|-----------|-------|
| System Code | PAY-STR |
| Priority | P0 - Critical |
| Complexity | Complex |
| Category | Billing & Payments |
| Layer | Full Stack |
| Dependencies | Authentication |
| Depended On By | Checkout, Order Management, Returns |

**Scope:**
- Stripe integration (primary processor)
- Payment intent creation
- Stripe Elements for PCI compliance
- Payment confirmation webhooks
- Saved payment methods for logged-in users
- Admin transaction viewer
- Refund processing

**Routes (2):**
- `/checkout/payment` - Payment Step (shared with Checkout)
- `/admin/settings/payments` - Payment Settings

**PRD Considerations:**
- Guest checkout support (no saved cards)
- Multiple payment methods (cards, Apple Pay, Google Pay)
- Partial refunds for returns (Phase 5)
- Payment failures and retry handling
- Webhook security and idempotency

---

### 1.3 Role & Permission System (PLT-ROL)

| Attribute | Value |
|-----------|-------|
| System Code | PLT-ROL |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | Platform Infrastructure |
| Layer | Full Stack |
| Dependencies | Authentication, Airtable Sync |
| Depended On By | Admin Dashboard, Testing Tools |

**Scope:**
- Roles table with permissions array
- Route permissions (synced from Airtable)
- Permission check middleware
- Admin route to manage roles
- Edit permissions per role
- Assign roles to users

**Roles Defined in Airtable:**
| Role | Level | Type | Description |
|------|-------|------|-------------|
| Guest | 0 | Customer | Unauthenticated visitor |
| Customer | 10 | Customer | Registered user (default) |
| Staff | 50 | Internal | Store staff |
| Manager | 80 | Internal | Store manager |
| Admin | 100 | Internal | Full access |
| System | 999 | System | Automated operations |

**Routes (1):**
- `/admin/settings/roles` - Roles & Permissions Management

**PRD Considerations:**
- Route-level permissions (who can access what pages)
- Action-level permissions (who can do what operations)
- All 49 routes have role assignments in Airtable
- Consider permission inheritance (Manager inherits Staff)

---

### 1.4 Customer Accounts (USR-ACT)

| Attribute | Value |
|-----------|-------|
| System Code | USR-ACT |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | User & Auth |
| Layer | Full Stack |
| Dependencies | Authentication |
| Depended On By | Checkout, Wishlist, Reviews, Support, Analytics |

**Scope:**
- User profile management (name, email)
- Account dashboard with overview
- Address book management (multiple addresses)
- Account settings page
- Admin customer list and detail views
- GDPR account deletion support

**Routes (6):**
- `/auth/signup` - Sign Up (shared with Auth)
- `/account` - Account Dashboard
- `/account/settings` - Account Settings
- `/account/addresses` - Address Book
- `/admin/customers` - Customer List
- `/admin/customers/:id` - Customer Detail

**PRD Considerations:**
- Addresses used by Checkout (Phase 4) for shipping/billing
- Order history display (populated by Order Management, Phase 4)
- Wishlist tab placeholder (Phase 5)
- Support tickets tab placeholder (Phase 5)
- Tax-exempt flag for B2B customers

---

### 1.5 Email Notification System (COM-EML)

| Attribute | Value |
|-----------|-------|
| System Code | COM-EML |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | Support & Communication |
| Layer | Full Stack |
| Dependencies | Event System, Airtable Sync |
| Depended On By | (All systems use email) |

**Scope:**
- Email templates table (synced from Airtable)
- Email queue with Resend/SendGrid integration
- Triggered by Event System listeners
- Admin template management
- Send history and analytics
- Toggle notifications on/off

**Routes (1):**
- `/admin/settings/emails` - Email Template Management

**Email Notifications Mapped (43 total):**
| Category | Count | Examples |
|----------|-------|----------|
| Order | 8 | Order confirmation, shipped, delivered, cancelled |
| Auth | 4 | Welcome, password reset, email verification |
| Review | 5 | Review request, approved, flagged |
| Support | 5 | Ticket created, reply, resolved |
| Inventory | 3 | Back in stock, low stock alert |
| Payment | 3 | Payment failed, refund processed |
| Cart | 1 | Abandoned cart reminder |
| Wishlist | 2 | Price drop, back in stock |

**PRD Considerations:**
- Template variables ({{customer_name}}, {{order_number}}, etc.)
- Email preferences per user (opt-out options)
- Email scheduling (delayed sends for abandoned cart)
- Branded email design system

---

### 1.6 Site Notification System (COM-NOT)

| Attribute | Value |
|-----------|-------|
| System Code | COM-NOT |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Support & Communication |
| Layer | Full Stack |
| Dependencies | Event System, Authentication |
| Depended On By | (All systems use notifications) |

**Scope:**
- Notifications table (user, type, message, read status)
- Notification bell with unread count
- Notification center page in account
- Toast component for real-time feedback
- Admin broadcast notifications
- Notification preferences

**Routes (2):**
- `/account/notifications` - Notification Center
- `/admin/settings/notifications` - Notification Templates

**Site Notifications Mapped (47 total):**
| Category | Count | Examples |
|----------|-------|----------|
| Order | 10 | Order placed, shipped, delivered |
| Inventory | 4 | Back in stock, low stock |
| Support | 6 | Ticket updates, replies |
| Review | 4 | Review approved, helpful vote |
| Payment | 2 | Payment failed, refund |
| System | 3 | Sync complete, errors |

**PRD Considerations:**
- Real-time updates via Convex subscriptions
- Toast notifications for immediate feedback
- Persistent notifications in notification center
- Mark as read functionality
- Batch notifications to avoid spam

---

## Phase 2: Configuration & Catalog Foundation

> **Goal:** Sync configuration data and establish product foundation.

### 2.1 Airtable Sync System (PLT-SYN)

| Attribute | Value |
|-----------|-------|
| System Code | PLT-SYN |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Platform Infrastructure |
| Layer | Backend |
| Dependencies | Email, Role & Permission |
| Depended On By | Tax, Product Catalog |

**Scope:**
- One-way sync (Airtable → Convex) for config data
- Sync actions for each config table
- Manual sync trigger in admin
- Sync status/history display
- Scheduled sync option (cron)
- Conflict resolution (Airtable wins)

**Synced Data:**
| Table | Purpose |
|-------|---------|
| Email Templates | Transactional email content |
| Site Notification Templates | In-app notification content |
| Shipping Methods | Available shipping options |
| Tax Rules | Tax rates by jurisdiction |
| Roles | Role definitions and permissions |
| Routes | Route permissions per role |

**Routes (1):**
- `/admin/settings/sync` - Airtable Sync Management

**PRD Considerations:**
- Sync on deploy (initial seed)
- Manual sync for updates
- Audit log of synced records
- Validation before applying changes
- Rollback capability

---

### 2.2 Tax Calculation (PAY-TAX)

| Attribute | Value |
|-----------|-------|
| System Code | PAY-TAX |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Billing & Payments |
| Layer | Full Stack |
| Dependencies | Airtable Sync |
| Depended On By | Checkout |

**Scope:**
- Tax rules table (synced from Airtable)
- Calculate tax at checkout based on shipping address
- Tax-exempt customer flag
- Tax reporting for admin
- Integration option for TaxJar/Avalara

**Routes (1):**
- `/admin/settings/tax` - Tax Rules Management

**PRD Considerations:**
- US sales tax by state/county
- Digital goods tax handling
- Tax-exempt organizations (B2B)
- Tax calculation in cart preview
- Tax reporting by jurisdiction

---

### 2.3 Product Catalog (CAT-PRD)

| Attribute | Value |
|-----------|-------|
| System Code | CAT-PRD |
| Priority | P0 - Critical |
| Complexity | Complex |
| Category | Order & Checkout |
| Layer | Full Stack |
| Dependencies | Media Library, Airtable Sync |
| Depended On By | Cart, Inventory, Wishlist, Reviews, Search, Categories, Variants, Discounts, Analytics |

**Scope:**
- Products table (name, description, price, images, status)
- Product listing page with pagination
- Product detail page
- Admin product list and editor
- SEO metadata per product
- Product status workflow (draft, active, archived)

**Routes (5):**
- `/products` - Product Listing
- `/products/:slug` - Product Detail
- `/admin/products` - Product List (Admin)
- `/admin/products/:id` - Product Editor (Admin)

**PRD Considerations:**

**Must design for future systems:**

| Future System | Design Consideration |
|---------------|---------------------|
| **Categories (Phase 3)** | Category assignment field, many-to-many relationship |
| **Variants (Phase 3)** | Variant relationship, base product vs variant distinction |
| **Inventory (Phase 3)** | Stock count field, low stock threshold |
| **Search (Phase 3)** | Searchable fields index, search weight configuration |
| **Wishlist (Phase 5)** | Wishlist button component hook |
| **Reviews (Phase 5)** | Average rating display, review count |
| **Discounts (Phase 4)** | Discount price display, sale badge |

**Product Schema (Forward-Looking):**
```typescript
products: defineTable({
  // Core fields
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  shortDescription: v.optional(v.string()),

  // Pricing
  price: v.number(),
  compareAtPrice: v.optional(v.number()), // For sale display

  // Media (Phase 1)
  images: v.array(v.id("media")),

  // Categories (Phase 3)
  categoryIds: v.array(v.id("categories")),

  // Inventory (Phase 3)
  stockCount: v.number(),
  lowStockThreshold: v.number(),
  trackInventory: v.boolean(),

  // Variants (Phase 3)
  hasVariants: v.boolean(),

  // Reviews aggregate (Phase 5)
  averageRating: v.optional(v.number()),
  reviewCount: v.number(),

  // Status
  status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),

  // SEO
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

---

## Phase 3: Product Ecosystem & Commerce Core

> **Goal:** Complete the product-related features and enable shopping.

### 3.1 Category System (CAT-CAT)

| Attribute | Value |
|-----------|-------|
| System Code | CAT-CAT |
| Priority | P1 - High |
| Complexity | Simple |
| Category | Content & Marketing |
| Layer | Full Stack |
| Dependencies | Product Catalog |
| Depended On By | (Navigation, Filters) |

**Scope:**
- Categories table with parent reference (hierarchy)
- Category assignment on products (many-to-many)
- Category pages with filtered product grid
- Admin CRUD for categories
- Drag-drop ordering
- Featured category toggle

**Routes (2):**
- `/categories/:slug` - Category Page
- `/admin/categories` - Category Management

---

### 3.2 Product Variants (CAT-VAR)

| Attribute | Value |
|-----------|-------|
| System Code | CAT-VAR |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Order & Checkout |
| Layer | Full Stack |
| Dependencies | Product Catalog |
| Depended On By | Cart, Checkout, Inventory |

**Scope:**
- ProductVariants table linked to products
- Variant options (size, color, material)
- Per-variant pricing and inventory
- Variant selector component
- Variant images
- Admin variant management in product editor

**Routes (1):**
- `/admin/products/:id` - Product Editor (includes variants)

---

### 3.3 Inventory System (INV-STK)

| Attribute | Value |
|-----------|-------|
| System Code | INV-STK |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | Business Management |
| Layer | Full Stack |
| Dependencies | Product Catalog |
| Depended On By | Checkout, Orders, Returns, Shipping, Dashboard |

**Scope:**
- Inventory counts on products and variants
- Decrement on order placement
- Low stock threshold alerts
- Admin inventory adjustments
- Bulk inventory updates
- Inventory history log
- Backorder support option

**Routes (1):**
- `/admin/inventory` - Inventory Management

**Events Emitted:**
- `stock_low` - When stock reaches threshold
- `stock_depleted` - When stock hits zero
- `stock_adjusted` - Manual adjustment
- `stock_replenished` - Restock action

---

### 3.4 Search System (PLT-SRC)

| Attribute | Value |
|-----------|-------|
| System Code | PLT-SRC |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Platform Infrastructure |
| Layer | Full Stack |
| Dependencies | Product Catalog |
| Depended On By | (User experience) |

**Scope:**
- Full-text search index on products
- Search bar with autocomplete/suggestions
- Search results page with filters
- Category/price/attribute filtering
- Search analytics (popular terms, no-results)

**Routes (2):**
- `/search` - Search Results
- `/admin/analytics/search` - Search Analytics

---

### 3.5 Shopping Cart (ORD-CRT)

| Attribute | Value |
|-----------|-------|
| System Code | ORD-CRT |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | Order & Checkout |
| Layer | Full Stack |
| Dependencies | Product Catalog, Authentication |
| Depended On By | Checkout, Discounts |

**Scope:**
- Cart table with user reference
- Cart items with product/variant/quantity
- Guest cart via localStorage
- Cart merge on login
- Cart drawer and page UI
- Real-time sync across devices (logged in)
- Admin abandoned carts view

**Routes (2):**
- `/cart` - Shopping Cart Page
- `/admin/orders/abandoned` - Abandoned Carts

**PRD Considerations:**
- Discount code application (Phase 4)
- Inventory validation before checkout
- Cart expiration for guest carts
- Save for later functionality

---

## Phase 4: Checkout & Orders

> **Goal:** Enable the full purchase flow and order management.

### 4.1 Checkout System (ORD-CHK)

| Attribute | Value |
|-----------|-------|
| System Code | ORD-CHK |
| Priority | P0 - Critical |
| Complexity | Complex |
| Category | Order & Checkout |
| Layer | Full Stack |
| Dependencies | Cart, Payment, Inventory, Tax, Shipping, Accounts |
| Depended On By | Order Management |

**Scope:**
- Multi-step checkout flow
- Shipping address collection
- Billing address collection
- Shipping method selection with rates
- Payment method selection
- Order review before submission
- Inventory validation pre-checkout
- Order creation on payment success
- Guest checkout support

**Routes (4):**
- `/checkout/shipping` - Shipping Step
- `/checkout/payment` - Payment Step
- `/checkout/review` - Review Step
- `/checkout/confirmation/:orderId` - Confirmation

---

### 4.2 Order Management (ORD-MGT)

| Attribute | Value |
|-----------|-------|
| System Code | ORD-MGT |
| Priority | P0 - Critical |
| Complexity | Complex |
| Category | Order & Checkout |
| Layer | Full Stack |
| Dependencies | Checkout, Payment, Inventory |
| Depended On By | Reviews, Returns, Shipping, Dashboard, Analytics, Support |

**Scope:**
- Orders table with status workflow
- Customer order history page
- Order detail page
- Admin order list with filters
- Admin order detail with actions
- Status transitions (placed → processing → shipped → delivered)
- Order notes and internal comments

**Status Workflow:**
```
placed → processing → shipped → delivered
                   ↘ cancelled
                   ↘ returned (partial or full)
```

**Routes (5):**
- `/account/orders` - Order History
- `/account/orders/:orderId` - Order Detail
- `/checkout/confirmation/:orderId` - Confirmation
- `/admin/orders` - Orders List
- `/admin/orders/:id` - Order Detail

---

### 4.3 Shipping & Fulfillment (FUL-SHP)

| Attribute | Value |
|-----------|-------|
| System Code | FUL-SHP |
| Priority | P1 - High |
| Complexity | Complex |
| Category | Business Management |
| Layer | Full Stack |
| Dependencies | Order Management, Inventory |
| Depended On By | (Delivery experience) |

**Scope:**
- Shipping methods table (synced from Airtable)
- Rate calculation based on weight/destination
- Tracking number input
- Shipping status updates
- Carrier integration (optional)
- Shipping label generation (optional)
- Admin fulfillment queue

**Routes (2):**
- `/admin/orders/:id` - Order Detail (fulfillment actions)
- `/admin/settings/shipping` - Shipping Methods

---

### 4.4 Discounts & Coupons (MKT-DSC)

| Attribute | Value |
|-----------|-------|
| System Code | MKT-DSC |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Business Management |
| Layer | Full Stack |
| Dependencies | Shopping Cart, Product Catalog |
| Depended On By | (Promotions) |

**Scope:**
- Discounts table (type, value, conditions, limits, dates)
- Coupon code entry at checkout/cart
- Automatic discounts (cart rules)
- Usage limits (per customer, total)
- Expiration dates
- Minimum order requirements
- Admin discount CRUD
- Usage reporting

**Discount Types:**
- Percentage off
- Fixed amount off
- Free shipping
- Buy X get Y

**Routes (1):**
- `/admin/discounts` - Discount Management

---

## Phase 5: Post-Order & Engagement

> **Goal:** Build customer engagement and support features.

### 5.1 Returns & Refunds (SUP-RTN)

| Attribute | Value |
|-----------|-------|
| System Code | SUP-RTN |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Support & Communication |
| Layer | Full Stack |
| Dependencies | Order Management, Payment, Inventory |
| Depended On By | (Customer experience) |

**Scope:**
- Returns table with order reference, reason, status
- Customer return request form
- Return status tracking
- Admin return queue
- Approve/deny return actions
- Refund processing (full, partial)
- Return reasons tracking
- Inventory restocking on return

**Routes (2):**
- `/account/orders/:orderId/return` - Request Return
- `/admin/returns` - Returns Management

---

### 5.2 Wishlist System (USR-WSH)

| Attribute | Value |
|-----------|-------|
| System Code | USR-WSH |
| Priority | P2 - Medium |
| Complexity | Simple |
| Category | User & Auth |
| Layer | Full Stack |
| Dependencies | Customer Accounts, Product Catalog |
| Depended On By | (Engagement) |

**Scope:**
- Wishlists table with user reference
- Wishlist items with product reference
- Multiple wishlists per user (optional)
- Add/remove from wishlist UI
- Wishlist page in account dashboard
- Move to cart action
- Share wishlist (optional)
- Wishlist reminders (optional)

**Routes (1):**
- `/account/wishlist` - Wishlist

---

### 5.3 Reviews & Ratings (CON-REV)

| Attribute | Value |
|-----------|-------|
| System Code | CON-REV |
| Priority | P2 - Medium |
| Complexity | Medium |
| Category | Content & Marketing |
| Layer | Full Stack |
| Dependencies | Customer Accounts, Product Catalog, Order Management |
| Depended On By | (Social proof) |

**Scope:**
- Reviews table (user, product, rating, text, photos)
- Verified purchase badge
- Submit review form (post-purchase)
- Review display on product pages
- Review sorting/filtering
- Helpful votes on reviews
- Admin moderation queue
- Review request emails (via Event System)

**Routes (2):**
- `/products/:slug` - Product Detail (includes reviews)
- `/admin/reviews` - Review Moderation

---

### 5.4 Customer Support (SUP-TKT)

| Attribute | Value |
|-----------|-------|
| System Code | SUP-TKT |
| Priority | P2 - Medium |
| Complexity | Medium |
| Category | Support & Communication |
| Layer | Full Stack |
| Dependencies | Customer Accounts, Order Management |
| Depended On By | (Support experience) |

**Scope:**
- Tickets table (status, priority, assigned staff)
- Contact form on storefront
- Customer ticket history in account
- Admin ticket queue
- Ticket detail with order context
- Reply functionality
- Canned responses
- Ticket assignment

**Routes (3):**
- `/contact` - Contact Form
- `/account/support` - Support Tickets
- `/admin/support` - Ticket Management

---

## Phase 6: Admin & Analytics

> **Goal:** Complete the admin experience with dashboard and reporting.

### 6.1 Admin Dashboard (ADM-DSH)

| Attribute | Value |
|-----------|-------|
| System Code | ADM-DSH |
| Priority | P0 - Critical |
| Complexity | Medium |
| Category | Admin & Operations |
| Layer | Admin |
| Dependencies | Authentication, Roles, Order Management, Inventory |
| Depended On By | (Admin experience) |

**Scope:**
- Dashboard route with key metrics widgets
- Orders today summary
- Revenue chart
- Low stock alerts
- Recent orders list
- Quick actions
- Navigation sidebar to all admin sections
- Admin-only route protection

**Routes (1):**
- `/admin` - Admin Dashboard

**Dashboard Widgets:**
- Orders today (count, value)
- Revenue (today, week, month)
- Low stock alerts (items below threshold)
- Recent orders (last 10)
- Pending returns
- Open support tickets
- Abandoned carts count

---

### 6.2 Analytics & Reporting (ADM-RPT)

| Attribute | Value |
|-----------|-------|
| System Code | ADM-RPT |
| Priority | P2 - Medium |
| Complexity | Medium |
| Category | Admin & Operations |
| Layer | Admin |
| Dependencies | Order Management, Product Catalog, Customer Accounts |
| Depended On By | (Business intelligence) |

**Scope:**
- Reports section in admin
- Sales by period (day, week, month)
- Top products report
- Customer acquisition report
- Inventory value report
- Date range filters
- CSV export
- Basic charts/visualizations
- Scheduled report emails (optional)

**Routes (1):**
- `/admin/reports` - Reports

---

### 6.3 Testing & Debug Tools (ADM-TST)

| Attribute | Value |
|-----------|-------|
| System Code | ADM-TST |
| Priority | P1 - High |
| Complexity | Medium |
| Category | Admin & Operations |
| Layer | Admin |
| Dependencies | Event System, Role & Permission |
| Depended On By | (Development/QA) |

**Scope:**
- Admin route for manual event triggers
- Test data generators (orders, users, products)
- System state viewer (event log, queues)
- Toggle feature flags
- Reset test data
- Allows both human and AI verification

**Routes (1):**
- `/admin/system/testing` - Testing Tools

---

## Implementation Timeline

### Phase 0: Foundation (~1 sprint)
- [x] Authentication System ✓ PRD Complete
- [x] Event System ✓ PRD Complete

### Phase 1: Core Infrastructure (~2 sprints)
- [x] Media Library ✓ PRD Complete
- [x] Payment System ✓ PRD Complete
- [x] Role & Permission System ✓ PRD Complete
- [x] Customer Accounts ✓ PRD Complete
- [x] Email Notification System ✓ PRD Complete
- [x] Site Notification System ✓ PRD Complete

### Phase 2: Configuration & Catalog (~1 sprint)
- [ ] Airtable Sync System
- [ ] Tax Calculation
- [x] Product Catalog ✓ PRD Complete (UCP/MCP integrated)

### Phase 3: Product Ecosystem (~2 sprints)
- [x] Category System ✓ PRD Complete
- [ ] Product Variants
- [x] Inventory System ✓ PRD Complete (Atomic reservations)
- [ ] Search System
- [x] Shopping Cart ✓ PRD Complete (Optimistic updates)

### Phase 4: Checkout & Orders (~2 sprints)
- [x] Checkout System ✓ PRD Complete (UCP REST API)
- [x] Order Management ✓ PRD Complete (Real-time status)
- [ ] Shipping & Fulfillment
- [ ] Discounts & Coupons

### Phase 5: Post-Order & Engagement (~2 sprints)
- [ ] Returns & Refunds
- [ ] Wishlist System
- [ ] Reviews & Ratings
- [ ] Customer Support

### Phase 6: Admin & Analytics (~1 sprint)
- [x] Admin Dashboard ✓ PRD Complete (Real-time metrics)
- [ ] Analytics & Reporting
- [ ] Testing & Debug Tools

**Total: ~11 sprints**

---

## System Reference Quick-Lookup

| Code | System | Phase | Priority |
|------|--------|-------|----------|
| PLT-AUT | Authentication System | 0 | P0 |
| PLT-EVT | Event System | 0 | P0 |
| PLT-MED | Media Library | 1 | P0 |
| PAY-STR | Payment System | 1 | P0 |
| PLT-ROL | Role & Permission System | 1 | P0 |
| USR-ACT | Customer Accounts | 1 | P0 |
| COM-EML | Email Notification System | 1 | P0 |
| COM-NOT | Site Notification System | 1 | P1 |
| PLT-SYN | Airtable Sync System | 2 | P1 |
| PAY-TAX | Tax Calculation | 2 | P1 |
| CAT-PRD | Product Catalog | 2 | P0 |
| CAT-CAT | Category System | 3 | P1 |
| CAT-VAR | Product Variants | 3 | P1 |
| INV-STK | Inventory System | 3 | P0 |
| PLT-SRC | Search System | 3 | P1 |
| ORD-CRT | Shopping Cart | 3 | P0 |
| ORD-CHK | Checkout System | 4 | P0 |
| ORD-MGT | Order Management | 4 | P0 |
| FUL-SHP | Shipping & Fulfillment | 4 | P1 |
| MKT-DSC | Discounts & Coupons | 4 | P1 |
| SUP-RTN | Returns & Refunds | 5 | P1 |
| USR-WSH | Wishlist System | 5 | P2 |
| CON-REV | Reviews & Ratings | 5 | P2 |
| SUP-TKT | Customer Support | 5 | P2 |
| ADM-DSH | Admin Dashboard | 6 | P0 |
| ADM-RPT | Analytics & Reporting | 6 | P2 |
| ADM-TST | Testing & Debug Tools | 6 | P1 |

---

## PRD Creation Workflow

When creating a PRD for any system:

### 1. Reference This Action Plan
- Review the system's phase, dependencies, and what depends on it
- Understand integration points with other systems

### 2. Check Airtable Source Data
- Routes table for all pages
- Actions table for all capabilities
- Events table for all events emitted/consumed
- Email Notifications for all emails
- Site Notifications for all notifications
- Roles table for permission assignments

### 3. Design Forward
- Include hooks/placeholders for future integrations
- Define event contracts for systems that will listen
- Schema design that accommodates future fields

### 4. Include in PRD
- System overview and scope
- Dependencies (what must exist first)
- Routes with layouts and permissions
- Actions with permission levels
- Events emitted with payloads
- Notifications triggered
- Schema/data model
- UI components needed
- Integration points with other systems

---

## Airtable Reference

**Base ID:** `[redacted-airtable-base-id]`

| Table | Purpose |
|-------|---------|
| Systems | System definitions and relationships |
| Departments | Organizational grouping |
| Roles | Permission levels |
| Routes | Application pages |
| Actions | User capabilities |
| Events | System events |
| Email Notifications | Transactional emails |
| Site Notifications | In-app notifications |
| Action Types | Action categorization |
| Event Types | Event categorization |

---

**Document Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
