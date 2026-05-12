# Admin Smoke Findings

**Last run:** 2026-05-12
**Suite:** 148 static routes (P0=7 authed + 1 anon, P1=43, P2=97)
**Current status:** **148 / 148 passing, 2.4 min runtime**

## Resolved bugs caught by smoke

### 1. `/commerce/attributes` — TypeError on null

**Status:** Fixed in commit (pending)
**Symptom:** Page crashed with `TypeError: Cannot read properties of null (reading 'length')`.

**Root cause:** `productAttributes.queries.listAttributes` returns `null` when the `customFields` plugin is disabled. The component's type narrowing only handled `undefined` (loading state), so when `null` arrived it tried `null.length` and crashed.

**Fix:** Added a null branch in `apps/web/src/routes/_authenticated/_admin/commerce/attributes.tsx` that renders a "Custom Fields plugin required" empty state. Type annotation widened to `Attribute[] | null | undefined`.

---

### 2. `/commerce/wishlists` — UNAUTHORIZED from missing capability

**Status:** Fixed in commit (pending)
**Symptom:** Page crashed; `ConvexError: UNAUTHORIZED — Authentication required` from `commerceWishlists/queries:getAnalytics`.

**Root cause:** Three queries in `commerceWishlists/queries.ts` call `requireCan(ctx, "commerce.wishlists.manage")`. That capability string was never registered in `types/capabilities.ts` or granted to any role in `seed/roles.ts`, so `requireCan` failed against every user.

**Fix (via `/experts:role-capability-system`):**
- Added `CommerceWishlistsCapability` union type with `commerce.wishlists.view` + `commerce.wishlists.manage`
- Added both to `ALL_CAPABILITIES` array
- Added "Commerce Wishlists" group to `CAPABILITY_DOMAINS` for admin UI rendering
- Administrator role automatically picks them up via the `[...ALL_CAPABILITIES]` spread
- Editor role unchanged (currently has no commerce capabilities in seed — keeping that pattern consistent)
- Ran `roles/internals:reseedRoles` to propagate; 5/5 roles updated

---

## Coverage notes

- **Static smoke only.** 47 dynamic admin routes (`$paramName`) not yet covered — need either seeded fixtures or runtime discovery (Phase 5 follow-up).
- **No interaction yet.** Smoke only navigates and asserts page loads cleanly. Form submissions, button clicks, and destructive flows are not exercised — that's integration-test territory.
- **Console-error gate.** A test fails if ANY non-ignored console.error fires within 10s of the page settling. Ignore list lives at `tests/smoke/_helpers.ts`.
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

## Smoke pipeline ROI

Single first-ever run caught **two latent production bugs** that typecheck and existing unit tests had missed:

1. A plugin-disabled state that would have crashed for any customer who turned off custom fields
2. A capability never granted to any role — every admin would have hit "unauthorized" on the wishlists page

Total engineering cost to find both: 2.4 minutes of smoke runtime.
