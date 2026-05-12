# Admin Smoke Findings

**Last run:** 2026-05-12
**Suite:** 148 static routes (P0=7, P1=43, P2=97, anon=1)
**Result:** 146 passed / 2 failed / 2.2 minutes

## Open bugs caught by smoke

### 1. `/commerce/attributes` — TypeError on null

**Priority:** P1
**Status:** Open
**Symptom:** Page crashes; AdminContentErrorBoundary catches.

```
TypeError: Cannot read properties of null (reading 'length')
  at CommerceAttributesPage (apps/web/src/routes/_authenticated/_admin/commerce/attributes.tsx:450:31)
```

**Likely cause:** A query result is `null` (not yet loaded or no data) and the component reads `.length` without guarding. Wrap with `data?.length` or render a loading/empty state.

**Reproduce:** `bunx playwright test admin-p1.spec.ts -g attributes --headed`

---

### 2. `/commerce/wishlists` — backend query failure

**Priority:** P1
**Status:** Open
**Symptom:** Page crashes; AdminContentErrorBoundary catches.

```
ConvexError: [CONVEX Q(commerceWishlists/queries:getAnalytics)] Server Error
```

**Likely cause:** `getAnalytics` query in `packages/backend/convex/commerceWishlists/queries.ts` is throwing. Could be a missing index, a stale schema field, or a runtime exception in the handler.

**Reproduce:** `bunx playwright test admin-p1.spec.ts -g wishlists --headed`

---

## Coverage notes

- **Static smoke only.** 47 dynamic admin routes (`$paramName`) not yet covered — need either seeded fixtures or runtime discovery (Phase 5 follow-up).
- **No interaction yet.** Smoke only navigates and asserts page loads cleanly. Form submissions, button clicks, and destructive flows are not exercised — that's integration-test territory (Phase 8).
- **Console-error gate.** A test fails if ANY non-ignored console.error fires within 10s of the page settling. The ignore list lives at `tests/smoke/_helpers.ts`.
- **Auth fixture.** Each test does its own login because Convex Auth refresh tokens are single-use with rotation. Per-test login is ~10s overhead; total suite time is still under 3 minutes with 5 workers.

## Running locally

```bash
cd ConvexPress-Admin/apps/web

# Env vars (already in .env.local for local dev):
#   ADMIN_SMOKE_USER=smoketest@convexpress.local
#   ADMIN_SMOKE_PASSWORD=<generated>

# Full suite
bun run test:smoke

# Subset
bunx playwright test admin-p0          # P0 only
bunx playwright test admin-p1.spec.ts  # P1 only
bunx playwright test -g attributes     # by name

# UI mode (best for debugging)
bun run test:smoke:ui
```
