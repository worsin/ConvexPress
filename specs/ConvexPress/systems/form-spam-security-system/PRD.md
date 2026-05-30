# PRD: Form Spam & Submission Security System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The public-write security layer of the Forms tree; it is **net-new platform infrastructure** — no CAPTCHA, honeypot, or public-mutation rate limiting exists in ConvexPress today. It guards the Form Submission System's unauthenticated `submit` mutation.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **public-write security layer** for the Forms extension — the abuse-control gate the Form Submission System delegates to. It is **net-new platform infrastructure**: ConvexPress has no CAPTCHA verification, no honeypot/time-trap, and no rate limiting on any public unauthenticated mutation today. This system introduces all three, scoped to the Forms public `submit` path, and exposes a single guard function the submit mutation calls **first**, before any validation or persistence. It is backend-heavy: one admin settings route, otherwise pure server-side enforcement. Abuse control on a public form is explicitly **not** an authorization concern (the submit mutation is correctly un-gated for guests, see the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §5.1); this system is where that abuse control actually lives.

**Code lives at:** `packages/backend/convex/extensions/forms/spam.ts` (the internal `guardSubmission` mutation + the CAPTCHA-verify action + settings CRUD), with the rate-limit table + security-settings record defined in the extension's additive schema fragment `packages/backend/convex/extensions/forms/schema.ts` (merged by the scanner — never hand-edited into root `schema.ts`). The admin global-settings UI lives at `apps/web/src/routes/_authenticated/_admin/forms/settings/`.

**Consumes these ConvexPress systems:**

- **Form Submission System** (`form_submissions`) — the **only** caller of this system's guard. The public `submit` mutation invokes `guardSubmission` before persisting; this system never persists a submission itself. It writes back a verdict (`block` + `score`) that submission uses to set `status: "spam"` / `spamScore`. See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §8.1.
- **Form Field Engine** (`@convexpress/field-engine`) — this system registers two value-less field types, `captcha` and `honeypot`, via the engine's `registerFieldType` API (the Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §4/§6) so the renderer can surface a provider widget + a hidden trap without forking the registry.
- **Event Dispatcher** — emits `form.spam_blocked` (scheduled after the verdict) so the admin site notification fires; it does not subscribe to any event.
- **Settings System / ENV** — global provider config (provider, site key, thresholds) lives in a single security-settings record; the **secret key lives only in a Convex ENV var**, never in the database and never client-readable.

**WooCommerce / WordPress analog:** Gravity Forms' anti-spam stack — the CAPTCHA field type (reCAPTCHA/hCaptcha/Turnstile add-ons), the built-in honeypot (`gform_honeypot`), and Akismet-style server-side verification gating `GFAPI::add_entry` — combined with a per-IP/per-form throttle. Here it is one cohesive guard instead of scattered add-ons.

---

## 1. Overview

### 1.1 Purpose

Stop automated and abusive form submissions **before they are persisted**, without ever gating the public submit path behind authentication. This system owns the three-stage guard the Form Submission System calls first on every public `submit`: (1) a **honeypot field + time-trap** check (cheap, zero-network, catches naive bots), (2) a **per-IP and per-form rate limit** with windowed counters (catches floods), and (3) **server-side CAPTCHA token verification** against a configurable provider — Cloudflare Turnstile, hCaptcha, or reCAPTCHA (catches sophisticated bots). On any failure it returns a `block` verdict with a reason, emits `form.spam_blocked`, and the submit mutation rejects before writing a row. It also owns the **global Forms security settings** (provider choice, site key, thresholds) and the admin route to configure them. It is the security boundary's first line; the Submission System remains the validation/persistence boundary behind it.

### 1.2 Scope

This layer is **net-new platform infrastructure** — it is the first rate limiter and the first CAPTCHA integration in ConvexPress. It is built once here, scoped to Forms, and designed so its guard primitives (rate-limit table, CAPTCHA-verify action) could later be generalized to other public mutations.

**In scope:**
- The `verifySubmissionSecurity` / `guardSubmission` guard: honeypot + time-trap → rate limit → CAPTCHA verify, in that fixed order.
- The `form_submission_attempts` rate-limit table (windowed counters keyed by `ip` + `formId`) and its sweep.
- Server-side CAPTCHA verification (a Convex **action**, since it makes an outbound HTTPS call) for Turnstile / hCaptcha / reCAPTCHA, provider-switchable.
- The honeypot field check + the time-trap (minimum fill duration) check.
- A single global security-settings record (provider, `siteKey`, thresholds, toggles) + the **ENV-only** secret key.
- Registering the `captcha` and `honeypot` field types into the Field Engine so the renderer can surface them.
- The admin global settings route `/admin/forms/settings`, gated by `form.manage_security`.
- Emitting `form.spam_blocked` and the "Form Spam Blocked" admin site notification.

**Out of scope:**
- The public `submit` mutation itself, the entry data model, and `spamScore` storage — owned by the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`). This system returns a verdict; submission writes it.
- Rendering the CAPTCHA widget / honeypot input + capturing `startedAt` client-side — owned by the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`).
- Field-type registry, render contract, and the validator — owned by the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`); this system only *registers* two types into it.
- Per-field validation and conditional-visibility recompute — owned by Submission + Field Engine.
- The admin entry inbox where spam-flagged entries are reviewed/restored — owned by the Form Entry Management System PRD (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`).
- Content-based spam *scoring* (Akismet-style ML/keyword scoring) — not in v2; the verdict is rule-based (honeypot/time/rate/CAPTCHA). A `score` field is reserved for a future content scorer.

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Submission System (`form_submissions`) | The sole caller; this guard is meaningless without the public `submit` mutation it protects, and it writes its verdict onto that table's `status` / `spamScore`. |
| Form Field Engine (`field-engine`) | `registerFieldType` to add `captcha` + `honeypot` value-less field types so the renderer can surface them. |
| Event Dispatcher | Schedules `form.spam_blocked` for the admin notification fan-out. |
| Settings System + Convex ENV | Stores the security-settings record (provider/siteKey/thresholds) and the ENV-only CAPTCHA secret key. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Submission System | Calls `guardSubmission` first on every public `submit`; rejects on `block` before any write; persists `spamScore` / `status: "spam"` from the verdict. |
| Form Renderer System | Renders the `captcha` provider widget + the hidden `honeypot` input, stamps `startedAt`, and forwards `captchaToken` / `honeypot` / `startedAt` into the submit envelope. |
| Form Entry Management System | Lists/restores entries this system caused to be flagged `spam`; never recomputes the verdict. |
| Form Notification System | (Optionally) consumes `form.spam_blocked`; the admin site notification defined here is the canonical reaction. |

### 2.3 Integration hooks

```typescript
// Event emitted by the Spam & Submission Security System
type FormSpamEvents = "form.spam_blocked";

// Payload downstream systems receive (brace-shorthand throughout)
interface FormSpamBlockedPayload {
  formId: Id<"forms">;
  reason: SpamBlockReason;   // why the guard blocked (see §10.3)
  ip?: string;               // server-derived; absent if not resolvable
}

// The verdict the guard returns to the Submission System's submit mutation.
// `block:true` => submission rejects before persisting. `score` is stored as spamScore.
interface SubmissionSecurityVerdict {
  ok: boolean;               // true => allow; false => block
  block: boolean;            // convenience inverse of ok (submission reads `block`)
  reason?: SpamBlockReason;  // set when blocked
  score: number;             // 0 (clean) .. 1 (certain spam); stored as spamScore
}
```

The verdict shape is the contract the Form Submission System already codes against (it reads `guard.block` and `guard.score`, the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §8.1). This system MUST return both `block` and `score`.

---

## 3. Architecture

### 3.1 The guard pipeline

The guard runs **inside** the public submit mutation, as its first step, before validation or persistence. Stages run in a fixed cheapest-first order so a naive bot is rejected without ever touching the network or the rate-limit table:

```
            Form Submission System: public submit mutation
            ─────────────────────────────────────────────
            │  args: { formId, values, honeypot,         │
            │          captchaToken, startedAt, ... }     │
            └───────────────────────┬─────────────────────┘
                                    │ FIRST, before any validate/write
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │   guardSubmission  (internal mutation, this system)    │
        └───────────────────────────────────────────────────────┘
                                    │
        Stage 1 ── HONEYPOT + TIME-TRAP ──────────────────────────
        │  honeypot field non-empty?            → block (honeypot) │
        │  (now - startedAt) < minFillMs?       → block (too_fast) │
        │  (now - startedAt) > maxFormAgeMs?    → block (too_slow) │   (zero network; cheapest)
                                    │ pass
                                    ▼
        Stage 2 ── RATE LIMIT (per IP + per form) ─────────────────
        │  read/increment windowed counter for (ip, formId)        │
        │  count > perIpPerFormLimit in window? → block (rate_ip)  │
        │  global per-form count > formLimit?   → block (rate_form)│   (1 table read/write)
                                    │ pass
                                    ▼
        Stage 3 ── CAPTCHA VERIFY (provider, outbound HTTPS) ──────
        │  captcha enabled for this form/site?                     │
        │    missing token?                     → block (captcha_missing)
        │    POST provider siteverify w/ secret → fail? block (captcha_failed)
        │    provider unreachable + failClosed? → block (captcha_unavailable)
                                    │ pass
                                    ▼
                    return { ok:true, block:false, score }
                                    │
            on ANY block: schedule form.spam_blocked, return { block:true, reason, score }
```

CAPTCHA verification requires an **outbound HTTP call**, which a Convex mutation cannot make. So Stage 3 is split: `guardSubmission` is a mutation that handles Stages 1–2 (DB-only) and, when CAPTCHA is enabled, calls an internal **action** `verifyCaptcha` for the network round-trip. (See §3.3 for why ordering this way is safe.)

### 3.2 Where it hooks into the submit mutation

The Submission System's `submit` already reserves the call site (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §8.1):

```typescript
// Inside the public submit mutation (owned by the Submission System):
const guard = await ctx.runMutation(internal.extensions.forms.spam.guardSubmission, {
  formId: args.formId,
  honeypot: args.honeypot,
  captchaToken: args.captchaToken,
  startedAt: args.startedAt,   // added to the submit envelope for the time-trap
  ip: undefined,               // derived inside the guard from request context
});
if (guard.block) throw new Error("Submission rejected");
// ... only now: validate fields, persist parent row + fieldValues, emit form.submitted.
```

This system owns `internal.extensions.forms.spam.guardSubmission`. The submit mutation owns the `if (guard.block) throw` line and the storage of `guard.score` as `spamScore`. Neither side reaches into the other's tables.

### 3.3 Mutation-then-action ordering (CAPTCHA)

A Convex mutation is transactional and cannot perform `fetch`. Two viable shapes; this PRD picks **B** as the default and notes A:

- **A — action wraps mutation:** submit is an action that first calls `verifyCaptcha` (action, does the HTTPS), then a `guardSubmissionDb` mutation (Stages 1–2 + rate-limit write). Cleanest separation, but turns the public submit into an action.
- **B (default) — mutation calls action for Stage 3 only:** `guardSubmission` mutation runs Stages 1–2; if CAPTCHA is enabled and Stages 1–2 pass, it `ctx.runAction(internal.extensions.forms.spam.verifyCaptcha, …)` for the token check, then finalizes. Keeps the public entrypoint a mutation, matching the Submission PRD's `submit = mutation({…})` exactly.

Default **B** because the Submission PRD already types `submit` as a mutation calling `guardSubmission` as a mutation; changing that to an action would ripple into the Renderer. Open question §12 revisits if Convex action-from-mutation latency proves problematic.

---

## 4. Data Model

### 4.1 `form_submission_attempts` (rate-limit counters; owned by this system)

A windowed-counter table keyed by `ip` + `formId`. One row per (ip, formId, windowStart) bucket; the guard upserts the bucket and reads its count. Chosen over a rolling per-request log because counters are O(1) to read/write and trivial to sweep.

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// Additive fragment — merged into the root schema by the v2 scanner.
// This system OWNS this table. It holds NO submission content — counters only.

form_submission_attempts: defineTable({
  formId: v.id("forms"),
  ip: v.string(),                 // server-derived; "unknown" bucket if unresolvable (§9)
  windowStart: v.number(),        // epoch ms, floored to the window size (e.g. 60_000)
  count: v.number(),              // attempts in this (ip, formId, window) bucket
  blockedCount: v.number(),       // how many of those were blocked (for admin insight)
  lastAttemptAt: v.number(),
})
  .index("by_ip_form_window", ["ip", "formId", "windowStart"]) // primary upsert/read key
  .index("by_form_window", ["formId", "windowStart"])           // per-form global limit
  .index("by_windowStart", ["windowStart"]),                    // sweep old buckets
```

**Sweep:** a scheduled internal mutation deletes buckets older than `now - retentionMs` (default a few windows) so the table stays small. This is the second scheduled job in the Forms extension (alongside any partial-submission cleanup), registered additively.

### 4.2 `form_security_settings` (single global record; owned by this system)

One record (site-global) holding non-secret provider config + thresholds. The **secret key is NOT here** — it lives only in a Convex ENV var (§4.3).

```typescript
// packages/backend/convex/extensions/forms/schema.ts (additive)
// Single-row config. Read by the guard; written only via the admin settings CRUD
// (requireCan(form.manage_security)). NEVER contains the secret key.

form_security_settings: defineTable({
  // CAPTCHA provider (non-secret)
  captchaEnabled: v.boolean(),
  captchaProvider: v.union(
    v.literal("turnstile"),  // Cloudflare Turnstile
    v.literal("hcaptcha"),   // hCaptcha
    v.literal("recaptcha"),  // Google reCAPTCHA v2/v3
    v.literal("none"),
  ),
  captchaSiteKey: v.optional(v.string()),    // PUBLIC key — safe to expose to the renderer
  // secretKey is intentionally ABSENT — read from ENV at verify time (§4.3)
  recaptchaMinScore: v.optional(v.number()), // for reCAPTCHA v3 (0..1); ignored otherwise

  // Honeypot + time-trap
  honeypotEnabled: v.boolean(),
  honeypotFieldName: v.optional(v.string()), // randomizable name the renderer plants (default "company_url")
  minFillMs: v.number(),                     // time-trap floor; faster => bot (default 2000)
  maxFormAgeMs: v.optional(v.number()),      // stale form ceiling (default 24h)

  // Rate limiting
  rateLimitEnabled: v.boolean(),
  windowMs: v.number(),                      // counter window (default 60_000)
  perIpPerFormLimit: v.number(),             // max attempts per (ip, form) per window (default 5)
  perFormLimit: v.optional(v.number()),      // optional global per-form ceiling per window
  attemptRetentionMs: v.number(),            // sweep horizon (default 10 * windowMs)

  // Behavior toggles
  failClosed: v.boolean(),                   // CAPTCHA provider down => block (true, default) vs allow
  skipForLoggedIn: v.boolean(),              // signed-in users skip CAPTCHA (default true; §9)

  updatedBy: v.optional(v.id("users")),
  updatedAt: v.number(),
}),
// Singleton by convention: CRUD reads .first(); seeds one row on initialize.
```

### 4.3 ENV — the secret key (never in the database)

The provider **secret key** is read from a Convex environment variable at verify time and is never persisted, never returned by any query, and never sent to the client. The variable name is provider-scoped so switching providers does not overwrite a stored secret:

```
# Convex deployment env (set via `npx convex env set`):
FORMS_TURNSTILE_SECRET_KEY=...
FORMS_HCAPTCHA_SECRET_KEY=...
FORMS_RECAPTCHA_SECRET_KEY=...
```

`verifyCaptcha` selects the var matching `captchaProvider`. If `captchaEnabled` is true but the matching secret is unset, the guard treats CAPTCHA as misconfigured and applies the `failClosed` policy (§9). The admin settings UI shows only whether each secret is **present**, never its value.

### 4.4 Field types registered (no new value tables)

The `captcha` and `honeypot` field types are value-less (like `message`/`accordion`/`tab` in the Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §4) — they store nothing in `fieldValues`. They exist so the builder can place them and the renderer can render them; their "values" (`captchaToken`, honeypot text) travel in the submit envelope and are consumed by the guard, never persisted as answers.

---

## 5. Field Types Added

This system registers two value-less field types into the Field Engine via its registration API (the Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §4 names `captcha`/`honeypot` as owned-by-this-system; §6 exposes `registerFieldType`). Registration is additive — the engine's registry is never forked.

| Type slug | Stores value? | Renderer behavior | Guard consumes |
|---|---|---|---|
| `captcha` | No | Renders the configured provider widget (Turnstile / hCaptcha / reCAPTCHA) using the **public** `captchaSiteKey`; produces a token. | `captchaToken` in the submit envelope → Stage 3 |
| `honeypot` | No | Renders a visually hidden, `aria-hidden`, `tabindex="-1"`, `autocomplete="off"` input under a randomizable name; humans never fill it. | `honeypot` in the submit envelope → Stage 1 |

```typescript
// packages/backend/convex/extensions/forms/spam.fieldTypes.ts (or the extension's register step)
import { registerFieldType } from "@convexpress/field-engine";

registerFieldType({
  type: "captcha",
  valueLess: true,            // skipped by validator + serializer, like message/accordion/tab
  category: "security",
  // renderer binding is provided host-side on the Website (Renderer system),
  // keyed off form_security_settings.captchaProvider + captchaSiteKey.
});

registerFieldType({
  type: "honeypot",
  valueLess: true,
  category: "security",
  hiddenFromBuilderPalette: false, // builder may place it; usually auto-injected by the renderer
});
```

> Whether the honeypot is an explicit placeable field or **auto-injected** by the renderer on every form (regardless of builder placement) is an open question (§12). Default: auto-injected when `honeypotEnabled`, with the `captcha` field explicitly placeable so authors control widget position. Either way the guard logic is identical.

---

## 6. Routes

### 6.1 Admin route (Admin app)

| Route | Path | Layout | Auth Required | Capability |
|---|---|---|---|---|
| Forms Security Settings | `/admin/forms/settings` | `_admin` / `_authenticated` | Yes (Convex Auth) | `form.manage_security` |

The single user-facing surface: a **global** Forms security settings page (not per-form) under the canonical Forms admin tree `apps/web/src/routes/_authenticated/_admin/forms/settings/`. It configures the CAPTCHA provider + public site key, surfaces whether each provider secret is present in ENV, and edits honeypot/time-trap and rate-limit thresholds. It is registered additively via the extension manifest/nav scanner — never by hand-editing `nav-config.ts`.

No public routes. The renderer surfaces the widget/honeypot on the existing public `/forms/$slug` route owned by the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`); this system adds none of its own public routes.

---

## 7. Actions

### 7.1 Admin actions (capability-gated)

| Action | Code | Description | Roles | Triggers Events |
|---|---|---|---|---|
| Configure Forms security | `form.manage_security` | Read/update the global `form_security_settings` (provider, site key, thresholds, toggles) | **Administrator only** (via `requireCan`) | — |

`form.manage_security` is the **only** capability this system defines, and it is **admin-only**. Every settings query/mutation begins with `await requireCan(ctx, "form.manage_security")`. There is no per-form security action and no public action here — the only public interaction (the guard) is invoked *by* the Submission System's un-gated `submit` and is itself an `internal` function, not a public action.

### 7.2 System / internal actions (NOT capability-gated; internal-only)

| Action | Code (internal fn) | Description | Triggered By |
|---|---|---|---|
| Guard submission | `internal.extensions.forms.spam.guardSubmission` | Run Stages 1–3; return verdict; emit `form.spam_blocked` on block | The public `submit` mutation (Submission System), first thing |
| Verify CAPTCHA | `internal.extensions.forms.spam.verifyCaptcha` | Outbound provider `siteverify` round-trip (action) | `guardSubmission`, Stage 3 when CAPTCHA enabled |
| Sweep attempt buckets | `internal.extensions.forms.spam.sweepAttempts` | Delete `form_submission_attempts` buckets older than `attemptRetentionMs` | Scheduled cron (Forms extension) |

These are `internal*` functions — not part of the public API surface and not capability-gated (they run server-to-server; the public boundary is the Submission System's `submit`, which is intentionally guest-callable, the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §5.1).

---

## 8. Events

### 8.1 Events emitted

| Event | Code | Trigger | Payload |
|---|---|---|---|
| Form Spam Blocked | `form.spam_blocked` | The guard returns a `block` verdict (any stage) | `{ formId, reason, ip }` |

`form.spam_blocked` is scheduled via `ctx.scheduler.runAfter(0, internal.events.dispatch, …)` from within `guardSubmission` at the moment a block is decided — **before** the submit mutation throws, so the event fires even though no `form_submissions` row is written. `reason` is the `SpamBlockReason` enum (§10.3); `ip` is the server-derived address (omitted if unresolvable, §9). The payload deliberately carries **no submission content** (there is none to carry — the entry was never created).

### 8.2 Events consumed

None. This system is a producer + a synchronous guard; it subscribes to no events. (The Submission System's `form.submitted` is unrelated to the block path.)

---

## 9. Notifications

Triggered by the single `form.spam_blocked` event. The handler is owned/implemented by the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`); this system's obligation is only to emit the event.

### 9.1 Site notifications

| Name | Trigger Event | Recipient | Type |
|---|---|---|---|
| Form Spam Blocked | `form.spam_blocked` | Admin | Warning |

A site notification surfaced to administrators when the guard blocks a submission, so spam pressure is visible without digging into logs. To avoid notification floods under an active attack, the handler **debounces/aggregates** (e.g. one rolled-up notification per form per window — "N submissions blocked on *Contact* in the last hour"), keyed off the event payload. The aggregation rule lives in the Notification System; this system simply emits one event per block.

### 9.2 Email notifications

None by default in v2. (A daily/weekly admin "spam digest" email is a future consideration, §12 / the Notification System.)

---

## 10. API Design

### 10.1 The guard — `verifySubmissionSecurity` / `guardSubmission`

The single entrypoint the Submission System calls. Internal (not public). Runs Stages 1–3 and returns the verdict the submit mutation acts on. The exported helper name is `verifySubmissionSecurity` (a pure-ish core taking explicit args); `guardSubmission` is the `internalMutation` wrapper the Submission System references by codegen path.

```typescript
// packages/backend/convex/extensions/forms/spam.ts
import { internalMutation, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";

type SpamBlockReason =
  | "honeypot"            // honeypot field was filled
  | "too_fast"           // submitted faster than minFillMs (bot)
  | "too_slow"           // form older than maxFormAgeMs (stale/replayed)
  | "rate_ip"            // per-IP per-form limit exceeded
  | "rate_form"          // global per-form limit exceeded
  | "captcha_missing"    // CAPTCHA enabled but no token supplied
  | "captcha_failed"     // provider rejected the token
  | "captcha_unavailable"; // provider unreachable + failClosed

interface SubmissionSecurityVerdict {
  ok: boolean;
  block: boolean;        // = !ok; the Submission System reads THIS
  reason?: SpamBlockReason;
  score: number;         // 0..1; stored as spamScore by the Submission System
}

// INTERNAL: called server-to-server by the public submit mutation. Not a public
// action, not capability-gated. The public boundary is submit (guest-callable);
// this is its first delegated step. Abuse control, not authorization.
export const guardSubmission = internalMutation({
  args: {
    formId: v.id("forms"),
    honeypot: v.optional(v.string()),
    captchaToken: v.optional(v.string()),
    startedAt: v.optional(v.number()),   // client stamp; clamped/validated server-side
    ip: v.optional(v.string()),          // server-derived; passed undefined, resolved here
  },
  handler: async (ctx, args): Promise<SubmissionSecurityVerdict> => {
    const settings = await loadSecuritySettings(ctx); // .first() singleton, defaults if unseeded
    const now = Date.now();
    const ip = deriveClientIp(ctx, args.ip);          // §9: first XFF hop / connecting IP; "unknown" fallback

    const block = (reason: SpamBlockReason, score = 1): SubmissionSecurityVerdict => {
      // Emit AFTER deciding, BEFORE submit throws. No submission row exists.
      ctx.scheduler.runAfter(0, internal.events.dispatch, {
        eventCode: "form.spam_blocked",
        payload: { formId: args.formId, reason, ip: ip === "unknown" ? undefined : ip },
      });
      return { ok: false, block: true, reason, score };
    };

    // ── Stage 1: honeypot + time-trap (zero network) ──────────────────────────
    if (settings.honeypotEnabled) {
      if (args.honeypot && args.honeypot.trim() !== "") return block("honeypot");
      if (args.startedAt !== undefined) {
        const elapsed = now - args.startedAt;
        if (elapsed >= 0 && elapsed < settings.minFillMs) return block("too_fast");
        if (settings.maxFormAgeMs && elapsed > settings.maxFormAgeMs) return block("too_slow");
      }
    }

    // ── Stage 2: rate limit per (ip, formId) + optional per-form ──────────────
    if (settings.rateLimitEnabled) {
      const windowStart = Math.floor(now / settings.windowMs) * settings.windowMs;
      const bucket = await ctx.db
        .query("form_submission_attempts")
        .withIndex("by_ip_form_window", (q) =>
          q.eq("ip", ip).eq("formId", args.formId).eq("windowStart", windowStart))
        .first();
      const nextCount = (bucket?.count ?? 0) + 1;

      const overIp = nextCount > settings.perIpPerFormLimit;
      const overForm = settings.perFormLimit !== undefined &&
        (await countFormAttemptsInWindow(ctx, args.formId, windowStart)) + 1 > settings.perFormLimit;

      // Record the attempt regardless (so the limiter actually bites), marking blocks.
      await upsertAttempt(ctx, bucket, {
        formId: args.formId, ip, windowStart,
        count: nextCount, lastAttemptAt: now,
        blockedIncrement: overIp || overForm ? 1 : 0,
      });

      if (overIp) return block("rate_ip");
      if (overForm) return block("rate_form");
    }

    // ── Stage 3: CAPTCHA verify (outbound HTTPS via action) ───────────────────
    const captchaRequired =
      settings.captchaEnabled &&
      settings.captchaProvider !== "none" &&
      !(settings.skipForLoggedIn && (await ctx.auth.getUserIdentity()) !== null); // §9 logged-in skip

    if (captchaRequired) {
      if (!args.captchaToken) return block("captcha_missing");
      const result = await ctx.runAction(internal.extensions.forms.spam.verifyCaptcha, {
        provider: settings.captchaProvider,
        token: args.captchaToken,
        ip: ip === "unknown" ? undefined : ip,
        minScore: settings.recaptchaMinScore, // reCAPTCHA v3 only
      });
      if (result.status === "unreachable") {
        return settings.failClosed ? block("captcha_unavailable") : { ok: true, block: false, score: 0.5 };
      }
      if (!result.success) return block("captcha_failed", result.score ?? 1);
      // pass; provider score (v3) folded into verdict score if present
      return { ok: true, block: false, score: result.score ?? 0 };
    }

    return { ok: true, block: false, score: 0 };
  },
});
```

### 10.2 CAPTCHA verification — `verifyCaptcha` (action; outbound HTTPS)

A Convex **action** (mutations cannot `fetch`). Reads the **ENV-only** secret matching the provider, POSTs the provider's `siteverify`, normalizes the response. Never reads/writes the DB and never logs the secret.

```typescript
// packages/backend/convex/extensions/forms/spam.ts
export const verifyCaptcha = internalAction({
  args: {
    provider: v.union(v.literal("turnstile"), v.literal("hcaptcha"), v.literal("recaptcha")),
    token: v.string(),
    ip: v.optional(v.string()),
    minScore: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<{ success: boolean; score?: number; status: "ok" | "unreachable" }> => {
    const cfg = {
      turnstile: { url: "https://challenges.cloudflare.com/turnstile/v0/siteverify", env: "FORMS_TURNSTILE_SECRET_KEY" },
      hcaptcha:  { url: "https://api.hcaptcha.com/siteverify",                       env: "FORMS_HCAPTCHA_SECRET_KEY" },
      recaptcha: { url: "https://www.google.com/recaptcha/api/siteverify",          env: "FORMS_RECAPTCHA_SECRET_KEY" },
    }[args.provider];

    const secret = process.env[cfg.env];
    if (!secret) return { success: false, status: "ok" }; // misconfig => caller applies failClosed policy

    const body = new URLSearchParams({ secret, response: args.token });
    if (args.ip) body.set("remoteip", args.ip);

    let data: any;
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(5000), // bounded; provider hang must not stall submit
      });
      data = await res.json();
    } catch {
      return { success: false, status: "unreachable" }; // network/timeout => failClosed decides
    }

    // reCAPTCHA v3 returns a score; v2/hCaptcha/Turnstile return success boolean.
    const score: number | undefined = typeof data.score === "number" ? data.score : undefined;
    const success =
      data.success === true &&
      (score === undefined || args.minScore === undefined || score >= args.minScore);

    // Normalize provider "score" into our 0(clean)..1(spam) space when present.
    return { success, score: score !== undefined ? 1 - score : undefined, status: "ok" };
  },
});
```

### 10.3 Settings CRUD (admin-only, `requireCan`)

```typescript
// packages/backend/convex/extensions/forms/spam.ts
import { query, mutation } from "../../_generated/server";
import { requireCan } from "../../lib/auth"; // existing capability helper

// Read the global security settings for the admin page. Capability-gated.
// NEVER returns the secret key (it isn't stored); returns presence flags instead.
export const getSecuritySettings = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "form.manage_security");
    const settings = await loadSecuritySettings(ctx); // defaults if unseeded
    return {
      ...settings,
      // Surface only whether each provider secret is configured in ENV — never the value.
      secretPresence: {
        turnstile: !!process.env.FORMS_TURNSTILE_SECRET_KEY,
        hcaptcha: !!process.env.FORMS_HCAPTCHA_SECRET_KEY,
        recaptcha: !!process.env.FORMS_RECAPTCHA_SECRET_KEY,
      },
    };
  },
});

// Update the global security settings. Admin-only. Validates thresholds; never
// accepts a secret key (secrets are ENV-managed out of band).
export const updateSecuritySettings = mutation({
  args: {
    captchaEnabled: v.optional(v.boolean()),
    captchaProvider: v.optional(v.union(
      v.literal("turnstile"), v.literal("hcaptcha"), v.literal("recaptcha"), v.literal("none"))),
    captchaSiteKey: v.optional(v.string()),       // PUBLIC key only
    recaptchaMinScore: v.optional(v.number()),
    honeypotEnabled: v.optional(v.boolean()),
    honeypotFieldName: v.optional(v.string()),
    minFillMs: v.optional(v.number()),
    maxFormAgeMs: v.optional(v.number()),
    rateLimitEnabled: v.optional(v.boolean()),
    windowMs: v.optional(v.number()),
    perIpPerFormLimit: v.optional(v.number()),
    perFormLimit: v.optional(v.number()),
    failClosed: v.optional(v.boolean()),
    skipForLoggedIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_security");
    // Reject any attempt to smuggle a secret through this mutation (defense in depth).
    assertNoSecretKeyInArgs(args);
    validateThresholds(args); // windowMs>0, limits>0, minFillMs within sane bounds, score 0..1
    const existing = await loadSecuritySettings(ctx, { raw: true });
    const patch = { ...args, updatedBy: await resolveUserId(ctx), updatedAt: Date.now() };
    return existing
      ? await ctx.db.patch(existing._id, patch)
      : await ctx.db.insert("form_security_settings", withDefaults(patch));
  },
});
```

---

## 11. Business Rules & Constraints

- **Guard runs first, before any write.** `guardSubmission` is the first call inside the public `submit`; on `block` the submit throws before validating fields or inserting a `form_submissions` row. No blocked submission is ever persisted.
- **Server-side CAPTCHA verification only.** The token is verified server-side against the provider's `siteverify` using the secret. The client's claim that it "passed" is never trusted; a present token is necessary but not sufficient.
- **Secret keys never client-exposed.** Provider secrets live only in Convex ENV, are read only inside the `verifyCaptcha` action, are never stored in the DB, never returned by any query, never logged. Only the **public** `captchaSiteKey` reaches the renderer.
- **Configurable thresholds.** Window size, per-IP/per-form limits, `minFillMs`, `maxFormAgeMs`, provider, and the `failClosed`/`skipForLoggedIn` toggles are all admin-editable via `form.manage_security`. Sensible defaults ship so the guard is effective before any configuration.
- **Fail-closed on CAPTCHA when enabled (default).** If CAPTCHA is enabled but the provider is unreachable/misconfigured, the default is to **block** (`failClosed: true`) — a security control that silently fails open is not a control. Admins may opt into fail-open per the toggle, accepting the trade-off.
- **Honeypot/time-trap are advisory-cheap, CAPTCHA is authoritative.** Stages 1–2 are zero/low-cost heuristics that catch most bots; Stage 3 is the strong gate. A site may run honeypot+rate-limit only (no provider keys) and still get meaningful protection.
- **Rate limit is per IP *and* per form.** The primary bucket is `(ip, formId, window)`; an optional global `(formId, window)` ceiling caps distributed floods on a single form. Counters are windowed (not rolling logs) for O(1) reads.
- **Request metadata is server-derived.** `ip` is derived server-side from request context, never trusted from the client body (mirrors the Submission PRD's server-derived `ip`/`userAgent`).
- **Verdict, not persistence.** This system returns `{ block, score }` and emits `form.spam_blocked`; it does **not** write `form_submissions`, set `status: "spam"`, or store `spamScore` — the Submission System does, from the verdict. Single owner per table.
- **Capability is admin-only and config-only.** `form.manage_security` gates only the settings surface. It does **not** gate `submit` — adding a capability check to the public submit would break public forms (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §9).
- **Additive-only (v2).** `form_submission_attempts`, `form_security_settings`, the route, the cron, and the two field types are all declared in the extension's fragments and merged by the scanner; this system never edits root `schema.ts`, `registry.ts`, or `nav-config.ts`.

---

## 12. Edge Cases

| Scenario | Handling |
|---|---|
| CAPTCHA provider down / times out | `verifyCaptcha` returns `unreachable`; guard applies `failClosed` — block by default (reason `captcha_unavailable`), allow only if admin opted into fail-open. Bounded 5s timeout so submit never hangs. |
| CAPTCHA enabled but secret unset (misconfig) | `verifyCaptcha` returns no-secret; treated as misconfig → `failClosed` policy. Admin page flags the missing secret via `secretPresence`. |
| Logged-in user submits | If `skipForLoggedIn` (default true), CAPTCHA is **skipped** for authenticated identities — they are not anonymous and the friction isn't justified. Honeypot + rate-limit still apply (cheap, no friction). Toggle off to force CAPTCHA for everyone. |
| Legitimate user retries after a transient error | Rate-limit window is short (default 60s, 5/window) so honest retries are absorbed; a blocked attempt still increments the counter, so hammering retries can trip the limiter — acceptable, and the renderer should surface a "try again shortly" message rather than auto-retry. |
| Missing `startedAt` (no client stamp) | Time-trap is skipped for that submission (can't compute elapsed); honeypot + rate-limit + CAPTCHA still run. Renderer should always stamp `startedAt`; absence degrades gracefully, never blocks falsely. |
| Honeypot filled by a password manager / aggressive autofill | Mitigated by `autocomplete="off"`, `aria-hidden`, off-screen positioning, and a non-obvious randomizable field name; residual false-positives are the reason CAPTCHA (not honeypot) is the authoritative gate. |
| IP unresolvable / behind proxy | `deriveClientIp` reads the first hop of `X-Forwarded-For` (or the connecting IP), falling back to an `"unknown"` bucket. Per-form ceiling still bites the `"unknown"` bucket under a flood; `form.spam_blocked` omits `ip` when unknown. |
| IPv6 address | Stored/keyed as the normalized string form; IPv6 is a valid `ip` bucket key like IPv4. (Optional /64-prefix bucketing to thwart trivial IPv6 rotation is an open question §12.) |
| Shared IP (NAT, office, mobile carrier) | Per-IP+per-form limit risks penalizing co-located legit users; window is short and CAPTCHA (not the limiter) is primary, so impact is bounded. Limits are tunable per site if a tenant reports false blocks. |
| Distributed bot, many IPs, one form | Per-IP limit won't bite; the optional `perFormLimit` global ceiling does. CAPTCHA remains the backstop. |
| Multi-step / save-and-continue partial writes | The guard runs on each `submit` call (including partials). To avoid burning the rate limit across steps of one honest fill, per-step partials may pass a stable resume token so the limiter can attribute them to one session — coordinated with the Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`); default is to count each call (open question §12). |
| Replayed CAPTCHA token | Providers reject already-redeemed tokens server-side → `captcha_failed`. We additionally rely on the provider's single-use semantics rather than tracking tokens ourselves. |
| Spam notification flood under active attack | The `form.spam_blocked` site notification is aggregated/debounced per form per window by the Notification System, so an attack produces a digest, not thousands of toasts. |
| Settings unseeded (fresh install) | `loadSecuritySettings` returns built-in defaults (honeypot+rate-limit on, CAPTCHA off until keys configured) so the guard is safe and effective before an admin visits the settings page. |

---

## 13. Security Considerations

### 13.1 Secret handling
- Provider secrets are **ENV-only**, read solely inside `verifyCaptcha`, never persisted, never returned, never logged. The settings table holds only the public site key + presence flags surface in `getSecuritySettings`.
- `updateSecuritySettings` actively rejects any secret-shaped argument (`assertNoSecretKeyInArgs`) so a secret can never be written into the DB even by mistake.

### 13.2 Verification integrity
- CAPTCHA is verified **server-side** with the secret + the user's IP (`remoteip`); a client "I passed" is never trusted. The `verifyCaptcha` call is bounded (5s) so a provider hang cannot stall the public submit.
- Fail-closed by default: an enabled-but-unverifiable CAPTCHA blocks. Fail-open is an explicit, logged admin choice.

### 13.3 Anti-abuse boundary, not auth
- The public `submit` stays un-gated for guests (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §9); this system is the abuse boundary instead of authorization. The only capability, `form.manage_security`, gates configuration, never submission.
- All internal guard functions are `internal*` (not public), callable only server-to-server from the submit mutation and the cron.

### 13.4 Resource safety
- Rate-limit counters are windowed and swept (`sweepAttempts`) so the table cannot grow unbounded under a flood. The limiter records every attempt (including blocked ones) so an attacker cannot evade it by guaranteeing rejection.
- The guard performs at most one DB read + one write (Stage 2) and at most one bounded outbound call (Stage 3) per submit — predictable cost even under load.

### 13.5 Information disclosure
- `form.spam_blocked` and rejection errors are intentionally low-detail to the client ("Submission rejected") so a bot cannot probe which stage caught it; the `reason` is available to admins via the event/notification, not the public response.

---

## 14. Implementation Checklist

**Phase 1 — settings + schema (net-new infra)**
- [ ] Add `form_security_settings` (singleton) + `form_submission_attempts` to the Forms extension schema fragment with the three indexes.
- [ ] Define the three ENV vars (`FORMS_TURNSTILE_SECRET_KEY` / `_HCAPTCHA_` / `_RECAPTCHA_`); document `npx convex env set`.
- [ ] Implement `getSecuritySettings` / `updateSecuritySettings` with `requireCan(form.manage_security)`, secret-rejection, and threshold validation.
- [ ] Build the `/admin/forms/settings` route (provider picker, public site key, presence flags, thresholds, toggles), registered additively via the manifest/nav scanner.

**Phase 2 — the guard (Stages 1–2)**
- [ ] Implement `guardSubmission` internal mutation: honeypot + time-trap (Stage 1), per-IP+per-form windowed rate limit (Stage 2).
- [ ] Implement `deriveClientIp` (XFF first hop / connecting IP; `"unknown"` fallback; IPv6-safe).
- [ ] Implement `upsertAttempt` + `countFormAttemptsInWindow`; record every attempt, mark blocks.
- [ ] Emit `form.spam_blocked` with `{ formId, reason, ip }` on block, before returning.

**Phase 3 — CAPTCHA verify (Stage 3)**
- [ ] Implement `verifyCaptcha` internal action: provider-switched `siteverify`, ENV secret, bounded 5s timeout, normalized result, reCAPTCHA v3 score handling.
- [ ] Wire Stage 3 into `guardSubmission` (skip-for-logged-in, fail-closed policy, missing-token handling).

**Phase 4 — field types + wiring**
- [ ] Register `captcha` + `honeypot` value-less field types via `registerFieldType`.
- [ ] Confirm the Submission System's `submit` calls `guardSubmission` first and stores `guard.score` as `spamScore` / sets `status:"spam"` on block (coordinate, do not edit its file beyond the existing call site).
- [ ] Coordinate the Renderer to render the provider widget (public site key) + hidden honeypot + `startedAt` stamp, forwarding `captchaToken`/`honeypot`/`startedAt`.

**Phase 5 — sweep + notification**
- [ ] Implement `sweepAttempts` internal mutation + register the Forms-extension cron (additive).
- [ ] Confirm the "Form Spam Blocked" admin site notification fires on `form.spam_blocked` and is aggregated/debounced by the Notification System.

---

## 15. Open Questions

- **Honeypot: auto-injected vs placeable.** Default: auto-inject when `honeypotEnabled` (renderer plants it on every form) with `captcha` explicitly placeable. Reconsider if authors need per-form honeypot control.
- **Mutation-then-action shape (§3.3).** Default B (mutation calls action for Stage 3) preserves the Submission PRD's `submit = mutation`. Revisit to shape A (submit-as-action) only if Convex action-from-mutation latency on the hot submit path proves material.
- **Multi-step rate accounting.** Should partial writes across one fill share a rate-limit bucket via the resume token, or count each `submit` call? Default: count each; coordinate with the Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`) if honest multi-step fills trip the limiter.
- **IPv6 bucketing granularity.** Per-exact-address (default) vs per-/64-prefix to resist trivial IPv6 rotation. Default exact; revisit with abuse data.
- **Content scoring (future `score`).** v2 `score` is rule-derived (0/0.5/1 + provider v3 score). An Akismet-style content scorer could populate a richer `spamScore` later without changing the verdict contract.
- **Generalizing the rate limiter.** `form_submission_attempts` + the windowed-counter primitive are the first rate limiter in ConvexPress; whether to promote them to a shared platform utility for other public mutations is parked until a second consumer appears.
- **Provider verticality.** reCAPTCHA v2 vs v3 (score-based) vs Enterprise differ in client+verify flow; v2/Turnstile/hCaptcha are the v2 baseline, reCAPTCHA v3 supported via `recaptchaMinScore`. Enterprise variants parked.

---

## 16. Cross-References

- Guards / called by: Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — canonical
- Renderer surfaces widget/honeypot: Form Renderer System (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) — canonical
- Registers field types into: Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`) — canonical
- Spam-flagged entries reviewed in: Form Entry Management System (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`)
- Notification handler owned by: Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`)
- Multi-step rate accounting: Multi-Step & Save-Continue System (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Spam & Submission Security System · **Plugin:** ConvexPress Forms (v2)
