# SEO System - Full Code Audit

**Date:** 2026-02-13
**Auditor:** SEO System Expert (AI)
**Scope:** Complete SEO System across backend (schema, helpers, functions) and both frontends (admin + website)

---

## Executive Summary

The SEO System is one of the most comprehensive and well-implemented systems in ConvexPress. It covers ~50 files across backend schema, helpers, validators, mutations, queries, internals, admin components (25), admin hooks (5), admin lib (6), website components (4), and website lib (4). The architecture closely follows the knowledge doc specification with a clean separation between backend resolution, admin editing, and website rendering.

**Overall Health: GOOD**

Key strengths:
- No Radix UI imports (fully compliant)
- No deprecated React patterns (forwardRef, React.FC, defaultProps)
- Clean modular schema following conventions
- Comprehensive client-side SEO analysis engine (14 checks) and readability engine (8 checks)
- Proper Convex best practices (indexes, typed validators, clear separation)
- Well-documented code with JSDoc comments throughout

Key concerns:
- Security gap in `getSettings` query (no auth check for sensitive keys)
- Security gap in `getSeoOverview` query (no capability check)
- N+1 performance issue in `getSeoOverview` (one query per published post)
- Bug in `constants.ts` date archive config mapping to wrong template field
- Knowledge doc out of sync with implementation on capability names

---

## Files Audited (50+)

### Backend (6 files)
| File | Path |
|------|------|
| Schema | `ConvexPress-Admin/packages/backend/convex/schema/seo.ts` |
| Helpers | `ConvexPress-Admin/packages/backend/convex/helpers/seo.ts` |
| Mutations | `ConvexPress-Admin/packages/backend/convex/seo/mutations.ts` |
| Queries | `ConvexPress-Admin/packages/backend/convex/seo/queries.ts` |
| Internals | `ConvexPress-Admin/packages/backend/convex/seo/internals.ts` |
| Validators | `ConvexPress-Admin/packages/backend/convex/seo/validators.ts` |

### Admin Frontend - Routes (4 files)
| File | Path |
|------|------|
| SEO Layout | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/seo.tsx` |
| SEO Overview | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/seo/index.tsx` |
| SEO Settings | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/seo/settings.tsx` |
| Sitemap Settings | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/seo/sitemap.tsx` |

### Admin Frontend - Components (25 files)
| File | Path |
|------|------|
| SeoMetabox | `ConvexPress-Admin/apps/web/src/components/seo/SeoMetabox.tsx` |
| SeoMetaboxSeoTab | `ConvexPress-Admin/apps/web/src/components/seo/SeoMetaboxSeoTab.tsx` |
| SeoMetaboxReadabilityTab | `ConvexPress-Admin/apps/web/src/components/seo/SeoMetaboxReadabilityTab.tsx` |
| SeoMetaboxSchemaTab | `ConvexPress-Admin/apps/web/src/components/seo/SeoMetaboxSchemaTab.tsx` |
| SeoMetaboxSocialTab | `ConvexPress-Admin/apps/web/src/components/seo/SeoMetaboxSocialTab.tsx` |
| SerpPreview | `ConvexPress-Admin/apps/web/src/components/seo/SerpPreview.tsx` |
| FacebookPreview | `ConvexPress-Admin/apps/web/src/components/seo/FacebookPreview.tsx` |
| TwitterPreview | `ConvexPress-Admin/apps/web/src/components/seo/TwitterPreview.tsx` |
| SeoScoreBadge | `ConvexPress-Admin/apps/web/src/components/seo/SeoScoreBadge.tsx` |
| CharacterCounter | `ConvexPress-Admin/apps/web/src/components/seo/CharacterCounter.tsx` |
| SeoAnalysisResults | `ConvexPress-Admin/apps/web/src/components/seo/SeoAnalysisResults.tsx` |
| TemplateVariableInput | `ConvexPress-Admin/apps/web/src/components/seo/TemplateVariableInput.tsx` |
| SeoSettingsForm | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsForm.tsx` |
| SeoSettingsGeneral | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsGeneral.tsx` |
| SeoSettingsContentTypes | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsContentTypes.tsx` |
| SeoSettingsSocial | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsSocial.tsx` |
| SeoSettingsSchema | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsSchema.tsx` |
| SeoSettingsBreadcrumbs | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsBreadcrumbs.tsx` |
| SeoSettingsVerification | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsVerification.tsx` |
| SeoSettingsRobots | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsRobots.tsx` |
| SeoSettingsAdvanced | `ConvexPress-Admin/apps/web/src/components/seo/SeoSettingsAdvanced.tsx` |
| SeoScoreChart | `ConvexPress-Admin/apps/web/src/components/seo/SeoScoreChart.tsx` |
| SeoIssuesList | `ConvexPress-Admin/apps/web/src/components/seo/SeoIssuesList.tsx` |
| SeoOverviewDashboard | `ConvexPress-Admin/apps/web/src/components/seo/SeoOverviewDashboard.tsx` |
| SeoRecentTable | `ConvexPress-Admin/apps/web/src/components/seo/SeoRecentTable.tsx` |

### Admin Frontend - Hooks (5 files)
| File | Path |
|------|------|
| useSeoSettings | `ConvexPress-Admin/apps/web/src/hooks/seo/useSeoSettings.ts` |
| usePostSeo | `ConvexPress-Admin/apps/web/src/hooks/seo/usePostSeo.ts` |
| useSeoMutations | `ConvexPress-Admin/apps/web/src/hooks/seo/useSeoMutations.ts` |
| useSeoAnalysis | `ConvexPress-Admin/apps/web/src/hooks/seo/useSeoAnalysis.ts` |
| useReadabilityAnalysis | `ConvexPress-Admin/apps/web/src/hooks/seo/useReadabilityAnalysis.ts` |

### Admin Frontend - Lib (6 files)
| File | Path |
|------|------|
| types | `ConvexPress-Admin/apps/web/src/lib/seo/types.ts` |
| constants | `ConvexPress-Admin/apps/web/src/lib/seo/constants.ts` |
| analysis | `ConvexPress-Admin/apps/web/src/lib/seo/analysis.ts` |
| readability | `ConvexPress-Admin/apps/web/src/lib/seo/readability.ts` |
| templates | `ConvexPress-Admin/apps/web/src/lib/seo/templates.ts` |
| utils | `ConvexPress-Admin/apps/web/src/lib/seo/utils.ts` |

### Website Frontend - Components (4 files)
| File | Path |
|------|------|
| SeoHead | `ConvexPress-Website/apps/web/src/components/seo/SeoHead.tsx` |
| JsonLd | `ConvexPress-Website/apps/web/src/components/seo/JsonLd.tsx` |
| SeoBreadcrumbs | `ConvexPress-Website/apps/web/src/components/seo/SeoBreadcrumbs.tsx` |
| FeedDiscoveryHead | `ConvexPress-Website/apps/web/src/components/seo/FeedDiscoveryHead.tsx` |

### Website Frontend - Lib (4 files)
| File | Path |
|------|------|
| types | `ConvexPress-Website/apps/web/src/lib/seo/types.ts` |
| resolve | `ConvexPress-Website/apps/web/src/lib/seo/resolve.ts` |
| jsonld | `ConvexPress-Website/apps/web/src/lib/seo/jsonld.ts` |
| breadcrumbs | `ConvexPress-Website/apps/web/src/lib/seo/breadcrumbs.ts` |

### Website Frontend - Routes (1 file)
| File | Path |
|------|------|
| robots.txt API | `ConvexPress-Website/apps/web/src/routes/api/robots.tsx` |

---

## Audit Results by Category

### 1. Hardcoded Colors

**Status: MINOR ISSUES FOUND**

The SEO system uses hardcoded Tailwind color names (emerald, amber, red) for semantic status indicators (good/warning/error). These are NOT layout colors (zinc, slate, gray), which are explicitly banned. Status colors are a gray area -- they are semantic and consistently used across the entire system.

**Files affected:**

| File | Colors Used | Context |
|------|-------------|---------|
| `CharacterCounter.tsx` | `text-emerald-500`, `text-amber-500`, `text-red-500` | Character count status |
| `SeoAnalysisResults.tsx` | `text-emerald-500`, `text-amber-500`, `text-red-500` | Check result icons |
| `SeoScoreChart.tsx` | `bg-emerald-500`, `bg-amber-500`, `bg-red-500`, `text-emerald-500`, etc. | Score distribution bars |
| `SeoIssuesList.tsx` | `text-emerald-500`, `text-amber-500`, `bg-emerald-500/10`, `border-emerald-500/20` | Issue severity |
| `SeoRecentTable.tsx` | `text-emerald-500`, `text-red-500/70`, `bg-red-500/10`, `bg-amber-500/10`, `text-amber-600` | Status icons, flags |
| `SeoScoreBadge.tsx` | `bg-emerald-500`, `bg-amber-500`, `bg-red-500`, `bg-muted` | Score circle colors |
| `utils.ts` | Returns `text-emerald-500`, `text-amber-500`, `text-red-500`, `bg-emerald-500/15`, etc. | Utility functions |

**Severity: LOW**
These are semantic status colors (good/warning/error), not layout colors. They are consistently used and the CLAUDE.md rule specifically bans "zinc, slate, gray." However, for maximum compliance, consider extracting to CSS custom properties like `--color-status-good`, `--color-status-warning`, `--color-status-error`.

---

### 2. Radix UI Imports

**Status: CLEAN -- NO ISSUES**

Zero Radix UI imports found in any SEO system file. All components use native HTML elements, CSS, and Lucide icons. Fully compliant.

---

### 3. TypeScript Issues

**Status: MINOR ISSUES FOUND**

| Severity | File | Line(s) | Issue |
|----------|------|---------|-------|
| LOW | `internals.ts` | ~125 | `(media as { url: string }).url` -- unsafe cast; media may not have a `url` field |
| LOW | `internals.ts` | ~134 | `post.type as "post" \| "page"` -- type narrowing assertion |
| LOW | `queries.ts` | ~341 | `post.type as string` -- unnecessary cast (already string) |
| LOW | `resolve.ts` (website) | multiple | `(social as Record<string, unknown>)` -- casts for accessing social settings fields |
| LOW | Multiple settings components | multiple | `as Record<string, unknown>` when parsing settings values |

**Severity: LOW**
These are all safe runtime assertions that work correctly. The underlying types from Convex are loosely typed (`v.any()` for JSON settings values), making some casts necessary. No actual runtime errors would result from these patterns.

**Recommendation:** Consider adding proper type guards in `helpers/seo.ts` for settings parsing to eliminate downstream casts. For example, create a `isSocialSettings(value: unknown): value is SeoSocialSettings` guard.

---

### 4. Security & Auth Issues

| Severity | File | Issue | Detail |
|----------|------|-------|--------|
| **HIGH** | `queries.ts` (`getSettings`) | **Missing auth check for robots/advanced keys** | The comment says "Robots and advanced require authentication" but NO auth check is implemented. Any unauthenticated user can read robots rules and advanced settings. This is documented intention vs. actual behavior. |
| **MEDIUM** | `queries.ts` (`getSeoOverview`) | **Missing capability check** | Uses `getCurrentUser(ctx)` to verify the user is logged in, but does NOT check the `manage_options` capability. Any authenticated user (even Subscribers) can view the SEO overview dashboard data. Should use `requireCan(ctx, "seo.update_global")` or at minimum check for Administrator/Editor role. |
| LOW | `queries.ts` (`getPostSeo`) | **No draft protection** | Returns SEO data for any postId regardless of post status. For published posts this is correct (website needs it). For draft/private posts, unpublished SEO data is technically exposed. Low severity since SEO meta is not sensitive data. |

**Details on HIGH issue (getSettings):**

```typescript
// queries.ts line 77-108
export const getSettings = query({
  args: getSettingsArgs,
  handler: async (ctx, args) => {
    const { key } = args;
    // NOTE: No auth check here at all!
    // Robots and advanced settings are returned to anyone.
    if (key) {
      const row = await ctx.db
        .query("seoSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      // ...returns data without checking auth
    }
  },
});
```

**Fix:** Add auth check when `key === "robots"` or `key === "advanced"`:
```typescript
if (key === "robots" || key === "advanced") {
  await requireCan(ctx, "seo.update_robots");
}
```

---

### 5. React 19 Compatibility

**Status: CLEAN -- NO ISSUES**

- No `forwardRef` usage (React 19 deprecated pattern)
- No `React.FC` type annotations
- No `defaultProps` usage
- No `PropTypes` usage
- All components use modern function component patterns
- Hooks follow standard React patterns (useState, useEffect, useCallback, useMemo)

---

### 6. Dead Code

**Status: CLEAN -- NO ISSUES**

No dead code, unused imports, or orphaned functions detected across the entire SEO system. All files are actively imported and used.

---

### 7. Import Resolution

**Status: CLEAN -- NO ISSUES**

All imports resolve correctly:
- Backend helpers: `../helpers/seo` (relative)
- Backend validators: `./validators` (relative)
- Backend permissions: `../helpers/permissions` (relative)
- Admin frontend: `@/components/seo/*`, `@/hooks/seo/*`, `@/lib/seo/*` (path aliases)
- Website frontend: `@/lib/seo/*`, `@/components/seo/*` (path aliases)
- Cross-app: `@convexpress-admin/backend/convex/_generated/api` (package alias in ConvexPress-Website)
- Convex API: `convex/react`, `convex/browser` (package imports)

The `FeedDiscoveryHead.tsx` imports from `@/lib/feeds/types` which is part of the RSS Feed System (cross-system dependency, valid).

---

### 8. Convex Best Practices

| Severity | File | Issue | Detail |
|----------|------|-------|--------|
| **MEDIUM** | `queries.ts` (`getSeoOverview`) | **N+1 query pattern** | Iterates over ALL published posts and runs a separate `ctx.db.query("postMeta")` for EACH post. For a site with 500 posts, this is 500+ DB queries in a single Convex query. Convex queries have execution limits. |
| LOW | `queries.ts` (`getRobotsTxt`) | **Relative sitemap path** | Uses `/sitemap.xml` as relative path in robots.txt output instead of full URL like `https://example.com/sitemap.xml`. Google recommends absolute URLs in robots.txt. |
| LOW | `helpers/seo.ts` | **defaultArticleType typed as `string`** | The `SeoSchemaSettings.defaultArticleType` is typed as `string` instead of the union `"Article" \| "BlogPosting" \| "NewsArticle" \| "TechArticle"` defined in validators. |

**Details on MEDIUM issue (N+1 in getSeoOverview):**

```typescript
// queries.ts lines 289-351
for (const post of allPublished) {
  // This runs once per published post -- N+1 pattern
  const seoMeta = await ctx.db
    .query("postMeta")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  // ...process each post's meta
}
```

**Recommendation:** Consider denormalizing SEO scores into the posts table itself (adding `seoScore`, `readabilityScore`, `hasKeyphrase`, `hasDescription` fields directly on the post). This would allow the overview to be computed with a single query. Alternatively, create a cached `seoOverviewCache` document that is updated whenever post SEO data changes.

---

### 9. Knowledge Doc Compliance

| Severity | Area | Issue | Detail |
|----------|------|-------|--------|
| **MEDIUM** | Capability Names | **Knowledge doc says `manage_options` and `edit_posts`; implementation uses `seo.update_post`, `seo.update_global`, `seo.update_robots`, `seo.generate_sitemap`** | The implementation's capability names are actually BETTER than what the knowledge doc describes. They are properly namespaced (`seo.*`) and registered in the capabilities type system (`types/capabilities.ts`). The knowledge doc should be updated to match implementation. |
| **MEDIUM** | Constants Bug | **Date Archives config maps to wrong template field** | In `constants.ts` line 157, the Date Archives content type config uses `templateField: "notFoundTitleTemplate"` instead of a dedicated `dateArchiveTitleTemplate` field. This means editing the Date Archives title template would actually update the 404 page template. |
| LOW | Component Naming | **Website breadcrumb component named `SeoBreadcrumbs`** | Knowledge doc references `Breadcrumbs` component; implementation is `SeoBreadcrumbs`. Not a functional issue, just a naming discrepancy. |
| LOW | Sitemap Integration | **Sitemap settings page under SEO route** | The `seo/sitemap.tsx` route exists but is owned by the Sitemap System, not the SEO System. This cross-system integration is clean but worth noting. |
| INFO | Route Structure | **All required routes exist** | The knowledge doc specifies SEO Overview (`/admin/seo`), SEO Settings (`/admin/seo/settings`). Both exist. Additionally, a sitemap settings route exists at `/admin/seo/sitemap`. |
| INFO | robots.txt Route | **Exists but at `/api/robots`** | The knowledge doc mentions a robots.txt API route. It exists at `ConvexPress-Website/apps/web/src/routes/api/robots.tsx`. Requires server-level rewrite from `/robots.txt` to `/api/robots` (documented in the file's comments). |

---

## Detailed Findings

### FINDING-01: Missing Auth Check on getSettings (HIGH)

**File:** `ConvexPress-Admin/packages/backend/convex/seo/queries.ts` lines 77-108
**Category:** Security
**Severity:** HIGH

The `getSettings` query is documented as requiring authentication for `robots` and `advanced` keys, but NO authentication check is implemented. The query is completely public for all keys.

**Impact:** Any unauthenticated user can read:
- Robots rules (which parts of the site are blocked from crawlers)
- Advanced settings (URL rewrite rules, external link behavior)

**Fix:** Add conditional auth check:
```typescript
if (key === "robots" || key === "advanced") {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
}
```

---

### FINDING-02: Missing Capability Check on getSeoOverview (MEDIUM)

**File:** `ConvexPress-Admin/packages/backend/convex/seo/queries.ts` lines 239-247
**Category:** Security
**Severity:** MEDIUM

The query checks if a user is logged in via `getCurrentUser(ctx)` but does NOT verify the user has Administrator-level capabilities. A Subscriber-level user can access the full SEO overview dashboard data.

**Current code:**
```typescript
const user = await getCurrentUser(ctx);
if (!user) return null;
```

**Should be:**
```typescript
const user = await requireCan(ctx, "seo.update_global");
```

---

### FINDING-03: N+1 Query in getSeoOverview (MEDIUM)

**File:** `ConvexPress-Admin/packages/backend/convex/seo/queries.ts` lines 289-351
**Category:** Convex Best Practices / Performance
**Severity:** MEDIUM

The query fetches ALL published posts and pages, then runs a separate `postMeta` query for each post to get SEO data. This creates an N+1 query pattern.

**Impact:** For a site with 100 published posts, this executes ~102 DB queries (2 for posts/pages + 100 for meta). Convex has execution time limits that could be exceeded with large content volumes.

**Recommendations:**
1. Denormalize SEO scores directly onto the posts table
2. Or create a materialized `seoOverviewCache` singleton document updated via event-driven pattern
3. Or batch-fetch all `_seo_*` postMeta rows in a single query and group by postId in memory

---

### FINDING-04: Date Archives Template Field Bug (MEDIUM)

**File:** `ConvexPress-Admin/apps/web/src/lib/seo/constants.ts` lines 155-160
**Category:** Knowledge Doc Compliance / Bug
**Severity:** MEDIUM

The Date Archives content type configuration maps `templateField` to `"notFoundTitleTemplate"` instead of a dedicated date archive field:

```typescript
{
  key: "date" as const,
  label: "Date Archives",
  templateField: "notFoundTitleTemplate" as const,  // BUG: Wrong field!
  noindexField: "dateArchiveNoindex" as const,
  defaultTemplate: "Archives %%sep%% %%sitename%%",
},
```

**Impact:** When an admin edits the Date Archives title template in the Content Types settings, it would save the value to the `notFoundTitleTemplate` field, potentially overwriting the 404 page's title template or reading the wrong value.

**Fix:** Add a `dateArchiveTitleTemplate` field to the `SeoTitleSettings` type in `helpers/seo.ts` and update the constants mapping.

---

### FINDING-05: Knowledge Doc Capability Names Out of Sync (MEDIUM)

**File:** `.claude/docs/SEO-SYSTEM.md` (knowledge doc)
**Category:** Knowledge Doc Compliance
**Severity:** MEDIUM

The knowledge doc references WordPress-style capability names (`manage_options`, `edit_posts`) but the implementation uses properly namespaced SEO-specific capabilities:

| Knowledge Doc Says | Implementation Uses | Registered in capabilities.ts? |
|-------------------|--------------------|-----------------------------|
| `manage_options` | `seo.update_global` | Yes |
| `manage_options` | `seo.update_robots` | Yes |
| `manage_options` | `seo.generate_sitemap` | Yes |
| `edit_posts` | `seo.update_post` | Yes |

The implementation is actually superior -- the capabilities are properly namespaced and registered in `types/capabilities.ts` with correct role assignments:
- `seo.update_post` -> Editor + Author + Contributor (via roles seed)
- `seo.update_global`, `seo.update_robots`, `seo.generate_sitemap` -> Administrator only

**Fix:** Update knowledge doc to reflect the actual capability names used.

---

### FINDING-06: Relative Sitemap URL in robots.txt (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/seo/queries.ts` (getRobotsTxt)
**Category:** SEO Best Practice
**Severity:** LOW

The `getRobotsTxt` query generates `Sitemap: /sitemap.xml` with a relative path. The robots.txt specification (RFC 9309) requires absolute URLs for the Sitemap directive.

**Current:** `Sitemap: /sitemap.xml`
**Should be:** `Sitemap: https://example.com/sitemap.xml`

The site URL would need to be read from settings to produce the correct absolute URL.

---

### FINDING-07: Type Assertions in internals.ts (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/seo/internals.ts`
**Category:** TypeScript
**Severity:** LOW

Two unsafe type assertions:
1. Line ~125: `(media as { url: string }).url` -- assumes media record has a `url` field
2. Line ~134: `post.type as "post" | "page"` -- type narrowing

These work correctly at runtime but could fail silently if the data shape changes.

**Fix:** Add type guards:
```typescript
function hasUrl(media: unknown): media is { url: string } {
  return typeof media === "object" && media !== null && "url" in media;
}
```

---

### FINDING-08: Type Assertions in website resolve.ts (LOW)

**File:** `ConvexPress-Website/apps/web/src/lib/seo/resolve.ts`
**Category:** TypeScript
**Severity:** LOW

Multiple `(social as Record<string, unknown>)` casts when accessing social settings fields from the Convex query result. This is because the settings query returns loosely typed data.

**Fix:** Create a `parseSocialSettings` helper on the website side that properly types the result.

---

### FINDING-09: defaultArticleType Typed as string (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/helpers/seo.ts`
**Category:** TypeScript
**Severity:** LOW

The `SeoSchemaSettings.defaultArticleType` field is typed as `string` instead of the specific union type `"Article" | "BlogPosting" | "NewsArticle" | "TechArticle"` that the validators define.

**Fix:** Use the union type from validators for stronger compile-time checking.

---

## Compliance Checklist

| Check | Status | Notes |
|-------|--------|-------|
| No Radix UI imports | PASS | Zero occurrences |
| No hardcoded layout colors (zinc/slate/gray) | PASS | No banned colors found |
| Semantic status colors | ADVISORY | Uses emerald/amber/red for good/warning/error -- acceptable per rules |
| No deprecated React patterns | PASS | No forwardRef, React.FC, defaultProps |
| React 19 compatible | PASS | All modern patterns |
| TypeScript strict compliance | ADVISORY | Minor type assertions, all safe at runtime |
| Convex best practices | ADVISORY | N+1 pattern in overview query |
| Security/auth model | FAIL | Missing auth checks on 2 queries |
| Import resolution | PASS | All imports resolve correctly |
| Knowledge doc compliance | ADVISORY | Capability names differ (implementation is better) |
| No dead code | PASS | All code is actively used |
| Modular schema convention | PASS | `seo.ts` exports `seoTables`, properly imported |

---

## Prioritized Fix List

### Priority 1 -- Security (Fix Immediately)

1. **[HIGH] Add auth check to `getSettings` for robots/advanced keys**
   - File: `ConvexPress-Admin/packages/backend/convex/seo/queries.ts`
   - Action: Add `requireCan(ctx, "seo.update_robots")` guard when key is `robots` or `advanced`

2. **[MEDIUM] Add capability check to `getSeoOverview`**
   - File: `ConvexPress-Admin/packages/backend/convex/seo/queries.ts`
   - Action: Replace `getCurrentUser(ctx)` with `requireCan(ctx, "seo.update_global")`

### Priority 2 -- Bugs (Fix Soon)

3. **[MEDIUM] Fix Date Archives template field mapping**
   - File: `ConvexPress-Admin/apps/web/src/lib/seo/constants.ts`
   - Action: Change `templateField: "notFoundTitleTemplate"` to `templateField: "dateArchiveTitleTemplate"` and add the corresponding field to `SeoTitleSettings` in `helpers/seo.ts`

### Priority 3 -- Performance (Plan for Scale)

4. **[MEDIUM] Resolve N+1 query in getSeoOverview**
   - File: `ConvexPress-Admin/packages/backend/convex/seo/queries.ts`
   - Action: Denormalize SEO scores onto posts table, or create a cached overview document, or batch-fetch all SEO meta rows in one query

### Priority 4 -- Documentation (Update Knowledge Doc)

5. **[MEDIUM] Update knowledge doc capability names**
   - File: `.claude/docs/SEO-SYSTEM.md`
   - Action: Replace references to `manage_options` and `edit_posts` with actual `seo.*` capability names

### Priority 5 -- Code Quality (Nice to Have)

6. **[LOW] Fix relative sitemap URL in robots.txt**
   - File: `ConvexPress-Admin/packages/backend/convex/seo/queries.ts`
   - Action: Read site URL from settings and generate absolute Sitemap URL

7. **[LOW] Add type guards for unsafe assertions**
   - Files: `internals.ts`, `resolve.ts` (website)
   - Action: Replace `as` casts with runtime type guards

8. **[LOW] Narrow `defaultArticleType` type**
   - File: `ConvexPress-Admin/packages/backend/convex/helpers/seo.ts`
   - Action: Change `string` to union type matching validators

9. **[LOW] Consider extracting status colors to CSS variables**
   - Files: Multiple components
   - Action: Define `--color-status-good`, `--color-status-warning`, `--color-status-error` CSS variables

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total files audited | 50+ |
| CRITICAL findings | 0 |
| HIGH findings | 1 |
| MEDIUM findings | 4 |
| LOW findings | 4 |
| Total findings | 9 |
| Clean categories | 5 of 9 |

---

*Audit completed 2026-02-13 by SEO System Expert*
