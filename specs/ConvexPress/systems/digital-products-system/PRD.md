# PRD: Digital Products

> **Origin:** Ported from VexCart on 2026-04-22.
> **Environment:** ConvexPress CMS + Commerce (WordPress-replacement architecture).
> **Auth stack:** Admin uses Convex Auth; website uses Clerk. Not VexCart's auth model.
> **Roles:** WordPress-standard — Administrator / Editor / Author / Contributor / Subscriber.
> **No themes, widgets, or plugins** in ConvexPress — AI builds custom per-site.
> **Package manager:** Bun (not npm/pnpm).
> **See `docs/stripe-integration.md`** for the site-wide Stripe provider architecture; this PRD's payment/tax references should be read through that lens.
>
> Lexical substitutions (VexCart→ConvexPress names and repo paths) have been
> applied automatically. Deeper semantic adaptations (capabilities, role
> naming, event-code conventions) may still reference VexCart-era details
> verbatim — flag and fix as they're used.


> **Status:** DRAFT - Awaiting Review & Enhancement
> **System Code:** CAT-DIG
> **Phase:** 4 of 6 (Checkout & Orders)
> **Priority:** P1 - High
> **Complexity:** Medium
> **Airtable Record:** rec2cFIRHiOUxZUAJ

---

## 1. Overview

### 1.1 Purpose

The Digital Products system enables selling downloadable digital goods alongside physical products. Any product can be marked as digital, with secure file delivery, download limits, license key generation, and version management. This supports e-books, software, music, courses, templates, and any other downloadable content.

### 1.2 Scope

- Digital product flag on any product
- Secure file attachment and storage
- Time-limited, purchase-verified download links
- Download tracking (count, IP, timestamps)
- License key generation for software products
- File versioning and update notifications
- Customer download history in account
- Multiple files per product
- Subscription access to digital content (integration)

### 1.3 Out of Scope

- DRM (Digital Rights Management)
- Video streaming/hosting (use dedicated platforms)
- LMS/course management (future system)
- Real-time collaboration on digital content

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Product Catalog | CAT-PRD | 2 | Products to make digital |
| Order Management | ORD-MGT | 4 | Purchase verification |
| Media Library | PLT-MED | 1 | File storage |
| Customer Accounts | USR-ACT | 1 | Download history |
| Email Notifications | COM-EML | 1 | Download link emails |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Product Bundles | CAT-BND | 4 | Digital bundles |
| Subscription Products | CAT-SUB | 4 | Subscription digital access |

### 2.3 Integration Hooks to Implement

- Download link generation API
- License key validation API
- File version update notifications
- Download analytics events

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| My Downloads | /account/downloads | _account | Yes | customer |
| Download File | /download/:token | - | No (token auth) | public |
| My Licenses | /account/licenses | _account | Yes | customer |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Digital Files | /admin/products/:productId/files | _admin | Yes | staff, manager, admin |
| License Keys | /admin/products/:productId/licenses | _admin | Yes | staff, manager, admin |
| Download Analytics | /admin/analytics/downloads | _admin | Yes | manager, admin |

---

## 4. Data Model

### 4.1 Product Digital Configuration

```typescript
// Add to products table
products: defineTable({
  // ... existing fields

  // Digital product configuration
  isDigital: v.boolean(),
  digitalConfig: v.optional(v.object({
    // Delivery settings
    deliveryMethod: v.union(
      v.literal("download"),        // Direct download
      v.literal("email"),           // Send link via email
      v.literal("both"),            // Both methods
    ),

    // Download limits
    maxDownloads: v.optional(v.number()),      // Per purchase (null = unlimited)
    downloadExpiryDays: v.optional(v.number()), // Days until link expires (null = never)

    // License settings
    requiresLicense: v.boolean(),
    licenseType: v.optional(v.union(
      v.literal("single"),          // One device
      v.literal("multi"),           // Multiple devices (specify count)
      v.literal("unlimited"),       // Unlimited devices
    )),
    maxDevices: v.optional(v.number()),

    // Version info
    currentVersion: v.optional(v.string()),
    releaseDate: v.optional(v.number()),

    // Terms
    licenseTermsUrl: v.optional(v.string()),
  })),
})
```

### 4.2 Digital Files

```typescript
// Digital product files
digital_files: defineTable({
  productId: v.id("products"),

  // File info
  name: v.string(),                     // "Software Installer"
  description: v.optional(v.string()),  // "Windows 64-bit installer"
  filename: v.string(),                 // "app-setup-v2.1.0.exe"
  fileSize: v.number(),                 // Bytes
  mimeType: v.string(),

  // Storage
  storageId: v.id("_storage"),          // Convex file storage
  storageUrl: v.optional(v.string()),   // External CDN URL (optional)

  // Version
  version: v.string(),                  // "2.1.0"
  releaseNotes: v.optional(v.string()), // What's new in this version

  // Platform/variant
  platform: v.optional(v.union(
    v.literal("windows"),
    v.literal("mac"),
    v.literal("linux"),
    v.literal("all"),
  )),

  // Status
  isActive: v.boolean(),
  sortOrder: v.number(),

  // Checksums
  md5Hash: v.optional(v.string()),
  sha256Hash: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_product", ["productId", "isActive"])
  .index("by_version", ["productId", "version"])

// Download tokens (for secure access)
download_tokens: defineTable({
  // What's being downloaded
  fileId: v.id("digital_files"),
  productId: v.id("products"),

  // Who can download
  orderId: v.id("order_records"),
  userId: v.optional(v.id("user_profiles")),

  // Token
  token: v.string(),                    // Unique token for URL

  // Limits
  maxDownloads: v.optional(v.number()),
  downloadCount: v.number(),
  expiresAt: v.optional(v.number()),

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("exhausted"),             // Max downloads reached
    v.literal("expired"),               // Past expiry date
    v.literal("revoked"),               // Manually revoked
  ),

  createdAt: v.number(),
  lastDownloadAt: v.optional(v.number()),
})
  .index("by_token", ["token"])
  .index("by_order", ["orderId"])
  .index("by_user", ["userId"])
  .index("by_file", ["fileId"])

// Download log
download_log: defineTable({
  tokenId: v.id("download_tokens"),
  fileId: v.id("digital_files"),
  userId: v.optional(v.id("user_profiles")),

  // Request info
  ipAddress: v.string(),
  userAgent: v.string(),
  referer: v.optional(v.string()),

  // Result
  success: v.boolean(),
  errorReason: v.optional(v.string()),
  bytesTransferred: v.optional(v.number()),

  timestamp: v.number(),
})
  .index("by_token", ["tokenId"])
  .index("by_file", ["fileId"])
  .index("by_user", ["userId"])
  .index("by_timestamp", ["timestamp"])
```

### 4.3 License Keys

```typescript
// License keys
license_keys: defineTable({
  productId: v.id("products"),
  orderId: v.optional(v.id("order_records")), // Null if pre-generated
  userId: v.optional(v.id("user_profiles")),  // Assigned on purchase

  // Key
  licenseKey: v.string(),               // "XXXX-XXXX-XXXX-XXXX"
  keyType: v.union(
    v.literal("single"),
    v.literal("multi"),
    v.literal("unlimited"),
  ),
  maxActivations: v.optional(v.number()),
  currentActivations: v.number(),

  // Status
  status: v.union(
    v.literal("available"),             // Not yet assigned
    v.literal("active"),                // Assigned and valid
    v.literal("suspended"),             // Temporarily disabled
    v.literal("revoked"),               // Permanently disabled
    v.literal("expired"),               // Past expiry date
  ),

  // Validity
  expiresAt: v.optional(v.number()),
  purchasedAt: v.optional(v.number()),

  // Metadata
  notes: v.optional(v.string()),        // Admin notes

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_key", ["licenseKey"])
  .index("by_product", ["productId", "status"])
  .index("by_user", ["userId"])
  .index("by_order", ["orderId"])

// License activations
license_activations: defineTable({
  licenseId: v.id("license_keys"),

  // Device info
  deviceId: v.string(),                 // Generated client-side
  deviceName: v.optional(v.string()),   // "John's MacBook Pro"
  deviceType: v.optional(v.string()),   // "desktop", "mobile"

  // Request info
  ipAddress: v.string(),
  userAgent: v.string(),

  // Status
  isActive: v.boolean(),
  deactivatedAt: v.optional(v.number()),
  deactivationReason: v.optional(v.string()),

  firstActivatedAt: v.number(),
  lastSeenAt: v.number(),
})
  .index("by_license", ["licenseId"])
  .index("by_device", ["licenseId", "deviceId"])
```

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Download File | digital.download | Download purchased file | customer |
| Get License | digital.get_license | View license key | customer |
| Activate License | digital.activate | Activate on device | customer |
| Deactivate Device | digital.deactivate | Remove device activation | customer |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Upload File | digital.upload | Add file to product | staff, manager, admin |
| Update File | digital.update_file | Replace file version | staff, manager, admin |
| Generate Keys | digital.generate_keys | Pre-generate license keys | manager, admin |
| Revoke License | digital.revoke_license | Disable license key | manager, admin |
| Revoke Download | digital.revoke_download | Disable download token | manager, admin |
| Resend Download | digital.resend | Send new download email | staff, manager, admin |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| File Downloaded | digital.downloaded | Successful download | `{ fileId, userId, tokenId }` |
| Download Failed | digital.download_failed | Download attempt failed | `{ tokenId, reason }` |
| License Activated | digital.license_activated | New device activation | `{ licenseId, deviceId }` |
| License Deactivated | digital.license_deactivated | Device removed | `{ licenseId, deviceId }` |
| File Updated | digital.file_updated | New version uploaded | `{ productId, fileId, version }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| order.paid | Order Management | Generate download tokens and license keys |
| refund.completed | Returns & Refunds | Revoke downloads and licenses |

---

## 7. Notifications

### 7.1 Email Notifications

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Download Ready | order.paid (digital) | customer | `{{productName}}, {{downloadUrl}}, {{expiresIn}}` |
| License Key | order.paid (requires license) | customer | `{{productName}}, {{licenseKey}}` |
| File Update Available | digital.file_updated | customer | `{{productName}}, {{version}}, {{releaseNotes}}, {{downloadUrl}}` |
| Download Expiring | 3 days before expiry | customer | `{{productName}}, {{expiresAt}}, {{downloadUrl}}` |

---

## 8. User Interface

### 8.1 Components Needed

- [ ] `DigitalProductBadge` - Indicator on product cards
- [ ] `DownloadsList` - Customer's download history
- [ ] `DownloadCard` - Individual download with progress
- [ ] `LicenseKeyDisplay` - Show/copy license key
- [ ] `ActivationsList` - Device activations for license
- [ ] `AdminFileUploader` - File upload with metadata
- [ ] `AdminFileList` - Manage product files
- [ ] `AdminLicenseGenerator` - Bulk key generation
- [ ] `VersionUpdateModal` - Upload new version

### 8.2 My Downloads Page

```
┌────────────────────────────────────────────────────────────────┐
│  My Downloads                                                   │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📦 Design Templates Bundle                                │  │
│  │ Purchased: Jan 15, 2025                                  │  │
│  │                                                           │  │
│  │ Files:                                                    │  │
│  │ ├─ 📄 Figma Templates (v2.1)     45 MB    [Download]    │  │
│  │ ├─ 📄 Sketch Templates (v2.1)    38 MB    [Download]    │  │
│  │ └─ 📄 Asset Library (v2.1)       120 MB   [Download]    │  │
│  │                                                           │  │
│  │ Downloads: 2/5 remaining  •  Expires: Feb 15, 2025       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 💿 Photo Editor Pro                        🆕 Update!    │  │
│  │ Purchased: Dec 20, 2024                                  │  │
│  │                                                           │  │
│  │ License Key: XXXX-XXXX-XXXX-XXXX          [Copy] [Show] │  │
│  │ Activations: 2/3 devices                                 │  │
│  │                                                           │  │
│  │ Files:                                                    │  │
│  │ ├─ 🪟 Windows Installer (v3.5)   85 MB    [Download]    │  │
│  │ ├─ 🍎 macOS Installer (v3.5)     92 MB    [Download]    │  │
│  │ └─ 📖 User Manual (PDF)          5 MB     [Download]    │  │
│  │                                                           │  │
│  │ ⚠️ New version 3.5 available (you have 3.4)             │  │
│  │ [View Release Notes] [Download Update]                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 8.3 Admin File Management

```
┌────────────────────────────────────────────────────────────────┐
│  Product Files: Photo Editor Pro                [+ Upload File]│
├────────────────────────────────────────────────────────────────┤
│  Current Version: 3.5.0  |  Released: Jan 20, 2025             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Name              │ Platform │ Size   │ Version │ Status │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Windows Installer │ Windows  │ 85 MB  │ 3.5.0   │ ✓     │  │
│  │ macOS Installer   │ macOS    │ 92 MB  │ 3.5.0   │ ✓     │  │
│  │ Linux Installer   │ Linux    │ 78 MB  │ 3.5.0   │ ✓     │  │
│  │ User Manual       │ All      │ 5 MB   │ 3.5.0   │ ✓     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Upload New Version]  [Notify Customers of Update]            │
├────────────────────────────────────────────────────────────────┤
│  License Keys: 45 generated  |  32 assigned  |  13 available   │
│  [Generate More Keys]  [View All Keys]                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. Business Rules

### 9.1 Download Rules

- Download tokens generated immediately on successful payment
- Token URL format: `/download/{token}`
- Token validity checked on every download attempt
- Partial downloads don't count against limit
- Failed downloads don't count against limit
- Expired tokens can be renewed by admin

### 9.2 License Key Rules

- Keys are unique across all products
- Key format: `XXXX-XXXX-XXXX-XXXX` (alphanumeric)
- Keys assigned FIFO from available pool
- If pool empty, generate on-demand
- Refunded orders have licenses revoked
- Suspended licenses can be reactivated

### 9.3 Version Update Rules

- Customers with active purchases get update notifications
- Download limits reset on major version updates (configurable)
- Old versions remain downloadable unless removed
- Release notes required for updates

---

## 10. API Design

### 10.1 Queries

```typescript
// Get customer's downloads
export const getMyDownloads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const tokens = await ctx.db.query("download_tokens")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .filter(q => q.neq(q.field("status"), "revoked"))
      .collect();

    // Group by product
    const byProduct = new Map();
    for (const token of tokens) {
      const file = await ctx.db.get(token.fileId);
      const product = await ctx.db.get(token.productId);

      if (!byProduct.has(token.productId)) {
        byProduct.set(token.productId, {
          product,
          files: [],
          order: await ctx.db.get(token.orderId),
        });
      }
      byProduct.get(token.productId).files.push({ file, token });
    }

    return Array.from(byProduct.values());
  },
});

// Get customer's licenses
export const getMyLicenses = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const licenses = await ctx.db.query("license_keys")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();

    return Promise.all(licenses.map(async (license) => {
      const product = await ctx.db.get(license.productId);
      const activations = await ctx.db.query("license_activations")
        .withIndex("by_license", q => q.eq("licenseId", license._id))
        .filter(q => q.eq(q.field("isActive"), true))
        .collect();

      return { ...license, product, activations };
    }));
  },
});
```

### 10.2 Actions (HTTP for Downloads)

```typescript
// convex/http.ts - Download endpoint
http.route({
  path: "/download/:token",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = extractPathParam(request.url, "token");

    // Validate token
    const downloadToken = await ctx.runQuery(internal.digital.getTokenByValue, { token });

    if (!downloadToken) {
      return new Response("Download link not found", { status: 404 });
    }

    if (downloadToken.status !== "active") {
      return new Response(
        downloadToken.status === "expired"
          ? "Download link has expired"
          : "Download link is no longer valid",
        { status: 410 }
      );
    }

    if (downloadToken.expiresAt && downloadToken.expiresAt < Date.now()) {
      await ctx.runMutation(internal.digital.markTokenExpired, {
        tokenId: downloadToken._id
      });
      return new Response("Download link has expired", { status: 410 });
    }

    if (downloadToken.maxDownloads &&
        downloadToken.downloadCount >= downloadToken.maxDownloads) {
      return new Response("Download limit reached", { status: 429 });
    }

    // Get file
    const file = await ctx.runQuery(internal.digital.getFile, {
      fileId: downloadToken.fileId
    });

    if (!file || !file.isActive) {
      return new Response("File not available", { status: 404 });
    }

    // Log download attempt
    await ctx.runMutation(internal.digital.logDownload, {
      tokenId: downloadToken._id,
      fileId: downloadToken.fileId,
      userId: downloadToken.userId,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
    });

    // Increment download count
    await ctx.runMutation(internal.digital.incrementDownloadCount, {
      tokenId: downloadToken._id
    });

    // Get file URL from storage
    const fileUrl = await ctx.storage.getUrl(file.storageId);

    // Redirect to storage URL (or stream directly)
    return Response.redirect(fileUrl, 302);
  }),
});
```

### 10.3 Mutations

```typescript
// Generate download tokens for order
export const generateDownloadTokens = internalMutation({
  args: { orderId: v.id("order_records") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;

    for (const item of order.items) {
      const product = await ctx.db.get(item.productId);
      if (!product?.isDigital) continue;

      // Get all active files for product
      const files = await ctx.db.query("digital_files")
        .withIndex("by_product", q => q.eq("productId", item.productId))
        .filter(q => q.eq(q.field("isActive"), true))
        .collect();

      for (const file of files) {
        const token = generateSecureToken();
        const config = product.digitalConfig;

        await ctx.db.insert("download_tokens", {
          fileId: file._id,
          productId: item.productId,
          orderId: args.orderId,
          userId: order.userId,
          token,
          maxDownloads: config?.maxDownloads ?? null,
          downloadCount: 0,
          expiresAt: config?.downloadExpiryDays
            ? Date.now() + (config.downloadExpiryDays * 24 * 60 * 60 * 1000)
            : null,
          status: "active",
          createdAt: Date.now(),
        });
      }

      // Generate license key if required
      if (product.digitalConfig?.requiresLicense) {
        await assignLicenseKey(ctx, item.productId, args.orderId, order.userId);
      }
    }
  },
});

// License activation
export const activateLicense = mutation({
  args: {
    licenseKey: v.string(),
    deviceId: v.string(),
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const license = await ctx.db.query("license_keys")
      .withIndex("by_key", q => q.eq("licenseKey", args.licenseKey))
      .unique();

    if (!license) {
      return { success: false, error: "Invalid license key" };
    }

    if (license.status !== "active") {
      return { success: false, error: `License is ${license.status}` };
    }

    if (license.expiresAt && license.expiresAt < Date.now()) {
      return { success: false, error: "License has expired" };
    }

    // Check existing activation for this device
    const existingActivation = await ctx.db.query("license_activations")
      .withIndex("by_device", q =>
        q.eq("licenseId", license._id).eq("deviceId", args.deviceId)
      )
      .unique();

    if (existingActivation?.isActive) {
      // Already activated on this device
      await ctx.db.patch(existingActivation._id, { lastSeenAt: Date.now() });
      return { success: true, message: "Device already activated" };
    }

    // Check activation limit
    const activeCount = await ctx.db.query("license_activations")
      .withIndex("by_license", q => q.eq("licenseId", license._id))
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();

    if (license.maxActivations && activeCount.length >= license.maxActivations) {
      return { success: false, error: "Maximum activations reached" };
    }

    // Create activation
    await ctx.db.insert("license_activations", {
      licenseId: license._id,
      deviceId: args.deviceId,
      deviceName: args.deviceName,
      ipAddress: "TODO: get from request",
      userAgent: "TODO: get from request",
      isActive: true,
      firstActivatedAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    // Update activation count
    await ctx.db.patch(license._id, {
      currentActivations: activeCount.length + 1,
      updatedAt: Date.now(),
    });

    await dispatchEvent(ctx, "digital.license_activated", {
      licenseId: license._id,
      deviceId: args.deviceId,
    });

    return { success: true, message: "License activated successfully" };
  },
});
```

---

## 11. Security Considerations

### 11.1 Download Security

- Tokens are cryptographically random (32+ bytes)
- Token URLs are unguessable
- Files served from secure storage (signed URLs)
- Download logging for abuse detection

### 11.2 License Security

- Keys are unique and random
- Activation endpoint rate-limited
- Device fingerprinting for fraud detection
- License revocation on refund

---

## 12. Implementation Checklist

### Phase 1: Foundation
- [ ] Digital file storage schema
- [ ] Download token generation
- [ ] Secure download endpoint
- [ ] Download tracking

### Phase 2: Core Features
- [ ] My Downloads page
- [ ] Admin file upload
- [ ] License key generation
- [ ] License activation API

### Phase 3: Integration
- [ ] Order payment triggers
- [ ] Refund revocation
- [ ] Download email notifications
- [ ] Version update notifications

### Phase 4: Polish
- [ ] File versioning
- [ ] Bulk license generation
- [ ] Download analytics
- [ ] Activation management

---

## 13. Future Considerations

- **DRM Integration:** For high-value content
- **Streaming Delivery:** For large files
- **Expiring Content:** Time-limited access
- **Regional Restrictions:** Geo-based delivery
- **Watermarking:** Personalized files per customer

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | rec2cFIRHiOUxZUAJ |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Product Catalog PRD](./PRD-PRODUCT-CATALOG.md)
- [Order Management PRD](./PRD-ORDER-MANAGEMENT.md)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
