# PLAN: Form Spam & Submission Security System

> Lean build plan for the PRD in this folder (`PRD.md`). Repo root for all paths below: `ConvexPress-Admin/`.
> The admin app owns Convex + all mutations. This is a **v2 extension** (`extensions/forms/`), additive-only.

## Reality check (read before building — the PRD assumes richer scaffolding than exists)

The tables already exist but in **minimal** form, and a few PRD primitives are conceptual. Build against reality, not the PRD's maximal spec:

- **`form_submission_attempts`** exists as `{ ip, formId, windowStart, count }` with index `by_ip_form` only (`packages/backend/convex/extensions/forms/schema.ts:177`). The PRD's `blockedCount` / `lastAttemptAt` / extra indexes are **optional** — add only `by_windowStart` (needed for the sweep) and keep counters as-is. Do **not** rebuild the table to the PRD's maximal shape.
- **`form_security_settings`** exists as `{ key, captchaProvider, captchaSiteKey, rateLimitPerMinute, honeypotEnabled }` (singleton via `key:"global"`, index `by_key`) (`schema.ts:185`). It is missing most threshold/toggle fields the guard needs (`captchaEnabled`, `minFillMs`, `failClosed`, etc.). Add them **additively** with `v.optional(...)`, defaulted in a `loadSecuritySettings` helper — never break the existing 5 fields.
- **`internal.events.dispatch` does NOT exist.** The real emit path is `emitEvent(ctx, code, system, payload)` (`packages/backend/convex/helpers/events.ts:84`). It rejects non-2-segment/non-lowercase codes and *warns* on unknown codes. So `form.spam_blocked` must be added to `FORM_EVENTS` (one additive line in the events constants hub).
- **No runtime `registerFieldType` API.** Field types are arrays in `packages/backend/convex/customFields/validators.ts` (`SUPPORTED_FIELD_TYPES`, `LAYOUT_FIELD_TYPES`). "Registering captcha/honeypot" = appending the two slugs there (value-less, treated like `message`/`accordion`/`tab`). The `submit` mutation already skips layout types by slug; extend that skip-set.
- **Crons are hand-edited** in a central hub `packages/backend/convex/crons.ts` (no additive cron scanner in the kit). The sweep cron is a hand-add there, matching every other system.
- **`/admin/forms/settings` route already exists** as a placeholder (`apps/web/src/routes/_authenticated/_admin/forms/settings.tsx`) with `PluginGuard` + `useCan("form.manage_security")` already wired. You flesh out its body; you do **not** create the route or touch nav (nav already lists Settings at `apps/web/src/extensions/forms/nav.ts:49`).
- **`form.manage_security` capability** is surfaced (cast `formCap(cap as Capability)`), not yet in the closed `Capability` union — follow the existing cast pattern in `mutations.ts`/`nav.ts`. Do NOT edit the Role/Capability registry (out of scope per repo rules).
- **You don't deploy.** Work ends at "code written + `bunx convex codegen` + typecheck pass." Deploys are the convex-deployment agent's job.

---

## Build steps (ordered)

### Phase 1 — Schema additions (additive only)

**1. Extend `form_security_settings` + add sweep index to `form_submission_attempts`.**
File: `packages/backend/convex/extensions/forms/schema.ts`
- In `form_security_settings`, **append** optional fields (keep the existing 5 untouched): `captchaEnabled: v.optional(v.boolean())`, `recaptchaMinScore: v.optional(v.number())`, `honeypotFieldName: v.optional(v.string())`, `minFillMs: v.optional(v.number())`, `maxFormAgeMs: v.optional(v.number())`, `rateLimitEnabled: v.optional(v.boolean())`, `windowMs: v.optional(v.number())`, `perIpPerFormLimit: v.optional(v.number())`, `perFormLimit: v.optional(v.number())`, `attemptRetentionMs: v.optional(v.number())`, `failClosed: v.optional(v.boolean())`, `skipForLoggedIn: v.optional(v.boolean())`, `updatedBy: v.optional(v.id("users"))`, `updatedAt: v.optional(v.number())`.
- In `form_submission_attempts`, **add** `.index("by_form_window", ["formId", "windowStart"])` and `.index("by_windowStart", ["windowStart"])` (keep `by_ip_form`). Optionally append `blockedCount: v.optional(v.number())` + `lastAttemptAt: v.optional(v.number())` for admin insight — both optional.

### Phase 2 — Field types (value-less registration)

**2. Add `captcha` + `honeypot` field types.**
File: `packages/backend/convex/customFields/validators.ts`
- Append `"captcha"` and `"honeypot"` to `SUPPORTED_FIELD_TYPES`.
- Add both to `LAYOUT_FIELD_TYPES` (they store no value, exactly like `message`).

**3. Teach `submit` to treat them as value-less.**
File: `packages/backend/convex/extensions/forms/mutations.ts`
- In the `submit` handler's two skip checks (currently `def.type === "message" || ... "accordion" || ... "tab"`, at lines ~586 and ~683), add `|| def.type === "captcha" || def.type === "honeypot"`. (Prefer importing `LAYOUT_FIELD_TYPES` and using `.has(def.type)` to avoid drift — single source of truth.)

### Phase 3 — Event constant

**4. Add the `form.spam_blocked` event code.**
File: `packages/backend/convex/events/constants.ts`
- Add `SPAM_BLOCKED: "form.spam_blocked"` to `FORM_EVENTS` (line ~336). `ALL_EVENT_CODES` / `EVENT_CODES_BY_SYSTEM` already spread `FORM_EVENTS`, so it's picked up automatically. Retention defaults to 90d (fine).

### Phase 4 — The guard module (core of this system)

**5. Create `spam.ts` with the guard, the CAPTCHA action, and settings CRUD.**
File (NEW): `packages/backend/convex/extensions/forms/spam.ts`
Imports: `internalMutation, internalAction, query, mutation` from `../../_generated/server`; `internal` from `../../_generated/api`; `v, ConvexError` from `convex/values`; `requireCan` from `../../helpers/permissions`; `emitEvent` from `../../helpers/events`; `FORM_EVENTS, SYSTEM` from `../../events/constants`; `Capability` from `../../types/capabilities`; `Id` from `../../_generated/dataModel`.

Implement in this order:

- **`SpamBlockReason` type + `SubmissionSecurityVerdict` interface** (per PRD §10.1: `{ ok, block, reason?, score }`).
- **`SECURITY_DEFAULTS` const + `loadSecuritySettings(ctx)`** — reads the `key:"global"` singleton via `by_key`; spreads defaults over whatever fields are set so the guard is effective unseeded (PRD §12 "settings unseeded"): honeypot on, rate-limit on (`windowMs:60_000`, `perIpPerFormLimit:5`, `minFillMs:2000`, `maxFormAgeMs:24h`, `attemptRetentionMs:10*windowMs`), `captchaEnabled:false`, `captchaProvider:"none"`, `failClosed:true`, `skipForLoggedIn:true`. Bridge the legacy `rateLimitPerMinute` field → `perIpPerFormLimit` if the new field is unset.
- **`deriveClientIp(ctx, ipArg)`** — return `ipArg` if provided, else `"unknown"` (Convex mutation ctx has no request IP; XFF parsing only applies if an HTTP-action front door later passes `ip`). Keep it a single helper so the future front door has one seam. IPv6 = stored as its string form.
- **`internalAction verifyCaptcha`** (PRD §10.2) — args `{ provider, token, ip?, minScore? }`. Provider→`{url, env}` map for `FORMS_TURNSTILE_SECRET_KEY` / `_HCAPTCHA_` / `_RECAPTCHA_`. Read `process.env[env]`; if missing → `{ success:false, status:"ok" }` (misconfig → caller applies failClosed). POST `siteverify` form-urlencoded with `AbortSignal.timeout(5000)`; on throw → `{ status:"unreachable" }`. Normalize reCAPTCHA v3 `score` into `1 - score` spam-space. Never log the secret; never touch the DB.
- **`internalMutation guardSubmission`** (PRD §10.1) — args `{ formId, honeypot?, captchaToken?, startedAt?, ip? }`, returns `SubmissionSecurityVerdict`. Local `block(reason, score=1)` closure that calls `emitEvent(ctx, FORM_EVENTS.SPAM_BLOCKED, SYSTEM.FORMS, { formId, reason, ip: ip==="unknown"?undefined:ip })` **then** returns `{ ok:false, block:true, reason, score }`. Stages, in fixed order:
  - **Stage 1 honeypot + time-trap** (if `honeypotEnabled`): honeypot non-empty → `block("honeypot")`; if `startedAt` set, `elapsed < minFillMs` → `block("too_fast")`, `elapsed > maxFormAgeMs` → `block("too_slow")`. Missing `startedAt` → skip time-trap (degrade gracefully).
  - **Stage 2 rate limit** (if `rateLimitEnabled`): `windowStart = floor(now/windowMs)*windowMs`; read bucket via `by_ip_form` filtered to `windowStart` (or add the eq on windowStart using the existing index then in-memory match — the minimal table has no composite ip+form+window index; query `by_ip_form` and find the row with matching `windowStart`, or upsert one). `nextCount = (bucket?.count ?? 0) + 1`. Optional per-form ceiling via `by_form_window`. **Upsert the bucket regardless** (so the limiter bites and records blocked attempts), then `block("rate_ip")` / `block("rate_form")` if over.
  - **Stage 3 CAPTCHA** (if `captchaEnabled && provider!=="none"` and not `skipForLoggedIn && getUserIdentity()!==null`): no token → `block("captcha_missing")`; else `ctx.runAction(internal.extensions.forms.spam.verifyCaptcha, {...})`. `status==="unreachable"` → `failClosed ? block("captcha_unavailable") : {ok:true,block:false,score:0.5}`. `!success` → `block("captcha_failed", score??1)`. Pass → `{ ok:true, block:false, score: score??0 }`.
  - Fall-through → `{ ok:true, block:false, score:0 }`.
- **`internalMutation sweepAttempts`** — delete `form_submission_attempts` rows where `windowStart < now - attemptRetentionMs` via `by_windowStart`; bounded `.take(500)` per run (mutation time-limit safety), mirroring `search-analytics-purge` in `crons.ts`.
- **`query getSecuritySettings`** (PRD §10.3) — `await requireCan(ctx, "form.manage_security" as Capability)`; return `loadSecuritySettings(ctx)` spread **plus** `secretPresence: { turnstile: !!process.env.FORMS_TURNSTILE_SECRET_KEY, hcaptcha: ..., recaptcha: ... }`. Never returns a secret (none is stored).
- **`mutation updateSecuritySettings`** (PRD §10.3) — `requireCan(...)`; `assertNoSecretKeyInArgs(args)` (reject any key matching `/secret/i`, defense-in-depth); `validateThresholds(args)` (`windowMs>0`, limits>0, `minFillMs` 0..60000, `recaptchaMinScore` 0..1); upsert the `key:"global"` row patching `{ ...args, updatedBy: user._id, updatedAt: Date.now() }` (insert with `key:"global"` if none). Accepts **public** `captchaSiteKey` only.

### Phase 5 — Wire the guard into `submit`

**6. Replace the TODO seam with the guard call.**
File: `packages/backend/convex/extensions/forms/mutations.ts` (the `// TODO(form-spam-security): verifySubmissionSecurity(...)` block at ~line 549)
- After loading the form (only published forms reach here), before validation:
  ```ts
  const guard = await ctx.runMutation(internal.extensions.forms.spam.guardSubmission, {
    formId: args.formId,
    honeypot: args.honeypot,
    captchaToken: args.captchaToken,
    startedAt: args.startedAt,
    ip: undefined,
  });
  if (guard.block) {
    throw new ConvexError({ code: "REJECTED", message: "Submission rejected" });
  }
  ```
- Add `startedAt: v.optional(v.number())` to `submit`'s `args` (envelope already has `captchaToken`/`honeypot`; `startedAt` is the new time-trap stamp).
- Add `import { internal } from "../../_generated/api";` to the mutations file.
- Keep error message low-detail ("Submission rejected") so bots can't probe which stage caught them (PRD §13.5). Storing `guard.score` as `spamScore` / `status:"spam"` is the Submission System's job — **do not** add a `spamScore` column or persist a spam row here (out of scope; the guard rejects before any write). Leave a short comment marking the verdict→storage handoff for that system.

### Phase 6 — Sweep cron + admin settings UI

**7. Register the sweep cron (hand-add).**
File: `packages/backend/convex/crons.ts`
- Add a `// ─── Forms Spam Security ───` block: `crons.interval("forms-sweep-attempts", { minutes: 10 }, internal.extensions.forms.spam.sweepAttempts, {});` (mirror existing `crons.interval` usage).

**8. Flesh out the settings page.**
File: `apps/web/src/routes/_authenticated/_admin/forms/settings.tsx` (already has `PluginGuard` + `useCan` guard + header shell)
- `useQuery(api.extensions.forms.queries... )` → switch the import to call `api.extensions.forms.spam.getSecuritySettings` via `useQuery` from `convex-helpers/react/cache` (the index route's pattern, `routes/.../forms/index.tsx:2`). `useMutation(api.extensions.forms.spam.updateSecuritySettings)` from `convex/react`.
- Replace the "coming soon" placeholder `<section>` with three cards using existing UI primitives (`components/ui/{card,input,select,checkbox,button,label,field}.tsx` — **no Switch component exists; use `checkbox` for toggles**, no `@radix-ui` imports):
  - **CAPTCHA:** provider `select` (turnstile/hcaptcha/recaptcha/none), public `captchaSiteKey` `input`, `recaptchaMinScore` input (shown only for recaptcha), and a read-only **secret presence** row per provider (green check / "Not set in ENV") from `secretPresence`. Caption: secrets are ENV-only via `npx convex env set`.
  - **Honeypot & time-trap:** `honeypotEnabled` checkbox, `honeypotFieldName` input, `minFillMs` / `maxFormAgeMs` number inputs.
  - **Rate limiting:** `rateLimitEnabled` checkbox, `windowMs`, `perIpPerFormLimit`, `perFormLimit` number inputs.
  - Plus `failClosed` + `skipForLoggedIn` checkboxes. Save button calls the mutation with only changed fields; toast via `sonner`.
- Keep full-page layout (no modal editors — repo rule). The existing insufficient-permissions branch stays.

### Phase 7 — ENV documentation

**9. Document the three ENV vars.**
- No code. In the PR/handoff note, list: `npx convex env set FORMS_TURNSTILE_SECRET_KEY ...` (and `_HCAPTCHA_`, `_RECAPTCHA_`). `verifyCaptcha` picks the one matching `captchaProvider`; absence → misconfig → `failClosed` policy. The convex-deployment agent sets them on the deployment.

---

## Verify checklist

- [ ] `bunx convex codegen` succeeds; `internal.extensions.forms.spam.{guardSubmission,verifyCaptcha,sweepAttempts}` and `api.extensions.forms.spam.{getSecuritySettings,updateSecuritySettings}` all resolve. *(One foreground command at a time — never background bunx/npx.)*
- [ ] Typecheck passes (`bun run typecheck` or the repo's check). TS2589 Convex-union noise → scoped `@ts-expect-error`, not a "bug". No `--typecheck=disable`.
- [ ] **Schema is additive:** the original 5 `form_security_settings` fields and the original 4 `form_submission_attempts` fields are unchanged; new fields are all `v.optional`. No edit to root `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts`.
- [ ] `submit` calls `guardSubmission` **first** (before field validation / any insert); `if (guard.block) throw`. No `form_submissions` row is written on block.
- [ ] `captcha` + `honeypot` are in `SUPPORTED_FIELD_TYPES` **and** `LAYOUT_FIELD_TYPES`; both `submit` skip-sites ignore them (no `fieldValues` written for them).
- [ ] `getSecuritySettings` / `updateSecuritySettings` both start with `requireCan(ctx, "form.manage_security")`. `updateSecuritySettings` rejects any `*secret*` arg and validates thresholds. No query ever returns a secret; only `secretPresence` booleans.
- [ ] `verifyCaptcha` is an `internalAction`, reads the ENV secret per provider, has the 5s `AbortSignal.timeout`, normalizes v3 score, and never logs/returns the secret. `unreachable` + `failClosed` → block.
- [ ] `guardSubmission` emits `form.spam_blocked` via `emitEvent` (payload `{ formId, reason, ip? }`, `ip` omitted when `"unknown"`) on every block, before returning; `FORM_EVENTS.SPAM_BLOCKED` exists in `events/constants.ts`.
- [ ] Rate limiter records every attempt (incl. blocked) in `form_submission_attempts`; `sweepAttempts` cron registered in `crons.ts` and deletes by `by_windowStart` past `attemptRetentionMs`.
- [ ] **Unseeded behavior:** with zero `form_security_settings` rows, `submit` still works and honeypot+rate-limit are active (defaults applied); CAPTCHA stays off until a provider+key is configured.
- [ ] `/admin/forms/settings` renders the three config cards + secret-presence indicators, gated by `form.manage_security`, no `@radix-ui` imports, no hardcoded color literals, no modal editor. Verify in the running Electron/SPA app (Playwright/DevTools per the hardening playbook) before claiming done.
- [ ] Manual guard probes pass: honeypot filled → blocked; `startedAt = now` (instant) → `too_fast`; >5 submits/min from one bucket → `rate_ip`; CAPTCHA enabled with no token → `captcha_missing`.

## Out of scope (do not build here)

`spamScore`/`status:"spam"` persistence + the `if(guard.block)` storage of score (Submission System) · rendering the CAPTCHA widget / honeypot input / `startedAt` stamp (Renderer System) · the spam-entry inbox (Entry Management) · the notification handler/aggregation for `form.spam_blocked` (Notification System) · content/ML spam scoring · the Role/Capability registry entry for `form.manage_security`.
