# Wave 13 — Support Integration + Dashboard Fix — Acceptance Report

**Date:** 2026-04-22
**Deployment:** `amiable-mongoose-989.convex.cloud`
**Deploy flag:** `bunx convex deploy` — **full typecheck enabled**, no `--typecheck=disable`.

---

## Scope

Wave 13 executed a three-part lane:

- **A.** Fix the pre-existing `dashboard.test.ts` failure carried as a Wave 7 Known Limitation.
- **B.** Refresh Airtable System completion %s for systems affected by Waves 10/11/12.
- **D.** Stand up the Support Integration System, which was measured at 10% (documentation-only). Delivers the inbound-email webhook adapter — the single-largest support use case.

---

## Shipped

### A. Dashboard test fix

- **`convex/dashboard/helpers.ts`** — added the missing `aggregateContentPerformance<T>` export that `dashboard.test.ts` referenced. Function joins a list of items with a views-by-id map, filters out zero-view entries, sorts by descending views (ties broken by title), and truncates to `limit` (default 5).
- Tests now pass: `bun test convex/dashboard/__tests__/dashboard.test.ts` → **3/3 pass**.

### B. Airtable system completion refresh

Updated Systems table rows in base `appqpJ8QQkoKsH02O` to reflect shipped Waves 10–12:

| System | Before | After |
|--------|--------|-------|
| Tax / Returns / Discount | varies | matched to actual code coverage |
| Dashboard System | open bug flag removed |
| Support Integration System | 10% | 35% (see D below) |

*(full per-system diff tracked inside Airtable; no repo changes in this part)*

### D. Support Integration System — inbound email

**Schema** (`convex/schema/support.ts`):

- `support_channels` — admin-managed registry: `code`, `kind` (`email`/`slack`/`discord`/`twilio_sms`/`form`/`chat`/`api`), `label`, `isActive`, `config`, `webhookUrl`, `lastInboundAt`. Indexes: `by_code`, `by_kind`, `by_active`.
- `support_inbound_events` — per-webhook-delivery log: `channelId`, `externalId`, `rawPayload`, `parsedPayload`, `ticketId`, `status` (`received`/`parsed`/`ticket_created`/`ticket_updated`/`error`), `errorMessage`, `receivedAt`. Indexes: `by_channel_external_id` (idempotency key), `by_status`, `by_ticket`, `by_received_at`.

**Parser — pure helpers** (`convex/support/inboundEmailParser.ts`):

- `NormalizedInboundEmail` — provider-agnostic shape (`externalId`, `fromEmail`, `fromName?`, `toEmail`, `subject`, `body`, `htmlBody?`, `threadKey?`, `inReplyToKey?`, `receivedAt`, `provider`).
- `parsePostmarkPayload` — prefers `FromFull.Email` over `From`; picks up `TextBody`, falls back to `HtmlBody`; extracts `In-Reply-To` header when present.
- `parseMailgunPayload` — reads `sender`/`body-plain` (+ html fallback), multiplies Unix-seconds `timestamp` by 1000.
- `parseSendGridPayload` — extracts bare email from `"Name" <email>` format; falls back to `envelope.to[0]` when `to` is absent.
- `parseInboundEmail` — auto-detects provider via shape (`FromFull`/`MessageID` → Postmark, `body-plain`/`sender` → Mailgun, `envelope`/`headers` → SendGrid) with per-parser fallbacks.
- `stripEmailBoilerplate` — drops GMail "On ... wrote:" quotes, Outlook "Original Message" dividers, thread dividers, mobile-signature footers.
- `extractTicketToken` — pulls `TKT-YYYYMM-NNNNN` reply token out of reply subject lines.

**Unit tests** (`convex/support/__tests__/inboundEmailParser.test.ts`):

- 20 tests covering all three provider payloads, auto-detect, boilerplate stripping, token extraction, and null/invalid guards. **20 pass, 0 fail.**

**Channels CRUD** (`convex/support/channels.ts`):

- `list({ activeOnly? })`, `getByCode({ code })` — queries.
- `create`, `update`, `remove` — mutations gated by `requireCan(ctx, "manage_options")`. `create` enforces unique `code` (throws `DUPLICATE_CODE`).
- `healthReport({ silentThresholdMs? })` — flags active channels whose `lastInboundAt` exceeded the threshold (default 72 h), returning `{healthy, silentHours}` per row.

**Inbound ticket creation** (`convex/support/inboundEmail.ts` — internal mutation):

- `recordInboundEmail` takes the parsed-and-cleaned shape, then:
  1. Resolves the `support_channels` row by code; short-circuits if missing/inactive.
  2. Idempotency guard on `(channelId, externalId)` — retried webhooks return `{ok:true, idempotent:true}`.
  3. Resolves sender via `users.by_email`. Unknown senders log an `error`-status event (required by the tickets schema) and touch `channel.lastInboundAt`.
  4. If the subject carries `[TKT-YYYYMM-NNNNN]`, looks up the existing `ticket_tickets` row and appends a `ticket_messages` row (sequence = existing+1). Re-opens `closed` tickets.
  5. Otherwise creates a new `ticket_tickets` row (`source: "email"`, `category: "other"`, `priority: "medium"`) via `allocateTicketNumber` (atomic increment on `ticket_counters` by year+month), plus the initial `ticket_messages` row at sequence 1.
  6. Inserts/upgrades the `support_inbound_events` row with `status: "ticket_created"` and the ticket id.
  7. Touches `channel.lastInboundAt`.

**Webhook adapter** (`convex/http/inboundEmailWebhook.ts` + `convex/http.ts`):

- Route: `POST /webhooks/inbound-email?channel=<code>` (CORS preflight registered).
- Accepts `application/json`, `application/x-www-form-urlencoded`, and `multipart/form-data` (for SendGrid inbound parse).
- Normalizes via `parseInboundEmail`; 422 on unrecognized payload shape.
- Strips boilerplate, extracts ticket token, schedules `internal.support.inboundEmail.recordInboundEmail` via `ctx.scheduler.runAfter(0, ...)` so the webhook returns 200 fast and persistence runs in mutation context.
- Failures land in `support_inbound_events` with `status: "error"` rather than bouncing the webhook (providers treat 5xx as retriable — we don't want a schema mismatch to flood retries).

---

## Known Gaps (deferred to Wave 13.5)

- `support_channels` admin UI (list + create/edit route). Backend CRUD is wired, but no Admin page ships in this wave.
- Slack OAuth + `events` webhook, Discord webhook, Twilio SMS webhook, form-submit mutation, live-chat bridge.
- Per-channel signature verification hook (currently trust-on-URL). `channels.config.secret` is plumbed through but not yet enforced at the handler.
- HTML → plaintext conversion for emails that arrive HTML-only (the parser keeps both, but `body` currently falls back to raw HTML when `TextBody` is missing).
- Outbound reply (ticket-agent → customer) still only runs through the existing transactional-email path; no inbound/outbound thread-stitching via `Message-ID`/`In-Reply-To` yet.

---

## Deploy & TS Hygiene

- `bunx convex deploy` succeeded with full typecheck (no `--typecheck=disable`).
- `convex/support/channels.ts` + `convex/support/inboundEmail.ts` required the same scoped `// @ts-expect-error TS2589:` pragmas used across `convex/commerce/*` — Convex's generated API union types exceed TypeScript's instantiation depth in every Convex-function-declaration position. 33 suppressions added across the two files; each one is narrowly targeted at the exact line Convex's type synthesis blows up on.
- No unused suppressions remain (validated via the `/tmp/clean-support-ts.py` iterative cleaner).

---

## Verification

```
bun test convex/support/__tests__/inboundEmailParser.test.ts
→ 20 pass, 0 fail, 43 expect() calls, 10 ms

bun test convex/dashboard/__tests__/dashboard.test.ts
→ 3 pass, 0 fail

bunx tsc --noEmit -p convex/tsconfig.json
→ clean

bunx convex deploy
→ ✔ Deployed to amiable-mongoose-989.convex.cloud
```
