# WooCommerce Field Fidelity & Customer Continuity Strategy

## The Problem

When a WooCommerce customer logs into the new ConvexPress website, they must see everything: their orders, downloads, license keys, addresses. Every piece of data must be linked correctly through the chain:

```
WooCommerce Customer (email: john@example.com)
  └─ Imported as ConvexPress User (email: john@example.com, clerkUserId: null)
       └─ Linked to commerce_customer_profile (userId: user._id)
            └─ All orders reference this customerId + userId
                 └─ All order items reference products that also exist locally
                      └─ All downloads/licenses reference userId
```

When john@example.com signs into the new site via Clerk, the website resolves his identity through `users.clerkUserId`. If that field is null (because the user was imported, not created by Clerk), the chain breaks and he sees nothing.

## Critical Chain: How the Website Resolves Customer Data

Every customer-facing query uses the same pattern:

```
Clerk login → identity.subject (Clerk ID) → users.by_clerkUserId → user._id → query by userId
```

| Dashboard Section | Query | Index | Key |
|---|---|---|---|
| My Orders | `commerce.orders.listMine` | `by_user` | `userId` |
| Order Detail | `commerce.orders.getMineById` | `by_user` | `userId` |
| My Profile | `commerce.customers.getMine` | `by_user` | `userId` |
| Downloads | `commerceDigital.queries.getMyDownloads` | `by_user` | `userId` |
| License Keys | `commerceDigital.queries.getMyLicenseKeys` | `by_user` | `userId` |

If `userId` doesn't match the logged-in user, the data is invisible.

## Implementation Strategy

### 1. Fix the Clerk-to-Imported-User Linking Gap

**The problem:** Imported users have `clerkUserId: undefined`. When they sign up or log in via Clerk on the new site, Clerk creates a new identity. The website's `getCurrentUser()` queries `by_clerkUserId` and finds nothing.

**The fix:** The website already has a Clerk webhook handler (or auth callback) that fires when users sign up or sign in. This handler needs to:

1. Get the Clerk user's email
2. Look up existing ConvexPress users by email (`by_email` index)
3. If found and `clerkUserId` is null → set `clerkUserId` to the Clerk ID (link the accounts)
4. If found and `clerkUserId` is already set to a different Clerk ID → this is a conflict (flag it)
5. If not found → create a new user (normal flow)

This is the **single most critical piece** for customer continuity. Without it, no imported customer sees their data.

**Implementation:**
- Modify the Clerk webhook/auth handler in `ConvexPress-Admin/packages/backend/convex/` (the auth system)
- Add email-based fallback to the user resolution in the webhook
- This is the Auth System Expert's domain (`/experts:auth-system`)

### 2. Schema Additions for Field Fidelity

Add these fields to existing tables. All optional to avoid breaking existing data.

**`commerce_products` — add 6 fields:**

```typescript
// Dimensions for shipping calculation
shippingLengthIn: v.optional(v.number()),  // inches
shippingWidthIn: v.optional(v.number()),
shippingHeightIn: v.optional(v.number()),
// Scheduled sales
salePriceFrom: v.optional(v.number()),  // timestamp
salePriceTo: v.optional(v.number()),    // timestamp
// Cross-selling
upsellProductIds: v.optional(v.array(v.id("commerce_products"))),
crossSellProductIds: v.optional(v.array(v.id("commerce_products"))),
// Preserved source metadata
rawSourceMeta: v.optional(v.string()),  // JSON string
```

**`commerce_customer_profiles` — add 3 fields:**

```typescript
firstName: v.optional(v.string()),
lastName: v.optional(v.string()),
isGuest: v.optional(v.boolean()),  // true = one-off order guest, not a real account
```

**`wooClient.ts` WooProduct interface — add missing API fields:**

```typescript
// Add to WooProduct interface
dimensions?: { length?: string; width?: string; height?: string };
upsell_ids?: number[];
cross_sell_ids?: number[];
stock_status?: "instock" | "outofstock" | "onbackorder";
external_url?: string;
button_text?: string;
grouped_products?: number[];
total_sales?: number;
purchase_note?: string;
```

**`wooClient.ts` WooCoupon interface — add missing API fields:**

```typescript
// Add to WooCoupon interface
usage_limit_per_user?: number | null;
limit_usage_to_x_items?: number | null;
product_ids?: number[];
excluded_product_ids?: number[];
product_categories?: number[];
excluded_product_categories?: number[];
minimum_amount?: string;
maximum_amount?: string;
free_shipping?: boolean;
individual_use?: boolean;
exclude_sale_items?: boolean;
email_restrictions?: string[];
```

### 3. Product Import Fidelity Fixes

**In `commerceCatalog.ts` → `importSingleProduct`:**

| WooCommerce Field | ConvexPress Field | Conversion |
|---|---|---|
| `product.weight` | `shippingWeightOz` | Parse string to float, convert from WC weight unit (usually kg or lbs) to ounces. Default: assume lbs if unit unknown → `parseFloat(weight) * 16` |
| `product.dimensions.length` | `shippingLengthIn` | Parse string to float, convert from WC dimension unit (usually cm or in) to inches. Default: assume cm → `parseFloat(length) / 2.54` |
| `product.dimensions.width` | `shippingWidthIn` | Same conversion |
| `product.dimensions.height` | `shippingHeightIn` | Same conversion |
| `product.date_on_sale_from` | `salePriceFrom` | `new Date(value).getTime()` |
| `product.date_on_sale_to` | `salePriceTo` | `new Date(value).getTime()` |
| `product.upsell_ids` | `upsellProductIds` | Store raw WP IDs initially, resolve to local IDs in reconciliation pass |
| `product.cross_sell_ids` | `crossSellProductIds` | Same — resolve in reconciliation |
| `product.meta_data` | `rawSourceMeta` | `JSON.stringify(product.meta_data)` |
| `product.external_url` | `rawSourceMeta` | Include in raw meta for external products |
| `product.button_text` | `rawSourceMeta` | Include in raw meta for external products |
| `product.grouped_products` | `rawSourceMeta` | Include in raw meta for grouped products |
| `product.type === "grouped"` | `productType: "simple"` | Map grouped → simple (ConvexPress doesn't have grouped type), preserve in rawSourceMeta |

**In `upsertProduct` mutation:**

Add the new fields to the product validator and the patch/insert:

```typescript
shippingWeightOz: v.optional(v.number()),
shippingLengthIn: v.optional(v.number()),
shippingWidthIn: v.optional(v.number()),
shippingHeightIn: v.optional(v.number()),
salePriceFrom: v.optional(v.number()),
salePriceTo: v.optional(v.number()),
rawSourceMeta: v.optional(v.string()),
```

Upsell/crossSell IDs are resolved in the reconciliation phase (pass 8), not during initial import, because target products may not be imported yet.

### 4. Customer Import Fidelity Fixes

**In `importCustomerProfile`:**

Pass `firstName`, `lastName`, and `isGuest` flag:

```typescript
const customerId = await ctx.runMutation(
  internal.wordpressSync.phases.commerceTransactions.upsertCustomerProfile,
  {
    existingId: existingMapping ?? undefined,
    customer: {
      userId: linkedUserId ?? undefined,
      email: normalizeEmail(customer.email, customer.billing?.email),
      phone: normalizePhone(customer.billing?.phone),
      firstName: customer.first_name?.trim() || customer.billing?.first_name?.trim() || undefined,
      lastName: customer.last_name?.trim() || customer.billing?.last_name?.trim() || undefined,
      isGuest: false,  // Real WooCommerce customer account
      totalOrders: 0,
      totalSpentAmount: 0,
      currencyCode: "USD",
    },
  }
);
```

**In `ensureOrderCustomer` (guest customer creation from orders):**

```typescript
isGuest: true,  // Created from order billing info, not a real account
firstName: order.billing?.first_name?.trim() || undefined,
lastName: order.billing?.last_name?.trim() || undefined,
```

**In `upsertCustomerProfile` mutation:**

Add the new fields to the validator and patch:

```typescript
firstName: v.optional(v.string()),
lastName: v.optional(v.string()),
isGuest: v.optional(v.boolean()),
```

### 5. Order Integrity Verification

After all orders are imported, verify the linking chain is complete. Add these checks to the reconciliation phase:

**New reconciliation sub-pass: `order_integrity`**

For each imported order:
1. Check `order.userId` is set (if customer had a WP account)
2. Check `order.customerId` is set and points to an existing customer profile
3. Check all `order_items` have valid `productId` references
4. Check all `order_items` have valid `variantId` references (if set)
5. Check `payment_transactions` exist for paid orders
6. Check `payment_refunds` link back to valid transactions

Any broken link → `MISSING_RELATIONSHIP_TARGET` finding.

### 6. Coupon Import Enhancement

**In `upsertDiscountCode` mutation, add fields from WooCoupon:**

The following WooCommerce coupon fields don't have schema equivalents in `commerce_discount_codes`. Since ConvexPress will have its own coupon engine, store these in a metadata field:

```typescript
// Add to commerce_discount_codes schema:
rawSourceMeta: v.optional(v.string()),

// In import, store WC-specific fields:
rawSourceMeta: JSON.stringify({
  usageLimitPerUser: coupon.usage_limit_per_user,
  productIds: coupon.product_ids,
  excludedProductIds: coupon.excluded_product_ids,
  productCategories: coupon.product_categories,
  excludedProductCategories: coupon.excluded_product_categories,
  minimumAmount: coupon.minimum_amount,
  maximumAmount: coupon.maximum_amount,
  freeShipping: coupon.free_shipping,
  individualUse: coupon.individual_use,
  excludeSaleItems: coupon.exclude_sale_items,
  emailRestrictions: coupon.email_restrictions,
}),
```

### 7. Upsell/Cross-sell Resolution

The reconciliation phase pass 8 (`upsell_crosssell`) currently checks `categoryIds`. Update it to also resolve `upsellProductIds` and `crossSellProductIds`:

For each product with stored WP upsell/cross-sell IDs (in rawSourceMeta):
1. Parse the WP product ID arrays from rawSourceMeta
2. Look up each WP ID in wpIdMappings
3. If found → patch the product with resolved local product IDs
4. If not found → create `MISSING_RELATIONSHIP_TARGET` finding

### 8. Digital Product Continuity

If the WooCommerce site sold downloadable products with license keys:

1. During product import, check `isDownloadable` flag (already mapped)
2. WooCommerce download files are in `meta_data` → preserve in `rawSourceMeta`
3. Download tokens and license keys from WooCommerce are NOT directly importable (they're managed by WooCommerce plugins like WooCommerce Software License or Easy Digital Downloads)
4. After import, the admin can manually create `commerce_digital_files` and `commerce_license_keys` linked to the imported products
5. New purchases on ConvexPress will generate their own download tokens and license keys through the ConvexPress digital product system

**Note:** If the user has specific WooCommerce license key plugins they need imported, that becomes a custom extension to this import system.

## Execution Checklist

### Phase A: Schema + Type Changes
- [ ] Add product dimension/sale/upsell/meta fields to `commerce.ts` schema
- [ ] Add customer firstName/lastName/isGuest to `commerce.ts` schema
- [ ] Add rawSourceMeta to `commerce_discount_codes` schema
- [ ] Add missing fields to `WooProduct` interface in `wooClient.ts`
- [ ] Add missing fields to `WooCoupon` interface in `wooClient.ts`

### Phase B: Import Mapping Fixes
- [ ] Map product `weight` → `shippingWeightOz` with unit conversion
- [ ] Map product `dimensions` → `shippingLengthIn/WidthIn/HeightIn`
- [ ] Map product `date_on_sale_from/to` → `salePriceFrom/To`
- [ ] Map product `upsell_ids/cross_sell_ids` → store raw in rawSourceMeta for reconciliation
- [ ] Map product `meta_data` → `rawSourceMeta`
- [ ] Map product `external_url/button_text/grouped_products` → `rawSourceMeta`
- [ ] Map customer `first_name/last_name` → `firstName/lastName`
- [ ] Set `isGuest: true` on guest customer profiles
- [ ] Map coupon WC-specific fields → `rawSourceMeta`
- [ ] Update `upsertProduct` mutation with new fields
- [ ] Update `upsertCustomerProfile` mutation with new fields
- [ ] Update `upsertDiscountCode` mutation with rawSourceMeta

### Phase C: Reconciliation Enhancements
- [ ] Update upsell_crosssell pass to resolve product IDs and patch upsellProductIds/crossSellProductIds
- [ ] Add order_integrity sub-pass to verify userId/customerId/productId chains

### Phase D: Clerk-to-User Linking (Critical)
- [ ] Audit the existing Clerk webhook/auth handler
- [ ] Add email-based fallback: if clerkUserId lookup fails, try email match
- [ ] When email match found with null clerkUserId, set clerkUserId (link accounts)
- [ ] Handle edge case: email match with different clerkUserId (conflict)
- [ ] Test the full flow: imported user → Clerk signup → sees their orders

### Phase E: End-to-End Verification
- [ ] Import a test WooCommerce site with customers and orders
- [ ] Log in as an imported customer via Clerk
- [ ] Verify "My Orders" shows all imported orders
- [ ] Verify order detail shows correct line items, products, totals
- [ ] Verify "My Downloads" shows digital product downloads (if applicable)
- [ ] Verify customer profile shows correct name, email, addresses
- [ ] Verify a returning customer can place a NEW order and see it alongside imported ones

## What We're NOT Importing (WooCommerce Internals)

| WC Concept | Why Skip |
|---|---|
| `taxClass`/`taxStatus` | ConvexPress has its own `commerce_tax_rules` table |
| `taxLines`/`feeLines`/`shippingLines` per-line arrays | We store aggregate amounts; per-line breakdown is WC internals |
| `stock_status` enum | Derived from `stockQuantity` + `trackInventory` + `allowBackorders` |
| Coupon `usageLimitPerUser`, product/category restrictions | WC coupon engine specifics; preserved in rawSourceMeta for reference |
| Category thumbnail images | No field in our category schema |
| Per-line-item `totalTax` | Aggregate `taxAmount` on order is sufficient |

## Definition of Success

A WooCommerce customer with 50 orders, 3 refunds, and 2 digital downloads signs into the new ConvexPress website. They see:

1. All 50 orders in "My Orders" with correct totals and dates
2. Each order detail shows the right products, quantities, prices
3. Refund history visible on refunded orders
4. Download links work for digital products
5. Their billing and shipping addresses are pre-filled
6. They can place a new order seamlessly alongside their history
