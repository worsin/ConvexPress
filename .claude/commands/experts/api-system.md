You are a **BUILDER**. Your job is to implement the API System for ConvexPress -- not advise, not plan, not discuss. **Build it.**

---

## MISSION

Implement the complete API System: REST-like API endpoints via Convex HTTP actions (`/api/v1/`), API key authentication with SHA-256 hashing and scoped permissions, per-key sliding-window rate limiting, outbound webhooks with HMAC-SHA256 signing and AES-256-GCM encrypted secrets, webhook delivery logging, admin UI pages for API key management and webhook management (list tables, create forms, delivery log viewer), cron jobs for expired key cleanup and delivery log retention.

---

## CURRENT STATUS

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `convex/schema/api.ts` | DONE | 4 tables: apiKeys, webhooks, webhookDeliveries, apiRateLimitWindows. All indexes. Imported into hub schema.ts. |
| 2 | `convex/api/validators.ts` | DONE | All arg validators, scope/status unions, SSRF URL validation, event code validation, rate limit constants, key format regex. |
| 3 | `convex/api/queries.ts` | DONE | 5 queries: listKeys, getKey, listWebhooks, getWebhook, listDeliveries. All strip sensitive fields (keyHash, secret). |
| 4 | `convex/api/mutations.ts` | DONE | 5 mutations: createKey (SHA-256 + plaintext return), revokeKey, createWebhook (AES-256-GCM encrypt + event listener registration), updateWebhook (status/secret/listener sync), deleteWebhook (listener deactivation). |
| 5 | `convex/api/internals.ts` | DONE | authenticateRequest (full auth pipeline: parse, hash, lookup, status, expiry, scope, rate limit, usage tracking), deliverWebhook (decrypt, HMAC sign, HTTP POST, log, failure tracking, auto-disable), getWebhookInternal, recordDeliveryResult, recordDeliveryFailure, cleanupExpiredKeys, cleanupDeliveryLogs. |
| 6 | `convex/helpers/apiKeyUtils.ts` | MISSING | Knowledge doc specifies dedicated helpers but generateRandomHex, sha256Hash, encryptSecret are inlined in mutations.ts. Not blocking but could be extracted. |
| 7 | `convex/helpers/webhookSecretUtils.ts` | MISSING | decryptSecret, computeHmacSignature are inlined in internals.ts. Not blocking. |
| 8 | `convex/helpers/rateLimit.ts` | MISSING | Rate limit logic is inlined in authenticateRequest. Not blocking. |
| 9 | `convex/helpers/urlValidation.ts` | MISSING | validateWebhookUrl is in validators.ts (correct location). Not needed as separate file. |
| 10 | `convex/http.ts` (API routes) | MISSING | http.ts exists but only has authKit routes. No `/api/v1/` endpoint handlers registered. |
| 11 | `convex/http/posts.ts` | MISSING | `/api/v1/posts` GET list, GET single, POST create, PUT update, DELETE. |
| 12 | `convex/http/pages.ts` | MISSING | `/api/v1/pages` endpoints. |
| 13 | `convex/http/comments.ts` | MISSING | `/api/v1/comments` endpoints. |
| 14 | `convex/http/media.ts` | MISSING | `/api/v1/media` endpoints. |
| 15 | `convex/http/users.ts` | MISSING | `/api/v1/users` GET list, GET single. |
| 16 | `convex/http/taxonomies.ts` | MISSING | `/api/v1/categories` + `/api/v1/tags` endpoints. |
| 17 | `convex/http/menus.ts` | MISSING | `/api/v1/menus` endpoints. |
| 18 | `convex/http/settings.ts` | MISSING | `/api/v1/settings` endpoints. |
| 19 | `convex/http/discovery.ts` | MISSING | `/api/v1/discovery` public endpoint (no auth). |
| 20 | `convex/crons.ts` (API crons) | MISSING | Hourly cleanupExpiredKeys and daily cleanupDeliveryLogs not registered in crons. Internal functions exist. |
| 21 | `admin routes/api-keys/index.tsx` | MISSING | API Keys admin list page with DataTable. |
| 22 | `admin components/api-key-table.tsx` | MISSING | DataTable: Name, Key Prefix, Scopes badges, Status badge, Last Used, Requests count, Created, Actions (Revoke). |
| 23 | `admin components/create-key-dialog.tsx` | MISSING | Create key modal: name input, scope checkboxes grouped by resource, rate limit config, expiration picker. |
| 24 | `admin components/key-created-dialog.tsx` | MISSING | One-time plaintext key display with copy button and warning. |
| 25 | `admin components/revoke-key-dialog.tsx` | MISSING | Revoke confirmation with optional reason input. |
| 26 | `admin components/scope-selector.tsx` | MISSING | Checkbox component grouped by resource (Posts & Pages, Comments, Media, Users, Taxonomies, Settings, Menus). |
| 27 | `admin routes/webhooks/index.tsx` | MISSING | Webhooks admin list page with DataTable. |
| 28 | `admin components/webhook-table.tsx` | MISSING | DataTable: Name, URL, Event code, Status badge, Last Delivery, Failures counter, Actions (Edit, Test, Delete). |
| 29 | `admin components/create-webhook-form.tsx` | MISSING | Create/edit webhook form: name, HTTPS URL, event code dropdown, content type, advanced settings. |
| 30 | `admin components/webhook-created-dialog.tsx` | MISSING | One-time signing secret display with copy button and verification instructions. |
| 31 | `admin components/delivery-log-table.tsx` | MISSING | Delivery history: ID, Event, Status Code, Duration, Test badge, Timestamp, expandable detail. |
| 32 | `admin components/delivery-detail.tsx` | MISSING | Expandable request/response view for a delivery. |
| 33 | `admin components/event-code-select.tsx` | MISSING | Event code dropdown grouped by system with wildcard support. |
| 34 | `admin components/test-webhook-button.tsx` | MISSING | Send Test button with loading state and result. |
| 35 | `admin lib/api/types.ts` | MISSING | TypeScript types for API keys, webhooks, deliveries. |
| 36 | `admin lib/api/constants.ts` | MISSING | Scope groups, descriptions, status labels, header names. |

**Summary:** Backend core is DONE (schema, validators, queries, mutations, internals with full auth pipeline, crypto, delivery, cleanup). HTTP endpoint handlers are MISSING. Cron registration is MISSING. All admin frontend UI pages are MISSING.

---

## PRD REFERENCE

No dedicated PRD file exists at `specs/ConvexPress/systems/api-system/PRD.md`. The knowledge document serves as the comprehensive specification.

## KNOWLEDGE REFERENCE

Read and internalize fully before building: `.claude/docs/API-SYSTEM.md`

This 1122-line document contains:
- Complete schema with all 4 tables and 15 indexes
- All 5 mutations with detailed behavior (createKey, revokeKey, createWebhook, updateWebhook, deleteWebhook)
- All 5 queries with auth and field exclusion rules
- 2 internal functions (authenticateRequest with full auth pipeline, deliverWebhook with HMAC signing)
- 2 cron functions (hourly key cleanup, daily delivery log cleanup)
- 3 event definitions with payloads and subscriber lists
- Admin UI layout for API Keys page and Webhooks page (DataTables, forms, dialogs, delivery log)
- 28 planned HTTP endpoint routes with scope requirements
- Standard webhook delivery headers
- API response format (success, error, rate-limited)
- SSRF protection rules
- AES-256-GCM vs SHA-256 storage strategy distinction
- 14 edge cases and gotchas
- WordPress function mapping

---

## FILES YOU OWN

All paths relative to `F:\Websites\Hybrid5Studio\websites\ConvexPress\`.

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 1 | `schema/api.ts` | DONE | 4 tables: apiKeys, webhooks, webhookDeliveries, apiRateLimitWindows. All 15 indexes. Already in hub schema.ts. |
| 2 | `api/validators.ts` | DONE | All arg shapes, scope/status unions, SSRF URL validation, event code validation, rate limit constants, key format regex, max lengths. |
| 3 | `api/queries.ts` | DONE | 5 queries: listKeys (by_status, exclude keyHash), getKey (exclude keyHash), listWebhooks (by_status, exclude secret), getWebhook (exclude secret), listDeliveries (by_webhook, desc, limit 1-200). All require Administrator via requireCan. |
| 4 | `api/mutations.ts` | DONE | 5 mutations: createKey (crypto.getRandomValues, SHA-256, event emission), revokeKey (status check, event emission), createWebhook (SSRF validation, AES-256-GCM encrypt, eventListener registration), updateWebhook (listener sync, secret regen), deleteWebhook (listener deactivation). |
| 5 | `api/internals.ts` | DONE | authenticateRequest (parse Bearer, validate format, SHA-256 hash, lookup by_keyHash, status/expiry/scope checks, sliding window rate limit, usage tracking), deliverWebhook (decrypt AES-256-GCM, HMAC-SHA256 sign, HTTP POST with timeout/abort, delivery logging, failure tracking, auto-disable), getWebhookInternal, recordDeliveryResult, recordDeliveryFailure, cleanupExpiredKeys, cleanupDeliveryLogs. |
| 6 | `http.ts` | PARTIAL | Exists with authKit routes only. Must add all `/api/v1/` route registrations + CORS preflight handler. |
| 7 | `http/posts.ts` | MISSING | HTTP action handlers for `/api/v1/posts` (GET list, GET :id, POST, PUT :id, DELETE :id). Scope: `read:posts` / `write:posts`. Use `authenticateRequest` for auth. Pagination headers. |
| 8 | `http/pages.ts` | MISSING | HTTP action handlers for `/api/v1/pages`. Same pattern as posts. Scope: `read:posts` / `write:posts`. |
| 9 | `http/comments.ts` | MISSING | HTTP action handlers for `/api/v1/comments`. Scope: `read:comments` / `write:comments`. |
| 10 | `http/media.ts` | MISSING | HTTP action handlers for `/api/v1/media`. Scope: `read:media` / `write:media`. |
| 11 | `http/users.ts` | MISSING | HTTP action handlers for `/api/v1/users` (GET list, GET :id only). Scope: `read:users`. |
| 12 | `http/taxonomies.ts` | MISSING | HTTP action handlers for `/api/v1/categories` + `/api/v1/tags`. Scope: `read:taxonomies` / `write:taxonomies`. |
| 13 | `http/menus.ts` | MISSING | HTTP action handlers for `/api/v1/menus`. Scope: `read:menus` / `write:menus`. |
| 14 | `http/settings.ts` | MISSING | HTTP action handlers for `/api/v1/settings`. Scope: `read:settings` / `write:settings`. |
| 15 | `http/discovery.ts` | MISSING | HTTP action handler for `/api/v1/discovery`. Public, no auth required. Returns available endpoints and auth info. |
| 16 | `crons.ts` | MISSING | Register hourly `cleanupExpiredKeys` and daily `cleanupDeliveryLogs` from `api/internals.ts`. |

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 17 | `routes/_authenticated/_admin/api-keys/index.tsx` | MISSING | API Keys list page. Header "API Keys" + "Create New Key" button. Renders ApiKeyTable component. Uses `useQuery(api.api.queries.listKeys)`. |
| 18 | `routes/_authenticated/_admin/api-keys/-components/api-key-table.tsx` | MISSING | DataTable with columns: Name, Key Prefix (`shk_a1b2...`), Scopes (badge list), Status (badge), Last Used (relative time + IP), Requests (count), Created (date), Actions (Revoke). |
| 19 | `routes/_authenticated/_admin/api-keys/-components/create-key-dialog.tsx` | MISSING | Modal: name input, ScopeSelector component, rate limit config (collapsed advanced), optional expiration date picker. Calls `useMutation(api.api.mutations.createKey)`. On success opens KeyCreatedDialog. |
| 20 | `routes/_authenticated/_admin/api-keys/-components/key-created-dialog.tsx` | MISSING | Modal: large monospace display of plaintext key, copy-to-clipboard button, prominent "This key will only be shown once" warning banner. |
| 21 | `routes/_authenticated/_admin/api-keys/-components/revoke-key-dialog.tsx` | MISSING | Confirmation dialog: key name display, optional reason textarea, Revoke/Cancel buttons. Calls `useMutation(api.api.mutations.revokeKey)`. |
| 22 | `routes/_authenticated/_admin/api-keys/-components/scope-selector.tsx` | MISSING | Checkbox groups by resource: Posts & Pages (read:posts, write:posts), Comments, Media, Users, Taxonomies, Settings, Menus. Select All / Deselect All. |
| 23 | `routes/_authenticated/_admin/webhooks/index.tsx` | MISSING | Webhooks list page. Header "Webhooks" + "Create New Webhook" button. Renders WebhookTable. Uses `useQuery(api.api.queries.listWebhooks)`. |
| 24 | `routes/_authenticated/_admin/webhooks/-components/webhook-table.tsx` | MISSING | DataTable: Name, Delivery URL (truncated), Event (code + system badge), Status (badge), Last Delivery (relative time + success/fail), Consecutive Failures (n/max counter), Actions (Edit, Test, Delete). |
| 25 | `routes/_authenticated/_admin/webhooks/-components/create-webhook-form.tsx` | MISSING | Full form: name, delivery URL (HTTPS validation), EventCodeSelect dropdown, content type radio, advanced settings (collapsed: max failures, timeout). Used for both create and edit. Calls createWebhook/updateWebhook mutations. |
| 26 | `routes/_authenticated/_admin/webhooks/-components/webhook-created-dialog.tsx` | MISSING | Modal: monospace signing secret display, copy button, "This secret will only be shown once" warning, verification code example. |
| 27 | `routes/_authenticated/_admin/webhooks/-components/delivery-log-table.tsx` | MISSING | Delivery history table: Delivery ID, Event Code, Status Code (green 2xx/red errors), Duration (ms), Test badge, Timestamp. Expandable rows for full request/response detail. Uses `useQuery(api.api.queries.listDeliveries, { webhookId })`. |
| 28 | `routes/_authenticated/_admin/webhooks/-components/delivery-detail.tsx` | MISSING | Expandable view: request headers (formatted), request body (JSON pretty-print), response headers, response body, error message if failed. |
| 29 | `routes/_authenticated/_admin/webhooks/-components/event-code-select.tsx` | MISSING | Dropdown grouped by system (Post Events, Comment Events, Media Events, etc.) with wildcard options (`post.*`, `*`). |
| 30 | `routes/_authenticated/_admin/webhooks/-components/test-webhook-button.tsx` | MISSING | "Send Test" button with loading spinner. On complete shows success/failure toast with status code and duration. Calls test webhook action. |
| 31 | `lib/api/types.ts` | MISSING | TypeScript types: ApiKey (from query, excludes keyHash), Webhook (excludes secret), WebhookDelivery, CreateKeyResult, CreateWebhookResult. |
| 32 | `lib/api/constants.ts` | MISSING | SCOPE_GROUPS (resource -> scopes mapping), SCOPE_DESCRIPTIONS, STATUS_LABELS, STATUS_COLORS, HEADER_NAMES. |

---

## ABSOLUTE RULES

1. **NEVER use Radix.** No `@radix-ui/*` imports. Use `@base-ui/react` for all interactive components.
2. **NEVER use hardcoded colors.** No zinc, slate, gray. Use CSS variables (`bg-card`, `bg-muted`, `text-foreground`, etc.) and opacity modifiers (`bg-black/40`).
3. **NEVER use modals/dialogs for content management.** API key creation and webhook secret display ARE acceptable as modals (they are create/confirmation flows, not content editing). The edit webhook form should be inline on the list page or a full page if complex.
4. **NEVER run `npx convex dev` or `npx convex deploy`.** You write code only. The Convex Deployment Expert deploys.
5. **NEVER skip building the UI.** Every route must render a complete, functional page. No placeholder "Coming soon" or empty components.
6. **NEVER leave TODOs in finished files.** If a file is marked DONE, it must be fully implemented. Replace all TODO comments with working code.
7. **ALWAYS create proper TanStack Router routes.** Every admin page uses `createFileRoute` with the `/_authenticated/_admin/` path prefix.
8. **ALWAYS verify your work compiles.** After writing code, check imports resolve, types match, and there are no obvious errors. The `http.ts` file must properly import and register all HTTP route handlers.

---

## VERIFICATION CHECKLIST

After building, verify each of these:

- [ ] `http.ts` registers all `/api/v1/` routes with proper HTTP methods and CORS preflight handler
- [ ] Each HTTP endpoint handler calls `authenticateRequest` with the correct required scope
- [ ] Each HTTP endpoint returns proper JSON responses with pagination headers (`X-Total`, `X-Total-Pages`, `X-Page`, `X-Per-Page`)
- [ ] Error responses follow the standard format: `{ error, code, status }`
- [ ] Rate-limited responses include `retry_after` field and HTTP 429 status
- [ ] CORS headers (`Access-Control-Allow-Origin: *`) present on all `/api/v1/` responses
- [ ] `/api/v1/discovery` endpoint works without authentication
- [ ] Cron jobs registered: hourly cleanupExpiredKeys, daily cleanupDeliveryLogs
- [ ] API Keys admin page lists keys via `useQuery(api.api.queries.listKeys)` -- no mock data
- [ ] Create Key dialog generates key and shows plaintext via KeyCreatedDialog (one-time display)
- [ ] Scope selector groups scopes by resource with Select All / Deselect All
- [ ] Revoke Key dialog calls revokeKey mutation with optional reason
- [ ] Status badges show correct colors for active/revoked/expired
- [ ] Webhooks admin page lists webhooks via `useQuery(api.api.queries.listWebhooks)` -- no mock data
- [ ] Create webhook form validates HTTPS URL and event code format
- [ ] Webhook created dialog shows signing secret (one-time) with copy button
- [ ] Delivery log table shows deliveries for selected webhook with expandable details
- [ ] Test webhook button calls test action and shows result
- [ ] Event code select groups events by system (post, comment, media, etc.)
- [ ] No hardcoded colors anywhere
- [ ] No Radix imports anywhere
- [ ] All files import from correct paths (backend API, shared components, hooks)

---

## RELATED EXPERTS

| Expert | When to Consult |
|--------|----------------|
| `event-dispatcher-system` | For `emitEvent` calls, event constants (`API_EVENTS`), event listener schema, webhook-as-listener pattern |
| `role-capability-system` | For `requireCan` capability checks (`api.create_key`, `api.revoke_key`, etc.) |
| `admin-shell-ui` | For sidebar menu integration (API Keys and Webhooks under Tools menu) |
| `admin-list-table-ui` | For list table patterns, shared DataTable components |
| `admin-settings-ui` | For form patterns used in create/edit webhook form |
| `post-system` | For post API endpoint data sources (most common API and webhook use case) |
| `convex-deployment` | For deploying after implementation is complete |
| `settings-system` | For settings API endpoint data sources |

---

$ARGUMENTS
