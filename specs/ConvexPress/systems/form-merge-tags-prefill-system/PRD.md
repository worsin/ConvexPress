# PRD: Form Merge Tags & Prefill System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The templating + pre-fill layer of the Forms tree; consumes the Form Renderer System (for pre-fill) and is consumed by the Notification + Confirmation systems (for token resolution).
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** Two small, **pure** library helpers — a merge-tag resolver and a prefill parser — shared across the Forms tree. Neither owns a route, a table, a mutation, an event, or a notification. The **merge-tag resolver** is consumed at runtime by the Notification + Confirmation systems to template strings against a submission. The **prefill parser** is consumed by the public Renderer to turn URL/query params + dynamic sources into the `initialValues` seed map it already accepts (Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) §2.3). This system is shared infrastructure, like the Form Field Engine — it is *reused*, not user-facing.

**Recommended home:** the prefill parser is **SSR-safe** and lives Website-side alongside the renderer host (`ConvexPress-Website/apps/web/src/extensions/forms/prefill/`); the merge-tag resolver is **server-side** and lives in the Forms backend module (`packages/backend/convex/extensions/forms/mergeTags.ts`) so it runs inside the Submission System's post-submit pipeline where Notification + Confirmation execute. Both are framework-agnostic functions (no React, no Convex `ctx` at module load) so the same code is testable in isolation and importable by either host.

**Consumes these ConvexPress systems:**

- **Form Renderer System** (`@convexpress/forms` renderer host) — the *only* hard dependency. The prefill parser produces the `initialValues: Record<fieldKey, unknown>` map the renderer already accepts (`FormRendererProps.initialValues`) and seeds its value map from. The renderer does not source these values; this system sources them and hands them in. See the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) §2.3, §8.2.
- **Form Field Engine** (`@convexpress/field-engine`) — read-only. The prefill parser reads each field's `key`, `type`, `defaultValue`, and `settings` (engine PRD §5) to know which params map to which field, how to coerce the param string into the field's value shape, and which fields are eligible for population at all. It reuses the engine's `parseFieldValue`/`encodeFieldValue` for type coercion rather than re-implementing it.
- **Form Submission System** — read-only consumer relationship. The merge-tag resolver runs *inside* the Submission System's post-submit pipeline (the same place its `form.submitted` event fires), templating notification + confirmation strings against the just-stored submission. This system supplies the function; the Submission System owns the call site. See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).

**Reference bar (prefill):** the **EZ Entity Setup** deep-link order form — `?name=&type=&state=&pkg=&addons=&step=payment&aiSession=…` — implemented in `EZ-Entity-Setup/ez-website/apps/web/src/lib/order-form/url-params.ts` (`parseURLParams` → `urlParamsToFormState` → `getInitialStep`) and consumed by `…/hooks/useOrderForm.ts`. That system is the parity target for: allowlisted param → field mapping, **state-name normalization** (`normalizeStateName`: exact → prefix/abbreviation fallback against a known list), **slug → canonical value** coercion (`sanitizeEnum` against allowed enums), **input sanitization** (`sanitizeInput`: strip HTML/JS, allowlist characters, length-cap), **jump-to-step** deep links (`getInitialStep`: an explicit `step=` against an allowlist, else a smart default derived from which fields are already filled), and the **saved-draft-vs-prefill precedence** (URL seeds first; a recovered partial then overrides — §6.4, §9).

**WooCommerce / WordPress analog:** Gravity Forms' **merge tags** (`{Field Label:2}`, `{all_fields}`, `{user:user_email}`, `{embed_url}`, `{date_mdy}`) resolved server-side into notifications + confirmations, plus its **dynamic population** feature (a field's "Allow field to be populated dynamically" toggle + a `parameter name`, read from the query string / `gform_field_value_<param>` filter). This system is the ConvexPress equivalent of both halves.

---

## 1. Overview

### 1.1 Purpose

Provide two pure capabilities for the Forms tree:

1. **Merge tags** — a safe, **allowlisted** token system (`{field_key}`, `{all_fields}`, `{user:email}`, `{embed_url}`, `{date}`, …) resolved at runtime against a typed context object `{ submission, form, user, request }`. The single entry point `resolveMergeTags(template, ctx)` turns an admin-authored template string (a notification body, an email subject, a confirmation message, a redirect URL) into a concrete string by substituting only known tokens — never executing arbitrary expressions, never resolving an unknown or non-allowlisted token to anything but empty.

2. **Prefill & dynamic population** — a parser that turns inbound URL/query params (and other dynamic sources) into the renderer's `initialValues` map, with **normalization** (state names, slugs → canonical values), **sanitization**, per-field opt-in (`allowDynamicPopulation` + `paramName`), and a **jump-to-step** deep link that drops a respondent at a named step (or a smart-default step inferred from which fields are already filled), mirroring EZ Entity Setup.

The two halves are grouped because they are the same concern viewed from two directions: tokens template *outbound* strings from a finished submission; prefill seeds *inbound* values into a fresh form. Both are pure, allowlist-governed string/value transforms with no schema of their own.

### 1.2 Scope

**In scope:**
- `resolveMergeTags(template, ctx)` — a pure resolver over a **registry of allowlisted tokens**, each token a `{ pattern, resolve(ctx) }` entry. Handles `{field_key}`, `{all_fields}`, namespaced tokens (`{user:…}`, `{form:…}`, `{request:…}`, `{date:…}`), and unknown-token → empty-string fallback.
- The **token catalog** (§4) + the registration seam so other Forms systems (Calculation & Pricing, Commerce Action) can contribute tokens without forking the registry.
- **Output-context awareness** — the resolver takes an output sink (`email-html` | `email-text` | `url` | `plain`) and escapes/encodes per sink (HTML-escape for email HTML, `encodeURIComponent` for URL contexts) so a value containing `&` or a quote cannot break the rendered output or open an injection.
- `parsePrefill(searchParams, formDef, sources?)` — a pure parser producing `{ initialValues, initialStep }` from query params + optional dynamic sources, honoring each field's `allowDynamicPopulation` + `paramName`.
- **Normalization + coercion**: state-name normalization, slug → canonical enum coercion, and per-type value coercion via the engine's `parseFieldValue`.
- **Sanitization**: strip HTML/JS, allowlist safe characters, length-cap — the EZ `sanitizeInput`/`sanitizeEnum` contract.
- **Jump-to-step** resolution: an explicit allowlisted `step=` param → that step; otherwise a smart default derived from which fields the prefill already filled (the EZ `getInitialStep` contract). Exposed as `initialStep` for the Multi-Step System to consume.
- **Precedence policy** between prefill seed values and a recovered saved draft (§6.4, §9).

**Out of scope:**
- The renderer host, its value-map state, and how it *applies* `initialValues` — owned by the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`). This system produces the map; the renderer consumes it.
- Step **navigation**, step state, and save-and-resume draft storage — owned by the Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`). This system only *computes* an `initialStep`; it does not own step transitions or the draft table.
- The notification + confirmation **delivery** (who sends the email, what channel, the redirect mechanism) — owned by the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`) and the Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`). This system only resolves the template strings they hand it.
- The field catalog, value (de)serialization, and the `defaultValue` semantics — owned by the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`). This system reads field definitions; it does not define field types.
- The submission write, the `form.submitted` event, and server re-validation — owned by the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`). This system runs *within* that pipeline; it does not own it.
- Authoring the `allowDynamicPopulation` / `paramName` toggles in the builder UI — owned by the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`). This system *reads* those settings; the builder writes them.

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Renderer System | The prefill parser exists to feed the renderer's `initialValues` seam (`FormRendererProps.initialValues`); the renderer is where prefill becomes visible. |
| Form Field Engine (`@convexpress/field-engine`) | Source of field `key`/`type`/`defaultValue`/`settings` and the `parseFieldValue`/`encodeFieldValue` coercion the parser reuses; defines which fields can be populated. |
| Form Submission System | Owns the post-submit pipeline that calls `resolveMergeTags` (same call site as the `form.submitted` event); supplies the `submission` half of the merge-tag context. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Notification System | Calls `resolveMergeTags(template, ctx)` to template the email/site-notification subject + body against the submission before delivery. |
| Form Confirmation System | Calls `resolveMergeTags` to template the inline confirmation message **and** the redirect URL (URL output sink, `encodeURIComponent`) after a successful submit. |
| Form Renderer System | Consumes `parsePrefill(...).initialValues` as its `initialValues` prop; consumes nothing else from this system. |
| Form Multi-Step & Save-Continue System | Consumes `parsePrefill(...).initialStep` as the deep-link starting step; owns the actual navigation + draft precedence enforcement at runtime. |
| Form Calculation & Pricing System; Form Commerce Action | May register additional tokens (e.g. `{total}`, `{order_id}`) via the token registration seam (§4.3). |

### 2.3 Integration shape

```typescript
// ── Merge tags ──────────────────────────────────────────────────────────────
// The context the resolver reads. Assembled by the Submission System at the
// call site (it owns `submission`; it projects the rest). All read-only.
interface MergeTagContext {
  submission: {
    id: string;
    values: Record<string, unknown>;     // fieldKey -> stored value (engine shape)
    createdAt: number;
  };
  form: {
    id: string;
    slug: string;
    title: string;
    fields: PublicFieldDefinition[];      // engine FieldDefinition projection (labels, types)
  };
  user: {                                 // the *resolved* actor, if any (see §7 business rules)
    id?: string;
    email?: string;
    displayName?: string;
    role?: "Administrator" | "Editor" | "Author" | "Contributor" | "Subscriber";
  } | null;
  request: {
    embedUrl?: string;                    // the page the form was submitted from
    ip?: string;                          // resolver MUST NOT expose this to public output (§7)
    userAgent?: string;
    referer?: string;
  };
}

type MergeOutputSink = "plain" | "email-html" | "email-text" | "url";

declare function resolveMergeTags(
  template: string,
  ctx: MergeTagContext,
  opts?: { sink?: MergeOutputSink }, // default "plain"
): string;

// ── Prefill ─────────────────────────────────────────────────────────────────
interface PrefillResult {
  initialValues: Record<string, unknown>; // fieldKey -> coerced value, for the renderer
  initialStep?: string;                   // a step key, for the Multi-Step System (deep link)
  applied: string[];                      // fieldKeys that were populated (for debugging/telemetry)
  rejected: string[];                     // paramNames that were ignored (unknown/blocked/invalid)
}

// A dynamic source other than the URL (e.g. signed-in user fields). Each source
// returns a value for a given field; the parser layers them under URL params.
interface DynamicSource {
  id: string;
  resolve(field: PublicFieldDefinition): unknown | undefined;
}

declare function parsePrefill(
  searchParams: Record<string, string>,
  formDef: PublicFormDefinition,          // renderer's read-only projection (engine fields + settings)
  sources?: DynamicSource[],
): PrefillResult;
```

---

## 3. Architecture

Two independent pure modules, deliberately not coupled to each other.

```
@convexpress/forms (merge tags — server-side)        prefill (SSR-safe — Website host)
├── mergeTags.ts                                      ├── parsePrefill.ts
│   ├── TOKEN_REGISTRY  (allowlist)                   │   ├── readParams()         query/dynamic -> raw
│   ├── registerToken(def)                            │   ├── mapToFields()        paramName -> fieldKey
│   ├── resolveMergeTags(template, ctx, opts)         │   ├── normalize/coerce     state/slug/type
│   └── escapeForSink(value, sink)                    │   ├── sanitize()           strip HTML/JS, allow-list
└── (consumed by Notification + Confirmation)         │   └── resolveInitialStep() deep link / smart default
                                                      └── (feeds Renderer.initialValues + MultiStep.initialStep)
```

### 3.1 Merge-tag resolver

A merge tag is `{` + a token expression + `}`. The resolver is a single pass over the template that, for each `{…}` occurrence, looks the expression up in an **allowlisted token registry** and replaces it with `escapeForSink(token.resolve(ctx), sink)`. **An expression that is not in the registry resolves to the empty string** — the resolver never evaluates the contents, never reflects an unknown token back into output, and never throws.

- **Token registry (allowlist).** A map of token definitions. Two kinds:
  - **Static tokens** — fixed patterns: `{all_fields}`, `{embed_url}`, `{date}`, `{form:title}`, `{user:email}`, etc. (see §4).
  - **Dynamic field tokens** — `{field:<key>}` (and the shorthand `{<key>}` where `<key>` is a real field key on `ctx.form`). Resolved by looking up `ctx.submission.values[key]` and rendering it through the field's display formatter (engine `parseFieldValue` + a per-type human-readable render). A `{<key>}` that does not match any real field key on the form is **not** a field token and falls through to "unknown → empty".
- **Context object** `{ submission, form, user, request }` — the **only** data the resolver may read. It receives no `ctx: QueryCtx`, no database handle, no environment. Everything resolvable is pre-projected into the context by the call site (the Submission System), which is what keeps the resolver pure and the allowlist enforceable.
- **Output sink + escaping.** The resolver escapes every substituted value for the target sink: HTML-escape for `email-html`, `encodeURIComponent` for `url`, raw for `plain`/`email-text`. This is the injection boundary — a submitted value containing `<script>` or `"` cannot break the email HTML or the redirect URL.
- **`{all_fields}`** expands to a formatted label→value listing of every **non-empty, non-sensitive, non-layout** field on the submission, formatted for the sink (an HTML table for `email-html`, a `Label: value` list for text). Layout fields (message/accordion/tab) and fields with no stored value are skipped, mirroring the engine serializer (engine PRD §9).

### 3.2 Prefill parser

A pure function `parsePrefill(searchParams, formDef, sources?)` that mirrors the EZ Entity Setup pipeline (`parseURLParams` → `urlParamsToFormState` → `getInitialStep`) generalized over an arbitrary form definition:

1. **Read params.** Take the raw `searchParams` record (the renderer passes TanStack Router's `useSearch()` output, exactly as `useOrderForm(searchParams)` does) plus any `sources` (e.g. a signed-in-user source).
2. **Map param → field.** For each field where `settings.allowDynamicPopulation === true`, look up its `settings.paramName` (default: the field `key`) in the params. Only **opted-in** fields are eligible — a param with no matching opted-in field is rejected (recorded in `rejected`, never applied). Hidden / admin-only fields are never eligible regardless of settings (§7).
3. **Sanitize.** Run every inbound string through the EZ `sanitizeInput` contract: URL-decode, strip HTML tags + `javascript:` + inline-event vectors + null bytes, allowlist safe characters, length-cap. Reject on failure (drop the param, do not partially apply).
4. **Normalize + coerce.** Apply field-type-aware normalization: enum-like fields (`select`/`radio`/`button_group`) coerce the param via a slug-tolerant match against the field's allowed choices (the EZ `sanitizeEnum` contract); a registered **state** normalizer maps `"tx"` / `"texas"` / `"Texas"` → the canonical `"Texas"` (the EZ `normalizeStateName` contract: exact → prefix/abbreviation fallback against a known list); everything else coerces through the engine's `parseFieldValue(type, raw)`. A value that does not normalize to a legal field value is rejected, not coerced to garbage.
5. **Layer dynamic sources.** Values from `sources` (e.g. user email) fill fields that the URL did not, **without** overriding an explicit URL param for the same field (URL wins over a passive source; a recovered draft later wins over both — §6.4).
6. **Resolve initial step.** Compute `initialStep` (the EZ `getInitialStep` contract): if `step=` is present and is in the form's allowlist of step keys, use it; otherwise infer a smart default from which fields the prefill filled (e.g. "all required identity fields filled → land on the review step"). Single-page forms ignore `initialStep`.

The parser returns a plain object; it mutates nothing and touches no `window` at module load, so it is safe in the Website's TanStack Start SSR loader as well as in the browser.

---

## 4. Token Catalog

The allowlist of tokens `resolveMergeTags` recognizes. Anything not in this table (or registered via §4.3) resolves to the empty string.

| Token | Resolves to | Notes |
|---|---|---|
| `{field:<key>}` | The submission's value for field `<key>`, display-formatted | Canonical form. `<key>` must be a real field on `ctx.form`. |
| `{<key>}` | Shorthand for `{field:<key>}` | Only if `<key>` matches a real field key; otherwise unknown → empty. |
| `{all_fields}` | A formatted label→value listing of all non-empty, non-sensitive, non-layout fields | HTML table for `email-html`; `Label: value` list for text. Skips layout + empty + password fields. |
| `{form:title}` | `ctx.form.title` | |
| `{form:id}` | `ctx.form.id` | Internal id; safe to expose in admin-bound notifications. |
| `{form:slug}` | `ctx.form.slug` | |
| `{entry:id}` | `ctx.submission.id` | The submission/entry id. |
| `{entry:date}` / `{date}` | The submission timestamp, formatted | `{date}` defaults to the submission date; `{date:format}` (e.g. `{date:mdy}`, `{date:iso}`) selects a format. |
| `{date:now}` | The resolution-time timestamp | Distinct from the submission date. |
| `{user:email}` | `ctx.user.email` | Empty if no resolved actor (guest submission). Never falls back to a submitted email field — see `{field:email}` for that. |
| `{user:display_name}` | `ctx.user.displayName` | Empty for guests. |
| `{user:id}` | `ctx.user.id` | Empty for guests; admin-context only. |
| `{user:role}` | `ctx.user.role` | WordPress-standard role of the resolved actor. |
| `{embed_url}` | `ctx.request.embedUrl` | The page the form was submitted from. |
| `{referer}` | `ctx.request.referer` | |
| `{site:name}` / `{site:url}` | Site identity (projected into `ctx` by the call site) | Convenience; sourced from site settings, not a live DB read in the resolver. |

### 4.1 Explicitly NOT in the allowlist (and why)

| Would-be token | Why it is blocked |
|---|---|
| `{request:ip}` / `{user_ip}` | PII; never resolved for public/respondent-visible output. Admin-only audit views read the stored submission directly, not via this resolver. |
| `{user:password}` / any secret/credential token | Never resolvable by design — not in the registry, no `resolve` exists. |
| Field tokens for `password`-type fields | A `password` field's value is never rendered by `{field:<key>}` or `{all_fields}` (treated like a layout field — skipped). |
| `{eval:…}` / `{php:…}` / any expression token | The resolver does not execute expressions. There is no code path that evaluates token contents; the registry maps fixed patterns to fixed resolvers only. |

### 4.2 Date format sub-tokens

`{date}` / `{entry:date}` accept an optional format suffix: `{date:mdy}` (05/30/2026), `{date:dmy}`, `{date:iso}` (2026-05-30), `{date:long}` (May 30, 2026). An unrecognized format suffix falls back to the default short format (it does **not** fall through to empty — a known token with a bad arg degrades to the token's default, only entirely unknown tokens become empty).

### 4.3 Token registration seam

```typescript
// Other Forms systems contribute tokens additively (mirrors the engine's
// registerFieldType seam). The registry is the single allowlist; there is no
// way to resolve a token that was not registered here.
export function registerToken(def: {
  pattern: string | RegExp;          // e.g. "total" or /^total(:(gross|net))?$/
  description: string;               // for the builder's token-picker UI
  sensitive?: boolean;               // if true, omitted from public sinks (§7)
  resolve(ctx: MergeTagContext, arg?: string): string | number | null | undefined;
}): void;
```

The Calculation & Pricing System registers `{total}`; the Commerce Action registers `{order_id}` / `{payment_status}`. Each is still subject to the sink-escaping and the sensitive-field rules — registration adds to the allowlist, it does not bypass the safety boundary.

---

## 5. Prefill & Dynamic Population

### 5.1 Per-field settings (read, not owned)

Prefill is **opt-in per field**, stored in the field's engine `settings` JSON (engine PRD §5) and authored in the builder (Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)). This system only reads them:

| Setting (in `field.settings`) | Type | Meaning |
|---|---|---|
| `allowDynamicPopulation` | `boolean` (default `false`) | Master gate. A field is eligible for prefill **only** when this is `true`. Mirrors Gravity Forms' "Allow field to be populated dynamically". |
| `paramName` | `string` (default: the field `key`) | The query-param / dynamic-source key that maps to this field. |
| `defaultSource` | `"url" \| "user" \| "none"` (default `"url"`) | Which dynamic source may populate this field. `"user"` lets a signed-in-user source fill it (e.g. email); `"url"` restricts it to query params; `"none"` makes the setting authorable but inert. |

A field with `allowDynamicPopulation !== true` is **never** populated by this system, even if a matching param is present. There is no global "prefill everything" mode — population is always allowlisted at the field level.

### 5.2 URL parameter mapping

For `?paramName=value`, the parser finds the (unique) opted-in field whose `settings.paramName` equals `paramName` (case-insensitive, after trimming), then sanitizes + normalizes the value into that field's value shape (§3.2 steps 3–4). Multiple params map to multiple fields in one pass. A param matching no opted-in field is recorded in `rejected` and dropped. This is the generalized form of EZ's fixed `?name=&type=&state=&pkg=` mapping — there the param keys are hard-coded; here they are declared per field via `paramName`.

### 5.3 State / slug normalization

The parser ships a small registry of **value normalizers** keyed by a field's semantic hint (or its choice set):

- **State normalizer** — the EZ `normalizeStateName` contract: try an exact case-insensitive match against the known US-state list; else a prefix / two-letter-abbreviation fallback (`"tx"` → `"Texas"`, `"calif"` → `"California"`); else reject (do not guess). Applied to fields hinted as a state field or whose choices are the US-state set.
- **Slug / enum normalizer** — the EZ `sanitizeEnum` contract: lowercase + trim the param, then match it against the field's allowed choice values/slugs; return the canonical choice or reject. This is how `?pkg=premium` becomes the canonical `premium` choice and `?type=LLC` becomes `llc`.
- **Slug → id mapping** — for relational/reference fields whose param is a human slug, map the slug to the canonical stored id via the field's choice set (or a host-injected resolver). A slug with no match is rejected, never stored as a dangling id.

Normalizers are registered (extensible) so a site with custom enum fields can add its own without forking the parser.

### 5.4 Jump-to-step (deep link)

`parsePrefill` returns `initialStep` using the EZ `getInitialStep` contract:

1. If `step=<key>` is present **and** `<key>` is in the form's allowlist of step keys (from the Multi-Step System's definition, e.g. derived from `page_break` fields), return `<key>`. This is the `step=payment` deep link.
2. Otherwise infer a smart default from coverage: walk the step order and return the furthest step whose prerequisite fields are already satisfied by the prefilled `initialValues` (EZ: filled name+state+package → land on `add-ons`; filled identity → land on `review`). The exact predicate is supplied by the Multi-Step System; this system provides the mechanism + the allowlist check.
3. Single-page forms (no steps) return `initialStep: undefined`; the renderer ignores it.

The Multi-Step System consumes `initialStep` to set its starting step and owns the actual navigation; this system never transitions steps itself. The `step=` value is **allowlist-checked** — an unknown or out-of-range step value is ignored (falls to the smart default), never honored blindly.

---

## 6. Data Model

**No new tables.** This system owns **zero** schema.

- **Merge tags** are resolved entirely at runtime from the `MergeTagContext` the call site assembles; no token state is persisted. The `submission`, `form`, and `user` data the resolver reads already live in tables owned by the Submission System + Field Engine.
- **Prefill config** lives in the **field definition's `settings` JSON** (engine PRD §5): `allowDynamicPopulation`, `paramName`, `defaultSource` (§5.1). These are authored by the builder and read here; this system adds no columns and no tables.
- **Prefilled values** are never written by this system. `parsePrefill` returns an in-memory `initialValues` object that the renderer holds in component state until submit, at which point the Submission System owns the `fieldValues` write (engine PRD §5; Renderer PRD §3).

### 6.1 Settings shape (additive to the engine's existing `settings` JSON)

```typescript
// Lives inside fieldDefinitions.settings (engine §5) — NOT a new table/column.
interface PrefillFieldSettings {
  allowDynamicPopulation?: boolean;             // default false
  paramName?: string;                           // default: field.key
  defaultSource?: "url" | "user" | "none";      // default "url"
}
```

### 6.2 Saved-draft vs prefill precedence

The precedence **policy** is owned here; its **enforcement at runtime** is the Multi-Step / Save-Continue System's (it owns the draft table + recovery effect, exactly as EZ's `useOrderForm` does). The agreed order, lowest → highest priority:

1. **Field `defaultValue`** (engine) — the baseline.
2. **Dynamic source** (e.g. signed-in user email) — fills gaps the URL did not.
3. **URL query param** — an explicit link beats a passive source.
4. **Recovered saved draft** — a returning respondent's in-progress answers win over a stale link (EZ recovers the partial *after* URL init and overrides it; see §9).

This ordering is the single source of truth that the renderer + Multi-Step System implement.

---

## 7. Routes / Actions / Events / Notifications

**None owned.** This system is two pure helper modules; it owns no route, no capability/action, no event, and no notification. Its consumers own those:

- **Routes** — the public form route + prefill ingestion point belong to the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) (`/forms/$slug`, which passes `useSearch()` into the parser).
- **Actions** — the submit mutation belongs to the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`); this system has no mutations.
- **Events** — `form.submitted` is emitted by the Submission System inside its mutation; the merge-tag resolver runs in the same pipeline but emits nothing.
- **Notifications** — the autoresponder + admin alert belong to the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`); this system only resolves the strings those notifications contain.

This section is intentionally empty to keep both helpers pure dependencies.

### 7.1 Security boundary (the reason the allowlist exists)

- **Allowlist-only resolution.** A token resolves **only** if it is in `TOKEN_REGISTRY` (or registered via §4.3). Unknown tokens → empty string. There is no reflection of unknown token text, no expression evaluation, no dynamic property access into arbitrary objects.
- **No arbitrary / PII tokens for public output.** Tokens marked `sensitive` (and the built-in `{request:ip}`, `{user:id}`, etc.) are omitted entirely when the resolver targets a public/respondent-facing sink. A confirmation message shown to a guest cannot leak the submitter's IP, another user's identity, or any credential.
- **Resolved actor only.** `{user:*}` resolves the *authenticated* actor projected into `ctx.user` — never a value scraped from a submitted field. A guest submission yields empty `{user:*}` (use `{field:email}` to echo a submitted email instead). This prevents a respondent from spoofing `{user:email}` by submitting a field named `email`.
- **Sink escaping.** Every substituted value is escaped for its sink (HTML-escape / `encodeURIComponent` / raw). This is enforced in `resolveMergeTags`, not left to callers, so a malicious submitted value cannot inject markup into an email or break a redirect URL.

---

## 8. API / Helpers

```typescript
// ── packages/backend/convex/extensions/forms/mergeTags.ts (server-side, pure) ──

/**
 * Resolve all allowlisted merge tags in `template` against `ctx`.
 * Unknown tokens -> "". Never throws. Every value escaped for `opts.sink`.
 */
export function resolveMergeTags(
  template: string,
  ctx: MergeTagContext,
  opts: { sink?: MergeOutputSink } = {},
): string {
  const sink = opts.sink ?? "plain";
  return template.replace(/\{([^{}]+)\}/g, (_match, expr: string) => {
    const token = lookupToken(expr.trim(), ctx); // registry first, then field-key shorthand
    if (!token) return ""; // unknown token -> empty (never reflect, never throw)
    if (token.sensitive && isPublicSink(sink)) return ""; // PII/secret guard
    const raw = token.resolve(ctx, token.arg);
    return escapeForSink(raw ?? "", sink); // injection boundary
  });
}

export function registerToken(def: TokenDefinition): void; // §4.3 allowlist seam

// ── ConvexPress-Website/apps/web/src/extensions/forms/prefill/parsePrefill.ts ──
// (SSR-safe, pure — no window at module load, no Convex ctx)

/**
 * Turn URL/query params (+ optional dynamic sources) into the renderer's
 * `initialValues` and a deep-link `initialStep`. Honors per-field
 * allowDynamicPopulation + paramName; sanitizes + normalizes; never throws.
 */
export function parsePrefill(
  searchParams: Record<string, string>,
  formDef: PublicFormDefinition,
  sources: DynamicSource[] = [],
): PrefillResult {
  const initialValues: Record<string, unknown> = {};
  const applied: string[] = [];
  const rejected: string[] = [];

  const eligible = formDef.fields.filter(
    (f) => f.settings?.allowDynamicPopulation === true,
  );

  for (const field of eligible) {
    const paramName = (field.settings?.paramName ?? field.key).toLowerCase();
    const raw = pickParam(searchParams, paramName);              // case-insensitive
    const fromSource = raw === undefined ? resolveFromSources(field, sources) : undefined;
    const input = raw ?? fromSource;
    if (input === undefined) continue;

    const clean = sanitizeInput(String(input));                  // EZ sanitizeInput contract
    const value = normalizeForField(field, clean);               // state/slug/enum + parseFieldValue
    if (value === REJECT) { rejected.push(paramName); continue; } // bad value -> drop, don't coerce to junk

    initialValues[field.key] = value;
    applied.push(field.key);
  }

  const initialStep = resolveInitialStep(searchParams, formDef, initialValues); // EZ getInitialStep
  return { initialValues, initialStep, applied, rejected };
}
```

- **`sanitizeInput`** is the EZ contract: URL-decode (ignore the param on bad encoding), strip `<…>` tags + `javascript:` + `on\w+=` + `&lt;`/`&gt;`/`&#` + null bytes, allowlist safe characters per field semantics, length-cap (200 default). Pure, reusable, unit-tested in isolation.
- **`normalizeForField`** dispatches to a registered normalizer (state, enum/slug, slug→id) by field hint/choices, falling back to the engine's `parseFieldValue(field.type, clean)`. Returns a sentinel `REJECT` for values that do not normalize to a legal field value.
- **`resolveInitialStep`** implements §5.4: explicit allowlisted `step=` → that step; else the smart-default predicate (supplied by the Multi-Step System); else `undefined`.

---

## 9. Business Rules & Constraints

- **Allowlist tokens only — never resolve arbitrary or PII tokens for public output.** The resolver maps a fixed registry of patterns to fixed resolvers. Unknown tokens become the empty string; sensitive/PII tokens (IP, secrets, other users' identity) are omitted from public/respondent-facing sinks. There is no expression evaluation and no path to resolve a token that was not explicitly registered.
- **Prefill cannot set hidden or admin-only fields.** Only fields with `allowDynamicPopulation === true` are eligible, and a field that is hidden (by conditional logic or by an admin-only/visibility flag) is **never** populated from an inbound param, regardless of `paramName`. A URL param cannot force a value into a field the respondent is not meant to control. The server is still authoritative: even if a crafted client seeds a blocked field, the Submission System re-validates and rejects it (Renderer PRD §9; Submission PRD).
- **Sanitize everything inbound.** Every prefill value is sanitized (strip HTML/JS, allowlist characters, length-cap) and normalized to a legal field value before it enters `initialValues`. A value that does not normalize is dropped (recorded in `rejected`), never coerced into a malformed value. This is XSS/parameter-tampering defense at the seam, matching the EZ `sanitizeInput`/`sanitizeEnum` posture.
- **Output is escaped per sink, by the resolver.** HTML-escape for email HTML, `encodeURIComponent` for URL/redirect contexts. Callers cannot opt out; the escaping is the injection boundary and lives inside `resolveMergeTags`.
- **Resolver is pure + side-effect-free.** `resolveMergeTags` reads only its `MergeTagContext`; it performs no DB read, no network, no `Date.now()` except via the explicit `{date:now}` token's resolver. This makes it deterministic and unit-testable, and keeps the allowlist the sole authority on what is exposable.
- **Parser is SSR-safe + pure.** `parsePrefill` touches no `window` at module load and returns a fresh object; it runs in the Website's SSR loader and the browser identically. It owns no state — the renderer holds `initialValues`, the Multi-Step System holds step state.
- **Precedence is fixed (§6.2):** `defaultValue` < dynamic source < URL param < recovered saved draft. A returning respondent's in-progress draft beats a stale prefill link; an explicit URL param beats a passive source. Consumers implement this ordering; this system defines it.
- **Population is opt-in, never global.** There is no "populate all fields from the URL" switch. Every populated field is allowlisted via `allowDynamicPopulation`, exactly as Gravity Forms requires the per-field toggle.

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| Unknown / unregistered token (`{foo}`, `{field:nope}`) | Resolves to the empty string. Never reflected back, never throws. |
| Malformed token (`{user:}`, unbalanced `{`/`}`) | Unbalanced braces are left as literal text (the `{…}` regex only matches a closed pair); an empty/invalid namespace arg resolves to empty. |
| Known token, bad argument (`{date:zzz}`) | Degrades to the token's default (short date), not to empty — only entirely-unknown tokens become empty. |
| Submitted value contains HTML / quotes | Escaped for the sink (HTML-escape / `encodeURIComponent`) before substitution; cannot inject into email or break a redirect URL. |
| `{user:*}` on a guest submission | Empty (no resolved actor). Use `{field:email}` to echo a submitted email; the two are intentionally distinct (§7.1). |
| `password`-type field referenced by `{field:key}` or via `{all_fields}` | Skipped (never rendered), like a layout field. |
| Malformed prefill param (bad URL encoding, oversized, illegal characters) | Dropped during sanitize; recorded in `rejected`; the rest of the params still apply (partial success, no throw) — matches EZ's per-param try/catch. |
| Param maps to a field with `allowDynamicPopulation !== true` | Rejected (not eligible); recorded in `rejected`. |
| Param maps to a hidden / admin-only field | Rejected; never populated. Server re-validation also rejects if a crafted client bypasses the parser. |
| `state=tx` / `type=LLC` / `pkg=Premium` | Normalized to canonical `Texas` / `llc` / `premium` (state + enum/slug normalizers). A value with no match is rejected, not stored raw. |
| Slug param for a relational field with no matching id | Rejected (no dangling id written). |
| `step=payment` deep link | Honored only if `payment` is in the form's step allowlist; otherwise ignored → smart-default step. |
| `step=<garbage>` or a step out of range | Ignored; falls back to the smart-default step (coverage-derived). Never honored blindly. |
| Prefill link vs recovered saved draft for the same field | Saved draft wins (§6.2). URL seeds first; the recovery effect (Multi-Step System) overrides — exactly as EZ's `useOrderForm` recovers the partial after URL init. |
| Two params claim the same `paramName` | First-declared opted-in field wins; the duplicate is rejected. Builder should prevent duplicate `paramName`s (Open Question §11). |
| `{all_fields}` on a submission with only layout/empty fields | Renders an empty/placeholder block (no rows), never an error. |
| Prefill applied to a single-page form | `initialStep` is `undefined`; the renderer ignores it and seeds `initialValues` normally. |

---

## 11. Implementation Checklist

**Phase 1 — merge-tag resolver**
- [ ] Create `packages/backend/convex/extensions/forms/mergeTags.ts`: `MergeTagContext` type, `TOKEN_REGISTRY` (allowlist), `resolveMergeTags(template, ctx, opts)`.
- [ ] Implement the built-in token catalog (§4): `{field:<key>}` + `{<key>}` shorthand, `{all_fields}`, `{form:*}`, `{entry:*}`, `{date}`/`{date:*}`, `{user:*}`, `{embed_url}`, `{referer}`, `{site:*}`.
- [ ] Implement `escapeForSink` (plain / email-html / email-text / url) and wire it into every substitution.
- [ ] Enforce the sensitive/PII guard (omit `sensitive` + blocked tokens on public sinks) and the password-field skip.
- [ ] Add `registerToken` and unit-test the allowlist (unknown → empty, no expression eval, injection escaped).

**Phase 2 — prefill parser**
- [ ] Create `ConvexPress-Website/apps/web/src/extensions/forms/prefill/parsePrefill.ts` (SSR-safe, pure) returning `{ initialValues, initialStep, applied, rejected }`.
- [ ] Implement `sanitizeInput` + `sanitizeEnum` per the EZ contract; unit-test XSS vectors + length-cap.
- [ ] Implement `normalizeForField` with a normalizer registry: state normalizer, enum/slug normalizer, slug→id mapper; fall back to engine `parseFieldValue`; return `REJECT` for illegal values.
- [ ] Map opted-in fields by `paramName` (case-insensitive); layer `DynamicSource`s under URL params (URL wins).
- [ ] Implement `resolveInitialStep` (explicit allowlisted `step=` → smart-default coverage predicate → `undefined`).

**Phase 3 — integration**
- [ ] Renderer: pass `useSearch()` into `parsePrefill` and feed `initialValues` to `<FormRenderer initialValues=… />` (Renderer PRD §2.3, §8.2).
- [ ] Multi-Step: consume `initialStep`; implement the §6.2 precedence (recovered draft overrides URL prefill).
- [ ] Notification + Confirmation: call `resolveMergeTags(template, ctx, { sink })` at their delivery points (email-html / email-text / url sinks); Submission System assembles `ctx`.
- [ ] Add `allowDynamicPopulation` / `paramName` / `defaultSource` reads from `field.settings`; confirm the Builder authors them.

**Phase 4 — hardening**
- [ ] Golden-file tests for `{all_fields}` rendering across sinks; date-format matrix; guest-vs-actor `{user:*}`.
- [ ] Parameter-tampering tests: blocked/hidden field, duplicate `paramName`, slug-with-no-match, out-of-range `step`.
- [ ] Confirm server re-validation rejects a client that bypasses the parser to seed a blocked field (defense-in-depth with the Submission System).

---

## 12. Open Questions

- **Token syntax for nested/repeater field values:** how does `{field:<key>}` render a repeater/group value, and is there a `{field:<key>.<sub>:<row>}` form? Default: render compounds via a readable summary in `{all_fields}` and treat deep addressing as a later enhancement.
- **Token picker UX:** the builder should offer a token-picker populated from `TOKEN_REGISTRY` + the form's field keys. Confirm whether that lives in the Builder PRD or is a thin shared component exported here.
- **`defaultSource: "user"` source identity:** the signed-in-user `DynamicSource` reads Website auth (Clerk) — confirm the exact projected fields (email, name) and that they are safe to prefill without leaking across accounts on a shared link.
- **Duplicate `paramName` prevention:** enforce uniqueness at author time (Builder validation) vs. resolve deterministically at parse time (first-declared wins). Default: both — Builder warns, parser is deterministic.
- **Step allowlist source:** `initialStep` validation needs the form's canonical step-key list. Confirm the Multi-Step System exposes it (e.g. derived from `page_break` fields) for the parser to check against.
- **Locale-aware `{date}` + normalization:** should date formats and state/enum normalization be locale/region configurable per site, or fixed (US) initially? Default: US-fixed to match EZ, with the normalizer registry left open for per-site additions.

---

## 13. Cross-References

- Prefill consumer (canonical): Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)
- Token consumers (canonical): Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`), Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`)
- Step deep-link consumer (canonical): Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)
- Field settings + value coercion (canonical): Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Context source + post-submit call site: Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Settings authoring: Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)
- Reference bar (prefill parity): `EZ-Entity-Setup/ez-website/apps/web/src/lib/order-form/url-params.ts` (`parseURLParams` / `urlParamsToFormState` / `normalizeStateName` / `sanitizeInput` / `sanitizeEnum` / `getInitialStep`), `EZ-Entity-Setup/ez-website/apps/web/src/hooks/useOrderForm.ts` (URL init + saved-draft recovery precedence)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Merge Tags & Prefill System · **Plugin:** ConvexPress Forms (v2)
