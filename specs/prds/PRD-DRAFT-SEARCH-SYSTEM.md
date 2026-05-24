# PRD: Search System

> **Status:** DRAFT - Awaiting Review & Enhancement
> **System Code:** PLT-SRC
> **Phase:** 2 of 6 (Configuration & Catalog)
> **Priority:** P1 - High
> **Complexity:** Medium
> **Airtable Record:** [redacted-airtable-record-id]

---

## 1. Overview

### 1.1 Purpose

The Search System provides fast, typo-tolerant, full-text search across the product catalog using Meilisearch. It enables customers to quickly find products through search bar queries, faceted filtering, and autocomplete suggestions. Search analytics help optimize the catalog and identify gaps.

**Technology Decision:** Meilisearch is chosen for:
- Sub-millisecond search response times
- Built-in typo tolerance and relevance tuning
- Faceted filtering support
- Simple self-hosting or cloud deployment
- Excellent developer experience

### 1.2 Scope

- Full-text product search with Meilisearch
- Autocomplete/search-as-you-type suggestions
- Faceted filtering (category, price range, attributes)
- Search result ranking and relevance tuning
- Search analytics (popular terms, no-results queries)
- Real-time index sync from Convex
- UCP (Universal Commerce Protocol) compatibility

### 1.3 Out of Scope

- Personalized search results (future ML enhancement)
- Visual/image search
- Voice search
- Search A/B testing framework

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Product Catalog | CAT-PRD | 2 | Products to index and search |
| Category System | CAT-CAT | 2 | Category facets |
| Product Variants | CAT-VAR | 3 | Variant data in search |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Admin Dashboard | ADM-DSH | 6 | Search analytics widgets |
| Analytics & Reporting | ADM-RPT | 6 | Search conversion metrics |
| API System | PLT-API | 4 | Search API endpoints |

### 2.3 Integration Hooks to Implement

- Product index sync on create/update/delete
- Search event logging for analytics
- Meilisearch admin API for index management
- UCP SearchAction schema support

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Search Results | /search | _marketing | No | public |
| Search Autocomplete | /api/search/suggest | API | No | public |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Search Analytics | /admin/analytics/search | _admin | Yes | manager, admin |
| Search Settings | /admin/settings/search | _admin | Yes | admin |

---

## 4. Data Model

### 4.1 Meilisearch Index Schema

```typescript
// Meilisearch "products" index document structure
interface ProductSearchDocument {
  // Primary key
  id: string;                    // Convex product _id

  // Searchable fields
  name: string;
  description: string;
  shortDescription: string;
  sku: string;
  brand: string;
  tags: string[];

  // Filterable fields
  categoryIds: string[];
  categoryNames: string[];
  status: "active" | "draft" | "archived";
  inStock: boolean;

  // Sortable fields
  basePrice: number;
  salePrice: number | null;
  rating: number;
  reviewCount: number;
  createdAt: number;

  // Display fields (not searchable)
  slug: string;
  thumbnail: string;
  images: string[];
}
```

### 4.2 Convex Tables for Analytics

```typescript
// Search queries log
search_queries: defineTable({
  query: v.string(),                    // Search term
  resultsCount: v.number(),             // Number of results
  userId: v.optional(v.id("user_profiles")),
  sessionId: v.optional(v.string()),    // For guest tracking
  filters: v.optional(v.any()),         // Applied filters
  clickedProductId: v.optional(v.id("products")), // If user clicked a result
  timestamp: v.number(),
})
  .index("by_timestamp", ["timestamp"])
  .index("by_query", ["query"])

// Popular searches cache (aggregated)
popular_searches: defineTable({
  query: v.string(),
  count: v.number(),
  lastUpdated: v.number(),
  period: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
})
  .index("by_count", ["period", "count"])

// No-results queries (for catalog optimization)
search_no_results: defineTable({
  query: v.string(),
  count: v.number(),
  lastSeen: v.number(),
  resolved: v.boolean(),              // Admin marked as addressed
})
  .index("by_count", ["count"])
  .index("by_unresolved", ["resolved", "count"])
```

### 4.3 Meilisearch Settings

```typescript
const searchSettings = {
  // Searchable attributes (priority order)
  searchableAttributes: [
    "name",
    "brand",
    "sku",
    "tags",
    "shortDescription",
    "description",
  ],

  // Filterable attributes
  filterableAttributes: [
    "categoryIds",
    "categoryNames",
    "status",
    "inStock",
    "basePrice",
    "salePrice",
    "rating",
  ],

  // Sortable attributes
  sortableAttributes: [
    "basePrice",
    "salePrice",
    "rating",
    "reviewCount",
    "createdAt",
  ],

  // Ranking rules (relevance tuning)
  rankingRules: [
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
    "rating:desc",      // Boost highly-rated products
  ],

  // Typo tolerance
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 4,
      twoTypos: 8,
    },
  },
};
```

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Search Products | search.query | Execute product search | public |
| Get Suggestions | search.suggest | Autocomplete suggestions | public |
| Filter Results | search.filter | Apply faceted filters | public |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Rebuild Index | search.rebuild_index | Full index rebuild from Convex | admin |
| View Analytics | search.view_analytics | View search metrics | manager, admin |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Search Performed | search.performed | User executes search | `{ query, resultsCount, userId?, sessionId }` |
| Search Result Clicked | search.result_clicked | User clicks search result | `{ query, productId, position, userId? }` |
| Index Updated | search.index_updated | Products synced to Meilisearch | `{ documentCount, duration }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| product.created | Product Catalog | Add document to search index |
| product.updated | Product Catalog | Update document in search index |
| product.deleted | Product Catalog | Remove document from search index |
| product.archived | Product Catalog | Remove from index (or mark inactive) |

---

## 7. Architecture

### 7.1 Meilisearch Deployment

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Website App   │────▶│   Meilisearch   │◀────│   Admin App     │
│  (Search UI)    │     │   (Search DB)   │     │ (Index Mgmt)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               ▲
                               │
                        ┌──────┴──────┐
                        │   Convex    │
                        │ (Source DB) │
                        └─────────────┘
```

**Index Sync Strategy:**
1. **Real-time:** Convex mutation triggers sync Meilisearch on product changes
2. **Batch:** Scheduled job rebuilds index nightly for consistency
3. **Manual:** Admin can trigger full rebuild from dashboard

### 7.2 Meilisearch Connection

```typescript
// Environment variables
MEILISEARCH_HOST=http://meilisearch:7700  // Docker service or cloud URL
MEILISEARCH_API_KEY=your-master-key       // For admin operations
MEILISEARCH_SEARCH_KEY=your-search-key    // For frontend search (read-only)
```

---

## 8. User Interface

### 8.1 Components Needed

- [ ] `SearchBar` - Main search input with autocomplete dropdown
- [ ] `SearchSuggestions` - Autocomplete results list
- [ ] `SearchResults` - Results grid with pagination
- [ ] `SearchFilters` - Faceted filter sidebar
- [ ] `SearchSort` - Sort dropdown (relevance, price, rating, newest)
- [ ] `NoResultsState` - Empty state with suggestions
- [ ] `SearchAnalyticsDashboard` - Admin analytics view

### 8.2 Search Bar Behavior

1. **Idle:** Placeholder "Search products..."
2. **Typing:** Debounced autocomplete (150ms delay)
3. **Suggestions:** Show top 5-8 product suggestions + categories
4. **Submit:** Navigate to /search?q=query with full results
5. **Mobile:** Full-screen search overlay

### 8.3 Search Results Page

- URL: `/search?q=query&category=X&priceMin=Y&priceMax=Z&sort=relevance`
- Faceted filters: Category, Price Range, In Stock, Rating
- Sort options: Relevance, Price (Low/High), Rating, Newest
- Pagination: 24 products per page
- "Did you mean?" for typo suggestions

---

## 9. Business Rules

### 9.1 Search Logic

- **Typo tolerance:** Allow 1 typo for 4+ char words, 2 typos for 8+ char words
- **Phrase matching:** "blue shirt" matches products with both words near each other
- **Prefix search:** "sne" matches "sneakers", "sneaky", etc.
- **Synonyms:** Configure admin-defined synonyms (e.g., "tee" = "t-shirt")

### 9.2 Ranking Factors

1. Text relevance (word match, typo count, proximity)
2. Product rating (higher rated products boosted)
3. Availability (in-stock products boosted)
4. Recency (newer products slightly boosted)

### 9.3 Edge Cases

- **Empty query:** Show popular products or categories
- **No results:** Log query, show "Did you mean?" and category suggestions
- **Very long query:** Truncate to first 100 characters
- **Special characters:** Escape or strip for safety

---

## 10. API Design

### 10.1 Meilisearch Direct Search (Client-Side)

```typescript
// Frontend search using Meilisearch JS client
import { instantMeiliSearch } from "@meilisearch/instant-meilisearch";

const searchClient = instantMeiliSearch(
  process.env.NEXT_PUBLIC_MEILISEARCH_HOST,
  process.env.NEXT_PUBLIC_MEILISEARCH_SEARCH_KEY,
);

// Use with InstantSearch React components
<InstantSearch indexName="products" searchClient={searchClient}>
  <SearchBox />
  <Hits />
  <RefinementList attribute="categoryNames" />
  <RangeInput attribute="basePrice" />
</InstantSearch>
```

### 10.2 Convex Backend (Index Sync)

```typescript
// Sync product to Meilisearch
export const syncProduct = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.runQuery(internal.products.getForSearch, {
      productId: args.productId
    });

    const meilisearch = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_API_KEY,
    });

    await meilisearch.index("products").addDocuments([product]);
  },
});

// Full index rebuild
export const rebuildIndex = action({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.runQuery(internal.products.getAllForSearch);

    const meilisearch = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_API_KEY,
    });

    // Clear and rebuild
    await meilisearch.index("products").deleteAllDocuments();
    await meilisearch.index("products").addDocuments(products);

    // Apply settings
    await meilisearch.index("products").updateSettings(searchSettings);
  },
});
```

### 10.3 Search Analytics Logging (Convex)

```typescript
// Log search query
export const logSearch = mutation({
  args: {
    query: v.string(),
    resultsCount: v.number(),
    filters: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    await ctx.db.insert("search_queries", {
      query: args.query,
      resultsCount: args.resultsCount,
      userId: user?._id,
      sessionId: !user ? getSessionId(ctx) : undefined,
      filters: args.filters,
      timestamp: Date.now(),
    });

    // Update no-results tracking
    if (args.resultsCount === 0) {
      await updateNoResultsQuery(ctx, args.query);
    }

    // Dispatch event
    await dispatchEvent(ctx, "search.performed", {
      query: args.query,
      resultsCount: args.resultsCount,
    });
  },
});
```

---

## 11. UCP Integration

### 11.1 SearchAction Schema (Universal Commerce Protocol)

```json
{
  "@context": "https://schema.org",
  "@type": "SearchAction",
  "target": {
    "@type": "EntryPoint",
    "urlTemplate": "https://store.com/search?q={search_term_string}",
    "actionPlatform": [
      "https://schema.org/DesktopWebPlatform",
      "https://schema.org/MobileWebPlatform"
    ]
  },
  "query-input": "required name=search_term_string"
}
```

### 11.2 Product Schema for Search Enrichment

Include rich schema.org markup on product pages for Google Shopping integration.

---

## 12. Security Considerations

### 12.1 API Key Management

- **Master Key:** Server-side only, never exposed to client
- **Search Key:** Read-only, safe for client-side use
- **Admin Key:** For index management, server-side only

### 12.2 Search Input Sanitization

- Escape special characters to prevent injection
- Rate limit search requests (10 req/sec per IP)
- Maximum query length: 100 characters

### 12.3 Analytics Privacy

- Hash or anonymize IP addresses
- Don't log PII in search queries
- Allow users to opt-out of search tracking

---

## 13. Testing Strategy

### 13.1 Unit Tests

- Search query parsing
- Filter application
- Index document transformation
- Analytics aggregation

### 13.2 Integration Tests

- Convex → Meilisearch sync
- Product CRUD triggers index update
- Search results match expectations

### 13.3 E2E Tests

- Search bar autocomplete flow
- Filter and sort combinations
- No results handling
- Mobile search experience

---

## 14. Implementation Checklist

### Phase 1: Foundation
- [ ] Set up Meilisearch (Docker or cloud)
- [ ] Create products index with settings
- [ ] Build index sync action from Convex
- [ ] Implement full rebuild job

### Phase 2: Core Features
- [ ] SearchBar component with autocomplete
- [ ] Search results page with pagination
- [ ] Faceted filters (category, price, stock)
- [ ] Sort options

### Phase 3: Integration
- [ ] Product event listeners for real-time sync
- [ ] Search analytics logging
- [ ] Admin analytics dashboard
- [ ] UCP SearchAction schema

### Phase 4: Polish
- [ ] Relevance tuning and synonyms
- [ ] "Did you mean?" suggestions
- [ ] No-results recommendations
- [ ] Performance optimization

---

## 15. Meilisearch Server Setup

### 15.1 Docker Compose

```yaml
# Add to docker-compose.yml
services:
  meilisearch:
    image: getmeili/meilisearch:v1.6
    container_name: shopping-cart-meilisearch
    ports:
      - "7700:7700"
    environment:
      - MEILI_MASTER_KEY=${MEILISEARCH_MASTER_KEY}
      - MEILI_ENV=production
    volumes:
      - meilisearch_data:/meili_data
    restart: unless-stopped

volumes:
  meilisearch_data:
```

### 15.2 Cloud Option (Meilisearch Cloud)

For production, consider Meilisearch Cloud for:
- Managed infrastructure
- Automatic backups
- High availability
- Zero maintenance

---

## 16. Future Considerations

- **AI-Powered Search:** Vector search for semantic matching
- **Personalization:** User history-based ranking
- **Visual Search:** Search by image upload
- **Search A/B Testing:** Test different ranking strategies
- **Analytics ML:** Predict search intent, auto-suggest improvements

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | [redacted-airtable-record-id] |
| Routes | [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id] |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Product Catalog PRD](./PRD-PRODUCT-CATALOG.md)
- [Meilisearch Docs](https://www.meilisearch.com/docs)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
