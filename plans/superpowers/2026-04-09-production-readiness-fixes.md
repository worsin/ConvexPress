# Production Readiness Fixes — Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 6 actionable findings from the production readiness audit without requiring user design decisions.

**Architecture:** Surgical fixes to existing code. No new systems, no new plugins. Each task is independent and produces a working commit.

**Tech Stack:** Convex, Stripe API, Bun test runner, TypeScript

---

## What's Being Fixed

| # | Finding | Priority | Estimated Time |
|---|---------|----------|---------------|
| 1 | Settings expose secrets to any authenticated user | CRITICAL | Done (fixed in this session) |
| 2 | AI/search API keys stored in plain settings | HIGH | 1 hour |
| 3 | Shipping zones/packages/rules still placeholders in main branch | HIGH | 15 min (merge worktree) |
| 4 | Tax calculation not implemented | HIGH | 2 hours |
| 5 | Stripe payment system not implemented | HIGH | 3-4 hours |
| 6 | TypeScript errors (2,490 errors, 121 @ts-nocheck files) | MEDIUM | 2-3 hours |

## What's NOT Being Fixed Here (Needs Separate Work)

- Subscriptions runtime (Phase 3 — complex, needs design)
- Membership runtime (needs design decisions)
- Full test coverage (ongoing, not a single task)

---

## Task 1: Merge Shipping Phase 2 Worktree

**Goal:** Get the already-built zone/package/rule CRUD, FedEx/DHL adapters, diagnostics, and test harness into the main branch.

**Files:** Everything in the `worktree-shipping-phase-2` branch (11 commits, 56 tests)

- [ ] Merge the worktree branch into `feat/kb-tickets-support`
- [ ] Verify tests still pass after merge
- [ ] Delete the worktree

---

## Task 2: Migrate AI/Search API Keys to Encrypted Storage

**Goal:** Move API keys out of the plain settings system into the encrypted secret storage pattern already used by shipping providers.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/api/crypto_helpers.ts` (verify encrypt/decrypt exist)
- Create: `ConvexPress-Admin/packages/backend/convex/settings/secrets.ts` (mutations for saving/reading encrypted service keys)
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/settings.ts` (add `service_secrets` table if not exists)
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/ai.tsx` (use secure save, mask display)
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/search.tsx` (same)
- Modify: Backend consumers that read these keys (AI helpers, search/meilisearch helpers)

**Approach:**
1. Check if `service_secrets` table or similar already exists (shipping uses `shipping_provider_secrets`)
2. Create a generic `saveServiceSecret` / `getServiceSecret` pattern
3. Update AI settings page to save keys via secure mutation, display masked
4. Update search settings page same way
5. Update backend helpers that consume these keys to read from secure storage
6. Remove plain API key fields from settings sections

---

## Task 3: Build Tax Calculation Engine

**Goal:** Create `commerce/tax.ts` with tax rule CRUD and a calculation query wired into cart/checkout.

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/commerce/tax.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts:92` (replace `taxAmount: 0` with real calculation)
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts:242` (use live tax in totals)
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.tax.tsx` (admin tax rules page)

**Reference:** `/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/tax.ts`

**Functions to implement:**
- `list` query — list all tax rules (admin)
- `getById` query — get single tax rule
- `calculate` query — calculate tax for {country, state, postalCode, amount}, priority-based rule matching
- `create` mutation — create tax rule with country/state/postal/rate/compound/priority
- `update` mutation — update tax rule
- `remove` mutation — delete tax rule
- `toggleActive` mutation — enable/disable rule

**Cart/checkout integration:**
- In `recalculateCart()`: call tax calculate with the cart's shipping address (if set) and subtotal
- In `checkout.complete()`: use calculated tax in order totals

---

## Task 4: Build Stripe Payment System

**Goal:** Create `commerce/payments.ts` with Stripe payment intents, webhook handling, and wire into checkout.

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/commerce/payments.ts` (queries + mutations)
- Create: `ConvexPress-Admin/packages/backend/convex/commerce/paymentActions.ts` (Stripe API calls via "use node")
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts` (wire payment authorization into complete)
- Modify: `ConvexPress-Admin/packages/backend/convex/http.ts` (add Stripe webhook endpoint)
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/payment.tsx` (real Stripe Elements UI)

**Reference:** `/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/payments.ts`

**Functions to implement:**
- `getSettings` query — returns enabled payment methods
- `listTransactions` query — admin transaction history
- `getTransaction` query — single transaction detail
- `createPaymentIntent` action — creates Stripe PaymentIntent, records transaction
- `confirmPayment` mutation — confirms payment after client-side completion
- `processRefund` action — processes Stripe refund
- `handleWebhook` httpAction — processes Stripe webhook events (payment_intent.succeeded, charge.refunded, etc.)

**Checkout integration:**
- `checkout.complete()` should: create payment intent → return clientSecret to frontend
- Frontend uses Stripe Elements to confirm payment
- Webhook confirms settlement → updates order paymentStatus

**Environment:**
- `STRIPE_SECRET_KEY` — Convex environment variable (or settings-first pattern)
- `STRIPE_WEBHOOK_SECRET` — for webhook verification

---

## Task 5: Fix TypeScript Errors

**Goal:** Remove `@ts-nocheck` directives and fix the underlying type errors across 121 backend files.

**Files:** All files under `ConvexPress-Admin/packages/backend/convex/` with `@ts-nocheck`

**Approach — batch by directory, most common error patterns first:**

1. **Pattern: implicit `any` on `ctx` and `args`** — Most Convex handlers already have type inference from the `query()`/`mutation()` wrapper. The `@ts-nocheck` was added to suppress warnings during rapid development. Removing it and adding explicit types where needed.

2. **Pattern: missing imports from `_generated/`** — After `npx convex dev` generates types, many errors resolve automatically.

3. **Pattern: `as any` casts on query builder callbacks** — `(q: any) => q.eq(...)` should use proper Convex index types.

4. **Order of operations:**
   - Run `npx convex dev` to regenerate types (fixes many errors)
   - Remove `@ts-nocheck` from one directory at a time
   - Fix errors in that directory
   - Verify `bun run check-types` error count decreases
   - Commit per directory batch

**Priority directories (most critical):**
- `commerce/` — business logic, type safety matters most
- `shipping/` — already has real types, just needs @ts-nocheck removed
- `settings/` — security-critical
- `auth/`, `helpers/` — used everywhere

---

## Dependency Map

```
Task 1 (Merge shipping) — independent, do first
Task 2 (Secret storage) — independent
Task 3 (Tax engine) — independent
Task 4 (Stripe payments) — independent, but benefits from Task 3 being done (tax in totals)
Task 5 (TypeScript) — do last, after all other code changes are in
```

**Recommended order:** 1 → 2 → 3 → 4 → 5
