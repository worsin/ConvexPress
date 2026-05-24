# API System - Full Code Review & Audit

**Date:** 2026-02-13
**Auditor:** API System Expert
**System:** API System (ConvexPress)
**Knowledge Doc:** `.claude/docs/API-SYSTEM.md`
**PRD:** NOT FOUND (expected at `specs/ConvexPress/systems/api/PRD.md`)

---

## Summary

| Metric | Value |
|--------|-------|
| **Files Scanned** | 30 |
| **Critical Issues** | 2 |
| **Important Issues** | 9 |
| **Minor Issues** | 7 |
| **Positive Findings** | 10 |
| **PRD Compliance** | N/A (PRD file does not exist) |
| **Knowledge Doc Implementation** | ~75% |

### Files Scanned

**Backend Schema (2 files):**
- `ConvexPress-Admin/packages/backend/convex/schema/api.ts`
- `ConvexPress-Admin/packages/backend/convex/schema.ts` (hub, verified integration)

**Backend Functions (5 files):**
- `ConvexPress-Admin/packages/backend/convex/api/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/api/queries.ts`
- `ConvexPress-Admin/packages/backend/convex/api/mutations.ts`
- `ConvexPress-Admin/packages/backend/convex/api/internals.ts`
- `ConvexPress-Admin/packages/backend/convex/api/actions.ts`

**HTTP Endpoints (10 files):**
- `ConvexPress-Admin/packages/backend/convex/http.ts` (router)
- `ConvexPress-Admin/packages/backend/convex/http/helpers.ts`
- `ConvexPress-Admin/packages/backend/convex/http/discovery.ts`
- `ConvexPress-Admin/packages/backend/convex/http/posts.ts`
- `ConvexPress-Admin/packages/backend/convex/http/pages.ts`
- `ConvexPress-Admin/packages/backend/convex/http/comments.ts`
- `ConvexPress-Admin/packages/backend/convex/http/media.ts`
- `ConvexPress-Admin/packages/backend/convex/http/users.ts`
- `ConvexPress-Admin/packages/backend/convex/http/taxonomies.ts`
- `ConvexPress-Admin/packages/backend/convex/http/menus.ts`
- `ConvexPress-Admin/packages/backend/convex/http/settings.ts`

**Cron Jobs (1 file):**
- `ConvexPress-Admin/packages/backend/convex/crons.ts`

**Frontend Types & Constants (2 files):**
- `ConvexPress-Admin/apps/web/src/lib/api/types.ts`
- `ConvexPress-Admin/apps/web/src/lib/api/constants.ts`

**Admin UI - API Keys (6 files):**
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/index.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/api-key-table.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/create-key-dialog.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/key-created-dialog.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/revoke-key-dialog.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/scope-selector.tsx`

**Admin UI - Webhooks (8 files):**
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/index.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/webhook-table.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/create-webhook-form.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/webhook-created-dialog.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/delivery-log-table.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/delivery-detail.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/test-webhook-button.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/event-code-select.tsx`

---

## Critical Issues (2)

### C-1: Webhook Secrets Stored in Plaintext When Encryption Key Is Missing

**Files:**
- `ConvexPress-Admin/packages/backend/convex/api/mutations.ts` lines 430-438
- `ConvexPress-Admin/packages/backend/convex/api/mutations.ts` lines 639-644

**Description:**
When `WEBHOOK_SECRET_ENCRYPTION_KEY` is not set, webhook secrets are stored as `unencrypted:{plaintextSecret}`. This means the full signing secret is persisted in the database in cleartext with only a prefix marker. While the code comments indicate this is "for development," there is no runtime guard preventing this in production.

```typescript
// mutations.ts:430-438
const encryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
let encryptedSecret: string;
if (encryptionKey) {
  encryptedSecret = await encryptSecret(plaintextSecret, encryptionKey);
} else {
  encryptedSecret = `unencrypted:${plaintextSecret}`;
}
```

The same pattern repeats at line 639-644 for secret regeneration in `updateWebhook`.

**Suggested Fix:**
Throw an error if `WEBHOOK_SECRET_ENCRYPTION_KEY` is not set rather than silently falling back to plaintext. At minimum, add a `NODE_ENV` check so the fallback is impossible in production:

```typescript
const encryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
if (!encryptionKey) {
  throw new ConvexError({
    code: "CONFIGURATION_ERROR",
    message: "WEBHOOK_SECRET_ENCRYPTION_KEY environment variable is required",
  });
}
encryptedSecret = await encryptSecret(plaintextSecret, encryptionKey);
```

---

### C-2: PRD File Does Not Exist

**Expected Path:** `specs/ConvexPress/systems/api/PRD.md`

**Description:**
The API System has no PRD. The knowledge doc (`.claude/docs/API-SYSTEM.md`) serves as the primary specification, but per project conventions every system should have a dedicated PRD in the specs directory. Without a PRD, there is no formal requirements document against which to measure compliance.

**Suggested Fix:**
Generate the PRD using `/create-prd api-system` or manually create it in the expected location.

---

## Important Issues (9)

### I-1: 7 of 10 HTTP REST Endpoints Are Stubs

**Files:**
- `ConvexPress-Admin/packages/backend/convex/http/pages.ts` - ALL stubs (lines 1-109)
- `ConvexPress-Admin/packages/backend/convex/http/media.ts` - ALL stubs (lines 1-76)
- `ConvexPress-Admin/packages/backend/convex/http/taxonomies.ts` - ALL stubs (lines 1-83)
- `ConvexPress-Admin/packages/backend/convex/http/menus.ts` - ALL stubs (lines 1-23)
- `ConvexPress-Admin/packages/backend/convex/http/settings.ts` - ALL stubs (lines 1-21)
- `ConvexPress-Admin/packages/backend/convex/http/posts.ts` - POST/PUT/DELETE are stubs (lines 93-154)
- `ConvexPress-Admin/packages/backend/convex/http/users.ts` - Only GET list and GET single are wired; no create/update/delete

**Description:**
The HTTP REST API surface is largely non-functional. Only the following endpoints are wired to real Convex backend functions:
- **Posts:** GET list, GET single (2 of 5)
- **Comments:** Full CRUD (all 5)
- **Users:** GET list, GET single (2 of 5)
- **Discovery:** Fully functional (1 of 1)

Everything else returns empty arrays, placeholder messages like `"Pages endpoint - list all pages (coming soon)"`, or is completely absent.

**Impact:** Any external integrations depending on the REST API (automation tools, mobile apps, third-party services) would find 70%+ of endpoints non-functional.

**Suggested Fix:**
Wire each stub endpoint to the corresponding system's Convex queries/mutations. The pattern from `comments.ts` (fully wired) serves as a reference implementation.

---

### I-2: Excessive `as any` Type Casts (28 instances)

**Files and line numbers:**

Backend functions (1 instance):
- `ConvexPress-Admin/packages/backend/convex/api/internals.ts:247` - scope check cast

HTTP handlers (18 instances):
- `ConvexPress-Admin/packages/backend/convex/http/users.ts:83,92-100` - 10 casts for user field access
- `ConvexPress-Admin/packages/backend/convex/http/posts.ts:68` - postId cast
- `ConvexPress-Admin/packages/backend/convex/http/comments.ts:69,98,135,137,188,229,233` - 7 casts for IDs

Frontend components (9 instances):
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/create-key-dialog.tsx:91,92` - mutation args and result
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/revoke-key-dialog.tsx:43` - keyId
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/webhook-table.tsx:129,146` - webhookId
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/delivery-log-table.tsx:72` - webhookId
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/create-webhook-form.tsx:101,102` - mutation args and result
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/test-webhook-button.tsx:32` - webhookId

**Description:**
28 `as any` casts across the system undermine TypeScript's safety guarantees. The most concerning cluster is in `http/users.ts` (lines 92-100) where every user field is accessed via `(user as any).field`, suggesting a type mismatch between the query return type and what the HTTP handler expects.

**Suggested Fix:**
- **HTTP handlers:** Define proper response type interfaces mapping Convex document shapes to REST API response shapes. Use these types instead of `as any`.
- **ID casts in HTTP handlers:** Create a typed helper: `function asId<T extends TableNames>(id: string): Id<T>` with runtime validation.
- **Frontend components:** Import the generated Convex API types and use proper type annotations for mutation args and return values.

---

### I-3: Hardcoded Tailwind Colors (emerald, yellow)

**Files and line numbers:**

`ConvexPress-Admin/apps/web/src/lib/api/constants.ts`:
- Line 101: `bg-emerald-500/10 text-emerald-600`
- Line 109: `bg-yellow-500/10 text-yellow-600`
- Line 119: `bg-emerald-500/10 text-emerald-600`
- Line 123: `bg-yellow-500/10 text-yellow-600`

`ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/key-created-dialog.tsx`:
- Lines 48-49: `bg-emerald-500/10`, `text-emerald-600`
- Lines 62-63: `bg-yellow-500/5`, `text-yellow-600`
- Line 80: `text-emerald-600`

`ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/webhook-created-dialog.tsx`:
- Lines 48-49: `bg-emerald-500/10`, `text-emerald-600`
- Lines 62-63: `bg-yellow-500/5`, `text-yellow-600`
- Line 84: `text-emerald-600`

`ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/delivery-log-table.tsx`:
- Lines 59-60: `bg-emerald-500/10 text-emerald-600`, `bg-yellow-500/10 text-yellow-600`
- Line 164: `text-emerald-600`

`ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/webhook-table.tsx`:
- Line 329: `text-yellow-600`
- Lines 399-406: `border-yellow-500/30`, `bg-yellow-500/5`, `text-yellow-600`, `text-yellow-600/80`

**Description:**
The project rules explicitly forbid hardcoded Tailwind color names (zinc, slate, gray, emerald, yellow, etc.). All colors must use CSS variables (`bg-card`, `bg-muted`, `text-destructive`, etc.) or opacity modifiers on base colors (`bg-black/40`). The API system uses `emerald-500`, `emerald-600`, `yellow-500`, `yellow-600` across 6 files for status badges, success indicators, and warning messages.

**Suggested Fix:**
Replace with CSS variable equivalents:
- `emerald-500/10` and `emerald-600` (success) -> Use a `text-success` / `bg-success/10` CSS variable or `text-primary` / `bg-primary/10`
- `yellow-500/10` and `yellow-600` (warning) -> Use `text-warning` / `bg-warning/10` CSS variable or `text-amber-foreground` pattern
- If no success/warning CSS variables exist in the theme, define them in the Tailwind theme config.

---

### I-4: React Fragment Key Issue in .map() Loops

**Files:**
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/webhook-table.tsx` lines 255-258
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/delivery-log-table.tsx` lines 135-141

**Description:**
Both files use a bare `<>` fragment inside `.map()`. The `key` prop is placed on the `<tr>` child inside the fragment rather than on the fragment itself. React requires the key on the outermost element returned by `.map()`.

```tsx
// webhook-table.tsx:255-258 (WRONG)
{filteredWebhooks.map((webhook) => (
  <>
    <tr key={webhook._id} ...>
```

```tsx
// delivery-log-table.tsx:138-141 (WRONG)
return (
  <>
    <tr key={delivery._id} ...>
```

**Impact:** React cannot efficiently reconcile the list, which may cause rendering bugs (wrong rows expanding, stale state) and console warnings in development.

**Suggested Fix:**
Use `<Fragment key={...}>` instead of `<>`:

```tsx
import { Fragment } from "react";

{filteredWebhooks.map((webhook) => (
  <Fragment key={webhook._id}>
    <tr ...>
```

---

### I-5: Duplicate `sha256Hash` Function

**Files:**
- `ConvexPress-Admin/packages/backend/convex/api/mutations.ts` line 82
- `ConvexPress-Admin/packages/backend/convex/api/internals.ts` line 58

**Description:**
The `sha256Hash` utility function is defined identically in both files. This is dead code duplication that violates DRY and creates a maintenance risk (fixing a bug in one copy but not the other).

**Suggested Fix:**
Extract to a shared helper file `ConvexPress-Admin/packages/backend/convex/api/crypto-helpers.ts` (or `ConvexPress-Admin/packages/backend/convex/helpers/crypto.ts`) and import in both mutations.ts and internals.ts.

---

### I-6: Duplicate `formatRelativeTime` Function

**Files:**
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/api-keys/-components/api-key-table.tsx` line 29
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/webhook-table.tsx` line 37

**Description:**
The `formatRelativeTime` utility function is copy-pasted identically in both table components.

**Suggested Fix:**
Extract to a shared utility file such as `ConvexPress-Admin/apps/web/src/lib/api/utils.ts` or the general `ConvexPress-Admin/apps/web/src/lib/utils.ts`.

---

### I-7: Missing Separate Helper Files (Architecture Deviation)

**Knowledge Doc specifies:**
```
convex/api/
  helpers/
    apiKeyUtils.ts      - Key generation, hashing, validation
    webhookSecretUtils.ts - Secret encryption/decryption, HMAC signing
    rateLimit.ts         - Rate limit checking logic
    urlValidation.ts     - Webhook URL validation & SSRF protection
```

**Actual implementation:**
- `apiKeyUtils.ts` - Does not exist. Functions (`generateRandomHex`, `sha256Hash`) are inlined in `mutations.ts` (lines 72-90).
- `webhookSecretUtils.ts` - Does not exist. Functions (`encryptSecret`, `decryptSecret`, `computeHmacSignature`) are inlined in `mutations.ts` (lines 92-160) and `internals.ts` (lines 60-150).
- `rateLimit.ts` - Does not exist. Rate limit logic is inlined in `internals.ts` (within `authenticateRequest`).
- `urlValidation.ts` - Does not exist. URL validation (`validateWebhookUrl`) is in `validators.ts` (lines 246-314).

**Description:**
The knowledge doc prescribes a `helpers/` subdirectory with four dedicated files. All the logic exists but is scattered across `mutations.ts`, `internals.ts`, and `validators.ts`. This makes the code harder to navigate, test, and maintain.

**Suggested Fix:**
Refactor by extracting the crypto/utility functions into the prescribed helper files. This is a pure organizational refactor with no behavioral change.

---

### I-8: EventCodeSelect Uses Custom Dropdown Instead of Base UI Select

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/webhooks/-components/event-code-select.tsx`

**Description:**
The `EventCodeSelect` component implements a fully custom dropdown (manual `isOpen` state, `onBlur` handler, positioned `<div>`) instead of using `@base-ui/react`'s Select or Menu component. The project rules require Base UI for all interactive components.

The custom implementation:
- Uses `useState(false)` for open/close (line 20)
- Has manual blur/focus handling
- Has a custom positioned dropdown div
- Lacks keyboard accessibility (arrow key navigation, Escape to close, screen reader announcements)

**Suggested Fix:**
Rewrite using `@base-ui/react`'s `Select` component, which provides proper keyboard navigation, ARIA attributes, and positioning out of the box.

---

### I-9: Non-null Assertion on Identity Subject

**File:** `ConvexPress-Admin/packages/backend/convex/api/mutations.ts` line 443

**Description:**
```typescript
const identity = await ctx.auth.getUserIdentity();
const userId = identity!.subject;
```

The `identity!` non-null assertion is unsafe. While `requireCan` earlier in the handler should guarantee the user is authenticated, if the function is ever called in a different context or the auth check is refactored, this would throw at runtime with no descriptive error.

**Suggested Fix:**
Add explicit null check with descriptive error:
```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
}
const userId = identity.subject;
```

---

## Minor Issues (7)

### M-1: Missing Pagination on API Key List Query

**File:** `ConvexPress-Admin/packages/backend/convex/api/queries.ts` lines 25-48

**Description:**
The `listKeys` query uses `.collect()` which returns all matching records without any pagination. If a user creates hundreds of API keys, this query will become slow. Compare with `listDeliveries` which accepts a `limit` argument.

**Suggested Fix:**
Add pagination support (cursor-based or limit/offset) matching the pattern used in `listDeliveries`.

---

### M-2: Missing Pagination on Webhook List Query

**File:** `ConvexPress-Admin/packages/backend/convex/api/queries.ts` lines 80-109

**Description:**
Same issue as M-1. The `listWebhooks` query uses `.collect()` without pagination.

---

### M-3: Unused `eventId` Variable in Some HTTP Error Paths

**File:** `ConvexPress-Admin/packages/backend/convex/http/comments.ts`

**Description:**
The comments HTTP handler catches errors with a generic pattern but does not consistently include the resource ID in error responses. Some error paths discard useful context.

---

### M-4: Discovery Endpoint Lists Endpoints That Are Stubs

**File:** `ConvexPress-Admin/packages/backend/convex/http/discovery.ts`

**Description:**
The discovery endpoint at `/api/v1/` documents all REST endpoints including those that are complete stubs (pages, media, taxonomies, menus, settings). External developers relying on this discovery document will find most endpoints non-functional. There is no indication which endpoints are actually implemented.

**Suggested Fix:**
Add a `status: "available" | "coming_soon"` field to each endpoint entry in the discovery response, or remove stub endpoints from the discovery document until they are functional.

---

### M-5: `encryptSecret` / `decryptSecret` Defined in Both mutations.ts and internals.ts

**Files:**
- `ConvexPress-Admin/packages/backend/convex/api/mutations.ts` lines 92-160
- `ConvexPress-Admin/packages/backend/convex/api/internals.ts` lines 60-150

**Description:**
The encryption/decryption helper functions are duplicated across both files, similar to the `sha256Hash` duplication noted in I-5. This is part of the same architectural deviation (I-7) but called out specifically because crypto code duplication is particularly risky.

---

### M-6: `as any` on Scope Check in authenticateRequest

**File:** `ConvexPress-Admin/packages/backend/convex/api/internals.ts` line 247

```typescript
if (!key.scopes.includes(requiredScope as any)) {
```

**Description:**
The `requiredScope` parameter is typed as `string` but the scopes array contains union literal types. The `as any` cast bypasses the type check rather than properly validating the scope string against the known scope values.

**Suggested Fix:**
Use the `isValidApiKeyScope()` function from validators.ts to validate the scope string first, then cast to the correct type:

```typescript
if (!isValidApiKeyScope(requiredScope) || !key.scopes.includes(requiredScope)) {
```

---

### M-7: Test Webhook Action Hardcodes Event Code

**File:** `ConvexPress-Admin/packages/backend/convex/api/actions.ts` line 66

```typescript
eventCode: "api.webhook_triggered",
```

**Description:**
The test webhook action always uses `"api.webhook_triggered"` as the event code, even though the webhook might be subscribed to a specific event like `"post.published"`. The test should ideally match the webhook's configured event code so the receiving endpoint can verify its event-handling logic.

**Suggested Fix:**
Use the webhook's actual `eventCode` from `authResult` instead of the hardcoded value, or include the subscribed event code in the test payload metadata.

---

## Positive Findings (10)

### P-1: Excellent Schema Design
The schema in `convex/schema/api.ts` is well-designed with proper indexes for all query patterns (`by_keyHash`, `by_status`, `by_webhook_status`, `by_webhook`, etc.). The four tables (apiKeys, webhooks, webhookDeliveries, apiRateLimitWindows) cleanly map to the knowledge doc specification.

### P-2: Robust SSRF Protection
The `validateWebhookUrl()` function in `validators.ts` (lines 246-314) implements comprehensive SSRF protection: blocks localhost, private IPv4 ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x), link-local addresses (169.254.x.x), cloud metadata endpoints (169.254.169.254, metadata.google.internal), .local mDNS domains, and enforces HTTPS.

### P-3: Proper Secret Handling in Queries
All queries in `queries.ts` correctly strip sensitive fields before returning data to the client. API key hashes and webhook secrets are never exposed. The `listKeys` query explicitly maps to `keyPreview` (first 8 chars) and the `getWebhook` query excludes the `secret` field entirely.

### P-4: Well-Structured Event Code Validation
The `validateEventCode()` function (lines 326-350) correctly supports three patterns: global wildcard (`*`), system wildcard (`post.*`), and exact codes (`post.published`). The validation is thorough and the error messages are descriptive.

### P-5: Proper Rate Limiting Design
The dual-window rate limiting (per-minute and per-hour) with sliding window counters is well-designed. Constants are defined in `validators.ts` with sensible defaults (60/min, 1000/hr) and configurable min/max ranges.

### P-6: Clean Separation Between Public and Internal Functions
The system correctly separates client-callable functions (`queries.ts`, `mutations.ts`, `actions.ts`) from internal functions (`internals.ts`). The `testWebhook` action demonstrates the proper pattern: public action delegates permission check to internal mutation, then calls internal action.

### P-7: Complete Admin UI for API Keys and Webhooks
Both management interfaces are fully implemented with all components listed in the knowledge doc: tables with filtering, creation dialogs, one-time secret display, revocation with reason, delivery history with expandable details, test webhook functionality, and event code selection.

### P-8: Proper CORS Handling
The HTTP router (`http.ts`) correctly registers OPTIONS preflight handlers for all REST endpoints. The CORS headers in `http/helpers.ts` properly handle `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers`.

### P-9: Cron Jobs Properly Registered
Both maintenance cron jobs are registered in `crons.ts`:
- `api-cleanup-expired-keys`: Runs hourly at :15
- `api-cleanup-delivery-logs`: Runs daily at 5:00 UTC

### P-10: No Radix Imports
Zero instances of `@radix-ui` imports found across all 30 files. The system correctly uses `@base-ui/react` components (Dialog, Checkbox) or custom implementations.

---

## Implementation Status vs Knowledge Doc

| Component | Knowledge Doc Status | Actual Status | Notes |
|-----------|---------------------|---------------|-------|
| **Schema (4 tables)** | Required | COMPLETE | All tables and indexes match |
| **API Key CRUD** | Required | COMPLETE | createKey, revokeKey, listKeys, getKey all functional |
| **Webhook CRUD** | Required | COMPLETE | Full CRUD including updateWebhook with secret regeneration |
| **Rate Limiting** | Required | COMPLETE | Dual-window (minute + hour) sliding counters |
| **Webhook Delivery** | Required | COMPLETE | HTTP delivery with retry, HMAC signing, delivery logging |
| **Test Webhook** | Required | COMPLETE | Public action with permission check and test flag |
| **Cron: Cleanup Keys** | Required | COMPLETE | Hourly at :15 |
| **Cron: Cleanup Logs** | Required | COMPLETE | Daily at 5:00 UTC |
| **Admin UI: API Keys** | Required | COMPLETE | Full table, create, revoke, one-time key display |
| **Admin UI: Webhooks** | Required | COMPLETE | Full table, create, delivery history, test button |
| **HTTP REST: Posts** | Required | PARTIAL | GET list and GET single only; POST/PUT/DELETE are stubs |
| **HTTP REST: Pages** | Required | STUB | All endpoints return placeholders |
| **HTTP REST: Comments** | Required | COMPLETE | Full CRUD wired to backend |
| **HTTP REST: Media** | Required | STUB | All endpoints return placeholders |
| **HTTP REST: Users** | Required | PARTIAL | GET list and GET single only |
| **HTTP REST: Taxonomies** | Required | STUB | All endpoints return placeholders |
| **HTTP REST: Menus** | Required | STUB | Returns empty response |
| **HTTP REST: Settings** | Required | STUB | Returns placeholder message |
| **HTTP REST: Discovery** | Required | COMPLETE | Fully functional |
| **Helper files (4)** | Required | MISSING | Logic exists but inlined in main files |
| **Events integration** | Required | COMPLETE | API_EVENTS constants and SYSTEM.API defined |

**Overall estimate: ~75% implemented.** The core API key and webhook management systems are production-quality. The HTTP REST API surface is the main gap, with 5 of 9 resource endpoints being complete stubs and 2 more only partially wired.

---

## Recommendations (Priority Order)

1. **Create the PRD** - Run `/create-prd api-system` to establish formal requirements.
2. **Fix encryption fallback** (C-1) - Throw error instead of storing plaintext secrets.
3. **Wire HTTP REST stubs** (I-1) - Use `comments.ts` as the reference implementation pattern.
4. **Fix hardcoded colors** (I-3) - Replace all emerald/yellow with CSS variables.
5. **Fix React fragment keys** (I-4) - Use `<Fragment key={...}>` in both table components.
6. **Eliminate `as any` casts** (I-2) - Define proper type interfaces for HTTP handlers and frontend.
7. **Extract shared helpers** (I-5, I-6, I-7) - Create the helper files specified in the knowledge doc.
8. **Rewrite EventCodeSelect** (I-8) - Use Base UI Select for accessibility compliance.
9. **Fix non-null assertion** (I-9) - Add explicit null check with descriptive error.
10. **Add pagination to list queries** (M-1, M-2) - Prevent performance issues at scale.
