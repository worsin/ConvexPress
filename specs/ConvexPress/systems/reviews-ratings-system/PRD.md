# PRD: Reviews & Ratings

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
> **System Code:** CON-REV
> **Phase:** 5 of 6 (Post-Order & Engagement)
> **Priority:** P2 - Medium
> **Complexity:** Medium
> **Airtable Record:** rece9neJ6yC7GzXoq

---

## 1. Overview

### 1.1 Purpose

The Reviews & Ratings system enables customers to provide feedback on purchased products, helping future buyers make informed decisions. The system integrates with Google Business/Merchant Center to aggregate and display reviews from multiple sources, enhancing SEO and building trust. Reviews drive conversions, provide product insights, and support UGC marketing.

### 1.2 Scope

- Star ratings (1-5) with optional text review
- Verified purchase badge
- Review photos/images
- Review moderation workflow
- Helpful votes (upvoting useful reviews)
- Google Business/Merchant Center integration
- Review aggregation (Google reviews displayed on product pages)
- Review request emails post-purchase
- Admin moderation queue

### 1.3 Out of Scope

- Video reviews (future enhancement)
- Q&A system (separate system)
- Influencer/sponsored reviews
- Review incentives/rewards (handled by marketing)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Customer Accounts | USR-ACT | 1 | Review authors |
| Product Catalog | CAT-PRD | 2 | Products to review |
| Order Management | ORD-MGT | 4 | Verified purchase validation |
| Email Notifications | COM-EML | 1 | Review request emails |
| Media Library | PLT-MED | 1 | Review image uploads |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Product Catalog | CAT-PRD | 2 | Rating display on product cards |
| Search System | PLT-SRC | 2 | Rating as search ranking factor |
| Analytics & Reporting | ADM-RPT | 6 | Review metrics |

### 2.3 Integration Hooks to Implement

- Google Business API integration
- Google Merchant Center integration
- Product rating recalculation on review changes
- Schema.org Review markup for SEO

---

## 3. Google Integration

### 3.1 Google Business Profile API

The Google Business Profile API allows:
- Fetching reviews from linked Google Business location
- Displaying Google reviews alongside native reviews
- Responding to Google reviews from admin panel

**Setup Flow:**
1. Admin connects Google account (OAuth)
2. Selects Google Business Profile from list
3. System syncs existing reviews
4. Ongoing sync via scheduled job

### 3.2 Google Merchant Center Integration

For product-level reviews in Google Shopping:
- Submit reviews via Google Merchant Center API
- Product reviews appear in Google Shopping results
- Aggregate rating shown in product ads

**Requirements:**
- Valid Google Merchant Center account
- Product data feed configured
- Reviews must meet Google's quality guidelines

### 3.3 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      REVIEW SOURCES                              │
├─────────────────────────────────────────────────────────────────┤
│  Native Reviews (Convex)  ←──→  Google Business Reviews (API)   │
│                                                                  │
│  Both displayed on product pages with source indicator           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GOOGLE MERCHANT CENTER                        │
├─────────────────────────────────────────────────────────────────┤
│  Native reviews submitted → Appear in Google Shopping           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Routes

### 4.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Product Reviews | /products/:slug#reviews | _marketing | No | public |
| Write Review | /account/orders/:orderId/review | _account | Yes | customer |
| My Reviews | /account/reviews | _account | Yes | customer |

### 4.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Review Moderation | /admin/reviews | _admin | Yes | staff, manager, admin |
| Review Settings | /admin/settings/reviews | _admin | Yes | admin |
| Google Integration | /admin/settings/google-business | _admin | Yes | admin |

---

## 5. Data Model

### 5.1 Tables

```typescript
// Product reviews
product_reviews: defineTable({
  productId: v.id("products"),
  userId: v.id("user_profiles"),
  orderId: v.optional(v.id("order_records")), // For verified purchase

  // Review content
  rating: v.number(),                          // 1-5 stars
  title: v.optional(v.string()),               // Review headline
  body: v.optional(v.string()),                // Review text
  pros: v.optional(v.array(v.string())),       // What I liked
  cons: v.optional(v.array(v.string())),       // What could be better

  // Media
  images: v.optional(v.array(v.id("media"))),  // Review photos

  // Verification
  isVerifiedPurchase: v.boolean(),

  // Moderation
  status: v.union(
    v.literal("pending"),      // Awaiting moderation
    v.literal("approved"),     // Published
    v.literal("rejected"),     // Not published
    v.literal("flagged"),      // Reported by users
  ),
  moderatedBy: v.optional(v.id("user_profiles")),
  moderatedAt: v.optional(v.number()),
  moderationNote: v.optional(v.string()),

  // Engagement
  helpfulCount: v.number(),    // "Was this helpful?" yes votes
  reportCount: v.number(),     // Flagged as inappropriate

  // Source
  source: v.union(
    v.literal("native"),       // Submitted on our site
    v.literal("google"),       // Synced from Google
    v.literal("import"),       // Imported from other source
  ),
  externalId: v.optional(v.string()), // Google review ID if synced

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_product", ["productId", "status"])
  .index("by_user", ["userId"])
  .index("by_status", ["status", "createdAt"])
  .index("by_product_rating", ["productId", "rating"])
  .index("by_external", ["source", "externalId"])

// Review helpful votes
review_votes: defineTable({
  reviewId: v.id("product_reviews"),
  userId: v.id("user_profiles"),
  isHelpful: v.boolean(),        // true = helpful, false = not helpful
  createdAt: v.number(),
})
  .index("by_review", ["reviewId"])
  .index("by_user_review", ["userId", "reviewId"])

// Review images (linking to media library)
review_images: defineTable({
  reviewId: v.id("product_reviews"),
  mediaId: v.id("media"),
  order: v.number(),
  caption: v.optional(v.string()),
})
  .index("by_review", ["reviewId"])

// Google Business integration settings
google_business_settings: defineTable({
  accountId: v.string(),         // Google account ID
  locationId: v.string(),        // Business location ID
  locationName: v.string(),
  accessToken: v.string(),       // Encrypted OAuth token
  refreshToken: v.string(),      // Encrypted refresh token
  tokenExpiresAt: v.number(),
  lastSyncAt: v.optional(v.number()),
  syncEnabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

// Product rating cache (denormalized)
product_ratings: defineTable({
  productId: v.id("products"),
  averageRating: v.number(),     // Calculated average
  totalReviews: v.number(),      // Total approved reviews
  ratingDistribution: v.object({ // Count per star
    1: v.number(),
    2: v.number(),
    3: v.number(),
    4: v.number(),
    5: v.number(),
  }),
  lastUpdated: v.number(),
})
  .index("by_product", ["productId"])
```

---

## 6. Actions

### 6.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Submit Review | review.submit | Create new product review | customer |
| Edit Review | review.edit | Modify own review | customer |
| Delete Review | review.delete | Remove own review | customer |
| Vote Helpful | review.vote_helpful | Mark review as helpful | customer |
| Report Review | review.report | Flag inappropriate review | customer |

### 6.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Approve Review | review.approve | Publish pending review | staff, manager, admin |
| Reject Review | review.reject | Reject review with reason | staff, manager, admin |
| Feature Review | review.feature | Highlight on product page | manager, admin |
| Respond to Review | review.respond | Add seller response | manager, admin |
| Connect Google | review.connect_google | Link Google Business account | admin |

---

## 7. Events

### 7.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Review Submitted | review.submitted | Customer submits review | `{ reviewId, productId, userId, rating }` |
| Review Approved | review.approved | Staff approves review | `{ reviewId, productId, moderatedBy }` |
| Review Rejected | review.rejected | Staff rejects review | `{ reviewId, reason }` |
| Review Reported | review.reported | User flags review | `{ reviewId, reporterId, reason }` |

### 7.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| order.delivered | Order Management | Send review request email (7 days after delivery) |
| order.completed | Order Management | Enable review for purchased products |

---

## 8. Notifications

### 8.1 Email Notifications

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Review Request | order.delivered + 7 days | customer | `{{customerName}}, {{productName}}, {{reviewUrl}}` |
| Review Published | review.approved | customer | `{{productName}}, {{reviewUrl}}` |
| Review Rejected | review.rejected | customer | `{{productName}}, {{reason}}` |
| New Review Alert | review.submitted | admin | `{{productName}}, {{rating}}, {{reviewSnippet}}` |

### 8.2 Site Notifications

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| Review Published | review.approved | user | "Your review for {{productName}} has been published!" |
| Review Helpful | review.vote_helpful (x10) | user | "Your review is being helpful! 10 people found it useful." |

---

## 9. User Interface

### 9.1 Components Needed

- [ ] `StarRating` - Interactive star rating input
- [ ] `StarDisplay` - Read-only star display
- [ ] `ReviewCard` - Individual review display
- [ ] `ReviewList` - Paginated review list with filters
- [ ] `ReviewForm` - Write/edit review form
- [ ] `ReviewSummary` - Rating breakdown chart
- [ ] `ReviewImageUpload` - Multi-image upload for reviews
- [ ] `ReviewModerationQueue` - Admin moderation list
- [ ] `GoogleReviewBadge` - Indicator for Google-sourced reviews

### 9.2 Product Page Review Section

```
┌────────────────────────────────────────────────────────────────┐
│  Customer Reviews                                               │
├────────────────────────────────────────────────────────────────┤
│  ★★★★☆ 4.2 out of 5                                           │
│  Based on 127 reviews (89 native, 38 from Google)              │
│                                                                 │
│  ████████████████████ 5 star (68)                              │
│  ██████████          4 star (32)                               │
│  ████                3 star (15)                               │
│  ██                  2 star (8)                                │
│  █                   1 star (4)                                │
│                                                                 │
│  [Write a Review]                                               │
├────────────────────────────────────────────────────────────────┤
│  Sort by: [Most Recent ▼]  Filter: [All Ratings ▼]             │
├────────────────────────────────────────────────────────────────┤
│  ★★★★★  "Best purchase ever!"                                  │
│  John D. • Verified Purchase • Jan 15, 2025                    │
│  This product exceeded my expectations...                       │
│  [📷 3 photos]                                                  │
│  👍 15 people found this helpful                                │
│  [Helpful] [Report]                                             │
├────────────────────────────────────────────────────────────────┤
│  ★★★★☆  Great value      [Google Review badge]                 │
│  Sarah M. • via Google • Jan 10, 2025                          │
│  Good quality for the price...                                  │
└────────────────────────────────────────────────────────────────┘
```

### 9.3 Write Review Form

- Star rating selector (required)
- Review title (optional, 100 char max)
- Review body (optional, 2000 char max)
- Pros list (optional, up to 5 items)
- Cons list (optional, up to 5 items)
- Image upload (optional, up to 5 images)
- Terms acceptance checkbox

---

## 10. Business Rules

### 10.1 Validation Rules

- Rating: Required, 1-5 integer
- Title: Optional, 5-100 characters
- Body: Optional, 20-2000 characters
- Images: Optional, max 5, max 5MB each
- One review per product per customer
- Can only review products from completed orders (if verified purchase)

### 10.2 Moderation Rules

- All reviews enter "pending" status
- Auto-approve option for verified purchases with rating >= 4
- Flag for moderation if review contains:
  - Links or URLs
  - Email addresses or phone numbers
  - Profanity (configurable word list)
  - All caps text
- Auto-reject if from banned user

### 10.3 Rating Calculation

```typescript
// Weighted average with recency bias (optional)
function calculateProductRating(reviews: Review[]) {
  if (reviews.length === 0) return null;

  // Simple average for now
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10; // 1 decimal
}
```

### 10.4 Google Sync Rules

- Sync Google reviews every 6 hours
- Google reviews are read-only (cannot edit/delete)
- Admin can hide individual Google reviews from display
- Google reviews contribute to overall rating

---

## 11. API Design

### 11.1 Queries (Read Operations)

```typescript
// Get reviews for product
export const getProductReviews = query({
  args: {
    productId: v.id("products"),
    status: v.optional(v.string()), // For admin, default "approved" for public
    sortBy: v.optional(v.union(
      v.literal("recent"),
      v.literal("helpful"),
      v.literal("highest"),
      v.literal("lowest"),
    )),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Fetch reviews with pagination
    // Enrich with user data (name, avatar)
    // Include vote counts
  },
});

// Get product rating summary
export const getProductRating = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const rating = await ctx.db.query("product_ratings")
      .withIndex("by_product", q => q.eq("productId", args.productId))
      .unique();
    return rating;
  },
});

// Get user's reviews
export const getMyReviews = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    return ctx.db.query("product_reviews")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();
  },
});

// Check if user can review product
export const canReviewProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { canReview: false, reason: "not_logged_in" };

    // Check if already reviewed
    const existing = await ctx.db.query("product_reviews")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .filter(q => q.eq(q.field("productId"), args.productId))
      .first();

    if (existing) return { canReview: false, reason: "already_reviewed" };

    // Check if purchased
    const order = await findOrderWithProduct(ctx, user._id, args.productId);

    return {
      canReview: true,
      isVerifiedPurchase: !!order,
      orderId: order?._id,
    };
  },
});

// Admin: Get moderation queue
export const getModerationQueue = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const status = args.status || "pending";
    return ctx.db.query("product_reviews")
      .withIndex("by_status", q => q.eq("status", status))
      .order("asc") // Oldest first
      .take(50);
  },
});
```

### 11.2 Mutations (Write Operations)

```typescript
// Submit review
export const submitReview = mutation({
  args: {
    productId: v.id("products"),
    orderId: v.optional(v.id("order_records")),
    rating: v.number(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    pros: v.optional(v.array(v.string())),
    cons: v.optional(v.array(v.string())),
    imageIds: v.optional(v.array(v.id("media"))),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Validate rating
    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    // Check for existing review
    const existing = await ctx.db.query("product_reviews")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .filter(q => q.eq(q.field("productId"), args.productId))
      .first();

    if (existing) throw new Error("You have already reviewed this product");

    // Validate verified purchase
    let isVerifiedPurchase = false;
    if (args.orderId) {
      const order = await ctx.db.get(args.orderId);
      if (order && order.userId === user._id && order.status === "delivered") {
        isVerifiedPurchase = true;
      }
    }

    // Determine initial status
    let status = "pending";
    if (isVerifiedPurchase && args.rating >= 4) {
      status = "approved"; // Auto-approve positive verified reviews
    }

    const reviewId = await ctx.db.insert("product_reviews", {
      productId: args.productId,
      userId: user._id,
      orderId: args.orderId,
      rating: args.rating,
      title: args.title,
      body: args.body,
      pros: args.pros,
      cons: args.cons,
      images: args.imageIds,
      isVerifiedPurchase,
      status,
      helpfulCount: 0,
      reportCount: 0,
      source: "native",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update product rating if auto-approved
    if (status === "approved") {
      await updateProductRating(ctx, args.productId);
    }

    // Dispatch event
    await dispatchEvent(ctx, "review.submitted", {
      reviewId,
      productId: args.productId,
      userId: user._id,
      rating: args.rating,
    });

    return reviewId;
  },
});

// Vote review helpful
export const voteHelpful = mutation({
  args: {
    reviewId: v.id("product_reviews"),
    isHelpful: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Check for existing vote
    const existing = await ctx.db.query("review_votes")
      .withIndex("by_user_review", q =>
        q.eq("userId", user._id).eq("reviewId", args.reviewId)
      )
      .unique();

    if (existing) {
      // Update existing vote
      await ctx.db.patch(existing._id, { isHelpful: args.isHelpful });
    } else {
      // Create new vote
      await ctx.db.insert("review_votes", {
        reviewId: args.reviewId,
        userId: user._id,
        isHelpful: args.isHelpful,
        createdAt: Date.now(),
      });
    }

    // Update helpful count on review
    await recalculateHelpfulCount(ctx, args.reviewId);
  },
});

// Admin: Approve review
export const approveReview = mutation({
  args: { reviewId: v.id("product_reviews") },
  handler: async (ctx, args) => {
    const admin = await requireStaff(ctx);
    const review = await ctx.db.get(args.reviewId);

    if (!review) throw new Error("Review not found");

    await ctx.db.patch(args.reviewId, {
      status: "approved",
      moderatedBy: admin._id,
      moderatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update product rating
    await updateProductRating(ctx, review.productId);

    // Dispatch event
    await dispatchEvent(ctx, "review.approved", {
      reviewId: args.reviewId,
      productId: review.productId,
      moderatedBy: admin._id,
    });
  },
});

// Admin: Reject review
export const rejectReview = mutation({
  args: {
    reviewId: v.id("product_reviews"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireStaff(ctx);
    const review = await ctx.db.get(args.reviewId);

    if (!review) throw new Error("Review not found");

    await ctx.db.patch(args.reviewId, {
      status: "rejected",
      moderatedBy: admin._id,
      moderatedAt: Date.now(),
      moderationNote: args.reason,
      updatedAt: Date.now(),
    });

    // Dispatch event
    await dispatchEvent(ctx, "review.rejected", {
      reviewId: args.reviewId,
      reason: args.reason,
    });
  },
});
```

### 11.3 Actions (External Operations)

```typescript
// Sync Google Business reviews
export const syncGoogleReviews = action({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.runQuery(internal.reviews.getGoogleSettings);
    if (!settings || !settings.syncEnabled) return;

    // Refresh token if needed
    const accessToken = await refreshGoogleToken(settings);

    // Fetch reviews from Google Business API
    const response = await fetch(
      `https://mybusiness.googleapis.com/v4/accounts/${settings.accountId}/locations/${settings.locationId}/reviews`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await response.json();

    // Upsert reviews
    for (const review of data.reviews) {
      await ctx.runMutation(internal.reviews.upsertGoogleReview, {
        externalId: review.reviewId,
        // ... map fields
      });
    }

    // Update last sync time
    await ctx.runMutation(internal.reviews.updateSyncTime, {
      settingsId: settings._id,
    });
  },
});
```

---

## 12. Schema.org Integration

### 12.1 Product Review Markup

```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Product Name",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.2",
    "reviewCount": "127"
  },
  "review": [
    {
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5"
      },
      "author": {
        "@type": "Person",
        "name": "John D."
      },
      "reviewBody": "This product exceeded my expectations..."
    }
  ]
}
```

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Review schema definition
- [ ] Rating submission mutation
- [ ] Product rating cache and calculation
- [ ] Basic review display component

### Phase 2: Core Features
- [ ] Review form with validation
- [ ] Review moderation queue
- [ ] Helpful voting system
- [ ] Review images upload

### Phase 3: Integration
- [ ] Google Business API connection
- [ ] Google review sync
- [ ] Review request email automation
- [ ] Schema.org markup

### Phase 4: Polish
- [ ] Review filtering and sorting
- [ ] Admin response to reviews
- [ ] Performance optimization
- [ ] Analytics integration

---

## 14. Future Considerations

- **Video Reviews:** Support video uploads
- **AI Moderation:** Auto-detect spam/inappropriate content
- **Sentiment Analysis:** Extract insights from review text
- **Review Incentives:** Reward points for reviews
- **Verified Expert Reviews:** Partner/influencer reviews

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | rece9neJ6yC7GzXoq |
| Routes | recztsVCvT5y5cyux, recXvXjOsj7YhVryy |
| Actions | recstz3J0v7Z3L5wQ, recGgSWJCZ8UE9Fu1, recONUUmqKueFHlvu, reckXEOr8IS7LKDOr, recGzQad1VIfw8CGc, reckPLM150eD7zgGR |
| Events | recXMF2EPVD9SCLpU, rechqGBtcaFS3ErFD, rec7qgnfxSTfjZDBO, rec0nThfzC9hG5FfZ |
| Email Notifications | recyZkuS0IbxirNg6, rec2mF7RGFidT2A52, recWPVN3ttBIPoM50, recC9SxXFPUyoq7vL, recIXgvqfyoh7YmW6 |
| Site Notifications | recLMGYOYFhd5TCjf, recpe0o7VdOqrS7sP, rechmzxSMaxQe422s, recBuEcP3iUeA2LC2 |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Product Catalog PRD](./PRD-PRODUCT-CATALOG.md)
- [Google Business Profile API](https://developers.google.com/my-business/reference/rest)
- [Google Merchant Center](https://developers.google.com/shopping-content/guides/reviews)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
