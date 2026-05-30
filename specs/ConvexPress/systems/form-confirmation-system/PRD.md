# PRD: Form Confirmation System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The post-submit "what the respondent sees next" half of the Forms tree; consumes the Form Submission System and reuses the Form Merge Tags & Prefill System.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **post-submit response layer** of the Forms extension. A *confirmation* is what the respondent sees on the Website **immediately after a successful submit** — an inline thank-you **message**, a **redirect** to another URL, or a hand-off to a **Page** that renders a thank-you. It is the on-screen counterpart to the Form Notification System (which sends emails/site notices off the same submit event); confirmations are **synchronous and respondent-facing**, notifications are **asynchronous and operator/respondent-facing over email**. This system owns the confirmations config (admin) + the public resolution/render (Website); it owns **no submit path, no entry storage, no event**.

**Code lives at:**
- Backend: `packages/backend/convex/extensions/forms/confirmations.ts` (config CRUD + the public `resolveConfirmation` query), with the `form_confirmations` table defined in the extension's additive schema fragment `packages/backend/convex/extensions/forms/schema.ts` (merged by the v2 scanner — never hand-edited into root `schema.ts`).
- Admin route: `apps/web/src/routes/_authenticated/_admin/forms/$formId/confirmations/` (wraps `<PluginGuard pluginId="forms">`).
- Public render: `ConvexPress-Website/apps/web/src/extensions/forms/ConfirmationView.tsx` + the `_marketing` confirmation route; consumed by the renderer's `onSubmitted` handoff.

**Airtable metadata:** Category **Content & Marketing** · Layer **Full Stack** · Complexity **Simple** · Priority **P2 - Medium**.

**Consumes these ConvexPress systems:**

- **Form Submission System** — the source of the post-submit signal. The Form Renderer calls Submission's public unauthenticated `submit` mutation, then hands off to this system via `onSubmitted(result)`. This system **resolves which confirmation to show** for a given submission's values; it does **not** create the submission, write `fieldValues`, or emit `form.submitted` (see the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)). Hard dependency — there is nothing to confirm without a submit.
- **Form Merge Tags & Prefill System** — confirmation **message** text is rendered through the *same* merge-tag engine the renderer/prefill use, so a thank-you can interpolate `{field:email}`, `{form:title}`, `{entry:id}`, etc. This system **delegates** token parsing/rendering to that system; it does not implement its own templating (see the Form Merge Tags & Prefill System PRD (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`)).
- **Form Field Engine** — confirmation **conditional logic** reuses the engine's conditional-logic *shape* (`ConditionalLogicData`: `show`/`hide`, `and`/`or`, operators) and its pure `evaluateConditionalLogic` evaluator, applied against the submitted value map to pick the first matching confirmation. No new logic engine is built (see the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §6).
- **Role & Capability System** — every config mutation gates on `requireCan(ctx, "form.manage_confirmations")`, granted to Administrator + Editor. The public `resolveConfirmation` query is **un-gated** (it serves anonymous respondents), exactly as the public submit is.
- **Plugin registry (v2 scanner)** — the admin config route wraps `<PluginGuard pluginId="forms">`; the public surface is reached through the renderer, already wrapped in `<PublicPluginGate pluginId="forms">`.

**WooCommerce / WordPress analog:** Gravity Forms' **Confirmations** (the third tab of the form editor): an ordered list of confirmations — *Text*, *Page*, or *Redirect* — each with optional conditional logic, evaluated top-to-bottom with a guaranteed **Default Confirmation** fallback, and merge-tag support in the text/redirect query string. This system is the ConvexPress equivalent of that tab plus its front-end rendering.

---

## 1. Overview

### 1.1 Purpose

Own the **post-submit confirmation experience**: let an editor configure one or more confirmations per form — an inline rich-text **message** (with merge tags), an external/internal **redirect**, or a hand-off to a thank-you **Page** — optionally each gated by conditional logic against the submitted answers; then, at submit time, **resolve the first matching confirmation** (falling back to a guaranteed default) and render it on the Website. The renderer hands off on a successful submit; this system decides and shows what comes next. It stores config only, persists no entries, and emits no events.

### 1.2 Scope

**In scope:**
- The `form_confirmations` table: per-form confirmations with `type` (`message` | `redirect` | `page`), `content` (rich text for messages), `redirectUrl`, `pageId`, `conditionalLogic` (engine shape), `isDefault`, and `order`.
- Admin **config CRUD** (`form.manage_confirmations`-gated): create/update/delete/reorder confirmations, set the default, toggle conditional logic.
- The **public resolution query** (`resolveConfirmation`) the renderer calls post-submit: evaluate confirmations in `order` by conditional logic against the submitted values, return the first match, else the default.
- The **public render**: `ConfirmationView` (message swap, SSR-safe, theme-token only) and the **redirect handler** (client redirect / route to the thank-you Page).
- Merge-tag rendering of message text **by delegation** to the Merge Tags & Prefill System.
- The admin **`ConfirmationsEditor`** UI: list, reorder, per-confirmation form, conditional-logic builder reuse, default toggle.
- The `confirmationRef` contract resolution the Form Builder deferred (Builder PRD §13 open question #4): a form's `settings` need only reference confirmations *by formId*; this system owns the list keyed `by_form`.

**Out of scope:**
- The submit mutation, entry storage, server re-validation, and the `form.submitted` event (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)).
- Rendering the form itself + the success handoff *mechanism* (`onSubmitted`) (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)). This system supplies what the handoff renders, not the handoff.
- Merge-tag **parsing/token catalog/rendering implementation** (the Form Merge Tags & Prefill System PRD (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`)). This system passes a string + value map through it.
- The conditional-logic **evaluator + shape** (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)). Reused, not rebuilt.
- **Email/site notifications** after submit — a different concern, owned entirely by the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`). Confirmations are on-screen only.
- The Pages system itself (`pages` table, page rendering). This system holds only a `pageId` reference and links to it; it does not render page content.
- The `forms` table + builder authoring (the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`) | The post-submit signal + the value map that drives conditional resolution; there is no confirmation without a successful submit. |
| Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`) | The `ConditionalLogicData` shape + the pure `evaluateConditionalLogic` evaluator used to pick the first matching confirmation. |
| Form Merge Tags & Prefill System (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`) | Renders merge tags inside confirmation **message** content; delegated, not reimplemented. |
| Role & Capability System | `requireCan(ctx, "form.manage_confirmations")` on every config mutation (Administrator + Editor). |
| Plugin registry (v2 scanner) | `PluginGuard` on the admin config route; `PublicPluginGate` already wraps the renderer surface. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Renderer System | On a successful submit, its `onSubmitted(result)` handoff renders the resolved confirmation (`ConfirmationView`) or performs the resolved redirect. |
| Form Builder System | Its **Confirmations** builder tab links to this system's config route; its `settings.confirmationRef` open question is resolved here (refs are by-form, not opaque blobs). |
| Form Multi-Step & Save-Continue System | A *completed* multi-step form resolves a confirmation exactly like a single-page form (partials show no confirmation). |

### 2.3 Integration shape

```typescript
// What the renderer hands this system on a successful submit (Renderer PRD §2.3).
// The renderer already carries SubmitResult + ConfirmationRef; this system
// FILLS those in. ConfirmationRef is resolved by formId + the submitted values.
interface ConfirmationRef {
  confirmationId: string;          // the resolved form_confirmations row id
  type: "message" | "redirect" | "page";
  // For "message": merge-tag-rendered, sanitized rich-text HTML ready to mount.
  renderedMessage?: string;
  // For "redirect": the validated, allowed-host URL to send the respondent to.
  redirectUrl?: string;
  // For "page": the target page's slug/path to route to on the Website.
  pagePath?: string;
}

// The query the renderer calls post-submit (this system owns it).
// PUBLIC / un-gated — serves anonymous respondents, like the submit mutation.
type ResolveConfirmationArgs = {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;  // to derive entry-scoped merge tags
};
type ResolveConfirmationResult = ConfirmationRef;
```

---

## 3. Data Model

This system **owns the `form_confirmations` table**. It stores config only — never an entry, never a per-field value (those live in the Submission System's `form_submissions` + the engine's `fieldValues`). One form has **N** confirmations and **always exactly one** `isDefault: true` row.

### 3.1 `form_confirmations` (owned by this system)

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// Additive fragment — merged into the root schema by the v2 scanner; never hand-edited there.
// This system OWNS this table. It stores CONFIG, not submissions.

form_confirmations: defineTable({
  // Owner form (Builder owns the `forms` table; this references it).
  formId: v.id("forms"),

  // Author-facing label for the admin list (e.g. "Default", "VIP path").
  name: v.string(),

  // What the respondent gets after submit.
  type: v.union(
    v.literal("message"),   // inline rich-text thank-you (merge tags supported)
    v.literal("redirect"),  // send to an arbitrary (allowed-host) URL
    v.literal("page")       // route to an internal thank-you Page
  ),

  // type === "message": rich-text content (stored sanitized; merge tags as tokens).
  content: v.optional(v.string()),

  // type === "redirect": the destination URL (validated against the allow-list, see §8).
  redirectUrl: v.optional(v.string()),
  // Optional query-string params for the redirect, each value merge-tag-renderable.
  redirectQuery: v.optional(v.record(v.string(), v.string())),

  // type === "page": the internal thank-you Page to route to.
  pageId: v.optional(v.id("pages")),

  // Conditional gate — REUSE the engine's ConditionalLogicData shape (Field Engine §6).
  // Absent / disabled => this confirmation always matches (subject to order).
  conditionalLogic: v.optional(v.any()), // { enabled, action: "show"|"hide", logicType: "all"|"any", rules: [...] }

  // Exactly one row per form has isDefault: true (the guaranteed fallback).
  isDefault: v.boolean(),

  // Evaluation order — lower runs first; the default is evaluated LAST regardless.
  order: v.number(),

  // Audit
  createdBy: v.id("users"),
  updatedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_form", ["formId"])                 // load all confirmations for a form
  .index("by_form_order", ["formId", "order"])  // ordered evaluation
  .index("by_form_default", ["formId", "isDefault"]), // fast default lookup / invariant guard
```

### 3.2 Relationship to `forms.settings.confirmationRef` (resolving the Builder's open question)

The Form Builder's `forms.settings` carries an opaque `confirmationRef` string and explicitly defers its contract to this system (Builder PRD §13). **Decision:** confirmations are **owned as their own rows keyed `by_form`**, not embedded in `forms.settings`. A form does not need a `confirmationRef` pointer at all — the relationship is `form_confirmations.formId → forms._id`. `settings.confirmationRef` is therefore **unused by this system** and may be dropped from the settings validator (or left vestigial/ignored). This keeps confirmations independently versionable, reorderable, and conditionally evaluable without rewriting the `forms` row on every confirmation edit.

### 3.3 Resolution data flow

```
submit (Submission System) ──ok──> Renderer onSubmitted(result)
                                          │
                                          ▼
                       resolveConfirmation({ formId, submissionId })   ← THIS SYSTEM (public query)
                                          │
                 load form_confirmations by_form_order (default last)
                                          │
                 load submitted values (engine fieldValues, by entity)
                                          │
        for each non-default in order: evaluateConditionalLogic(c, valueMap)
                                          │  first match wins
                       ┌──────────────────┼───────────────────────┐
                       ▼                  ▼                        ▼
                 type "message"     type "redirect"          type "page"
              render merge tags    validate allowed host   resolve page slug
              → ConfirmationView    → redirect handler      → route to /<page>
                       │                  │                        │
                       └──────── none matched ⇒ DEFAULT ───────────┘
```

---

## 4. Routes

### 4.1 Admin config route (Admin app)

Admin-only, `App = Admin`, `auth = true`, under `apps/web/src/routes/_authenticated/_admin/forms/`. **Wraps `<PluginGuard pluginId="forms">`** (404/redirect when the Forms extension is disabled). Reached from the Builder's **Confirmations** tab.

| Route | Path | Layout | App | Auth | Roles | Purpose |
|---|---|---|---|---|---|---|
| Confirmations config | `/admin/forms/$formId/confirmations` | `_admin` | Admin | Yes | Administrator, Editor | List, add, edit, reorder, and set the default confirmation for a form; configure each confirmation's type + conditional logic. |

**Navigation pattern (Base UI, full-page):** Per the admin-shell convention there are **no modal content editors**. The confirmations list + per-confirmation editor are full-page (or non-modal slide-over) surfaces under the `$formId` route; dialogs are reserved for confirmations-of-intent only (e.g. "Delete this confirmation?"). This mirrors the Builder's settings/builder full-page pattern.

### 4.2 Public render target (Website app)

`App = Website`, `auth = false` (public; serves guests + `Subscriber`). The primary confirmation render is an **inline swap** inside the renderer on the same `/forms/$slug` route (no navigation needed for `message`). A dedicated public route exists as a **redirect/thank-you target** so a redirect or page-type confirmation has a stable landing URL and so a respondent who reloads after submit can still see a thank-you.

| Route | Path | Layout | App | Auth | Roles | Purpose |
|---|---|---|---|---|---|---|
| Confirmation target | `/forms/$slug/confirmation` | `_marketing` | Website | No | Guest, Subscriber | Stable thank-you/redirect landing for a submitted form; renders `ConfirmationView` for the resolved (or default) confirmation. |

**Plugin gate.** The public surface is reached through the renderer, which already wraps in `<PublicPluginGate pluginId="forms">`; the standalone confirmation route wraps the same gate so a disabled extension 404s consistently (mirrors `signup.$offerId.tsx`).

**Primary path is the inline swap.** For a `message` confirmation, the renderer does **not** navigate — `onSubmitted` swaps the form for `ConfirmationView` in place (preserving scroll/focus, announcing success to assistive tech per Renderer §7). The `/forms/$slug/confirmation` route is the fallback landing for `redirect`/`page` types and for post-submit reloads.

---

## 5. Actions

All config actions are mutations gated by `requireCan(ctx, "form.manage_confirmations")` — granted to **Administrator + Editor**, per the action map. **No events are owned or emitted by this system** (§6). The public `resolveConfirmation` query is **un-gated**.

### 5.1 Admin / config actions (capability-gated)

| Action | Capability | Description | Roles | Emits |
|---|---|---|---|---|
| Configure confirmations | `form.manage_confirmations` | Create / update / delete / reorder a form's confirmations; set the default; edit type-specific fields + conditional logic. | Administrator, Editor | — |

The single declared capability `form.manage_confirmations` covers the whole CRUD surface (the underlying mutations — `createConfirmation`, `updateConfirmation`, `deleteConfirmation`, `reorderConfirmations`, `setDefaultConfirmation` — all gate on it). It is declared in the Forms manifest at `apps/web/src/extensions/forms/` and merged into the capability registry by codegen; `requireCan` is the single enforcement point, UI gating is convenience only.

### 5.2 Public action (NOT capability-gated)

| Action | Code | Description | Roles |
|---|---|---|---|
| Resolve confirmation | `form.resolve_confirmation` | Pick the first matching (or default) confirmation for a submission + return a render-ready `ConfirmationRef`. | **All roles AND anonymous / guests** |

`resolveConfirmation` is **public**, mirroring the public submit: a logged-out respondent must be able to see their thank-you. It is a *read* that resolves config against an already-persisted submission; it writes nothing, so it needs no spam guard (the submit it follows already ran one).

---

## 6. Events / Notifications

**None owned. Intentionally empty.**

- **Events:** this system emits **no events**. It reacts to a *successful submit* via the renderer's `onSubmitted` handoff (a client call into `resolveConfirmation`), not by subscribing to `form.submitted`. The `form.submitted` event is owned and emitted by the Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md` §6); confirmations do not need it because they run on the synchronous client path right after the awaited submit resolves.
- **Notifications:** this system sends **nothing**. On-screen confirmations are *not* notifications. Email autoresponders, the admin "new submission" email, and the admin site notification are **entirely owned by the Form Notification System** (`specs/ConvexPress/systems/form-notification-system/PRD.md`), triggered off the Submission System's `form.submitted` event. The split is deliberate: **confirmation = what the respondent sees on screen now; notification = what gets emailed/posted asynchronously.** Cross-reference the Notification system for any off-screen response.

This section is intentionally empty to keep the system a thin config + resolution/render layer (mirrors the Renderer's deliberately thin Actions/Events/Notifications section).

---

## 7. Resolution Logic

The core of the system: given a submitted form, decide **which** confirmation the respondent sees.

### 7.1 Algorithm

1. **Load confirmations** for the form via `by_form_order` (ascending `order`). The **default** (`isDefault: true`) is always evaluated **last**, regardless of its stored `order`.
2. **Load the submitted value map** for the submission from the engine's `fieldValues` (`entityType: "form_submission"`, `entityId: <submissionId>`), decoded via the engine's `parseFieldValue` into a `fieldName → value` map — the same map shape the conditional-logic evaluator and merge-tag renderer expect.
3. **Evaluate in order.** For each **non-default** confirmation in ascending `order`, run the engine's pure `evaluateConditionalLogic(confirmation, valueMap)`:
   - A confirmation with **no conditional logic** (absent or `enabled: false`) always matches.
   - A confirmation with logic matches when its `show`/`hide` + `all`/`any` rules evaluate true against the values.
   - **First match wins** — return it and stop.
4. **Default fallback.** If no non-default confirmation matched, return the **default**. A default **always exists** (invariant §8), so resolution can never return nothing.
5. **Build the `ConfirmationRef`** for the winner by type:
   - `message` → render `content` through the Merge Tags & Prefill System against the value map, sanitize, return as `renderedMessage`.
   - `redirect` → validate `redirectUrl` against the allowed-host policy (§8), merge-tag-render any `redirectQuery` values, return the final `redirectUrl`.
   - `page` → resolve `pageId` → the page's public slug/path, return as `pagePath`.

### 7.2 Why first-match-wins + guaranteed default

This mirrors Gravity Forms exactly and gives editors a predictable mental model: order specific, conditional confirmations first (e.g. "if `plan` = enterprise → show the sales-callback message"), and rely on the default as the catch-all. Because the default always exists and is evaluated last, there is no "no confirmation" edge — every successful submit yields a respondent-facing result.

### 7.3 Resolution sketch

```typescript
// packages/backend/convex/extensions/forms/confirmations.ts
import { query } from "../../_generated/server";
import { v } from "convex/values";
import { evaluateConditionalLogic, parseFieldValue } from "@convexpress/field-engine";
import { renderMergeTags } from "@convexpress/forms-merge-tags"; // delegate (Merge Tags system)
import { sanitizeRichText } from "../../lib/sanitize";
import { isAllowedRedirectHost } from "./redirectPolicy";

// PUBLIC: no auth, no capability gate (serves anonymous respondents).
export const resolveConfirmation = query({
  args: {
    formId: v.id("forms"),
    submissionId: v.id("form_submissions"),
  },
  handler: async (ctx, args) => {
    // 1) Ordered confirmations; default pulled aside to evaluate last.
    const all = await ctx.db
      .query("form_confirmations")
      .withIndex("by_form_order", (q) => q.eq("formId", args.formId))
      .collect();
    const def = all.find((c) => c.isDefault);
    const conditional = all
      .filter((c) => !c.isDefault)
      .sort((a, b) => a.order - b.order);

    // 2) Decoded value map from the engine's fieldValues (no parallel store).
    const valueRows = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "form_submission").eq("entityId", args.submissionId))
      .collect();
    const valueMap: Record<string, unknown> = {};
    for (const row of valueRows) valueMap[row.fieldName] = parseFieldValue(row.value);

    // 3) First conditional match wins; else 4) default (always exists).
    const winner =
      conditional.find((c) =>
        !c.conditionalLogic?.enabled
          ? true
          : evaluateConditionalLogic(c, valueMap),
      ) ?? def;

    if (!winner) {
      // Invariant breach guard — a default must always exist (§8). Fail safe.
      return { confirmationId: "", type: "message" as const, renderedMessage: "Thank you." };
    }

    // 5) Build the render-ready ref by type.
    if (winner.type === "message") {
      const html = sanitizeRichText(renderMergeTags(winner.content ?? "", valueMap));
      return { confirmationId: winner._id, type: "message" as const, renderedMessage: html };
    }
    if (winner.type === "redirect") {
      const url = buildRedirectUrl(winner, valueMap); // merge-tag query + host validate
      if (!isAllowedRedirectHost(url)) {
        // Disallowed host => fall back to the default rather than open-redirect.
        return resolveDefaultRef(def, valueMap);
      }
      return { confirmationId: winner._id, type: "redirect" as const, redirectUrl: url };
    }
    // type === "page"
    const page = winner.pageId ? await ctx.db.get(winner.pageId) : null;
    if (!page || page.status !== "published") {
      return resolveDefaultRef(def, valueMap); // deleted/unpublished page => default
    }
    return { confirmationId: winner._id, type: "page" as const, pagePath: `/${page.slug}` };
  },
});
```

---

## 8. Merge Tags

Confirmation **message** content (and `redirect` query-string values) support merge tags so a thank-you can be dynamic — "Thanks, `{field:first_name}`! Your reference is `{entry:id}`." Rendering is **delegated** to the Form Merge Tags & Prefill System (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`); this system never implements its own tokenizer.

- **Contract:** this system calls `renderMergeTags(template, valueMap)` (the Merge Tags system's render fn) with the submission's decoded `fieldName → value` map (the same map §7 builds). The Merge Tags system owns the token catalog, parsing, escaping of field values, and unknown-token handling.
- **Sample tokens** (catalog owned by the Merge Tags system; shown here as the kind of tokens a confirmation message uses):
  - `{field:<name>}` — a submitted field's value (e.g. `{field:email}`).
  - `{form:title}` / `{form:slug}` — the form's identity.
  - `{entry:id}` / `{entry:date}` — the submission's id / timestamp (useful as a reference number).
  - `{user:display_name}` — the signed-in respondent, when present.
- **Sanitization is this system's job, not the merge system's.** After merge-rendering, message HTML is passed through the shared `sanitizeRichText` before it is returned as `renderedMessage` and mounted, so a malicious field value interpolated into the message cannot inject script (§9, §10).
- **Redirect query rendering:** each `redirectQuery` value is merge-rendered then URL-encoded; the resulting URL is **then** host-validated (§8 of Business Rules). Merge tags can populate query params (e.g. `?ref={entry:id}`) but cannot change the host.

---

## 9. UI Components

**Stack:** Base UI (not Radix), Tailwind v4, theme-token colours only. Admin = full-page/non-modal; Website = SSR-safe presentational.

### 9.1 Admin components (this system)

- [ ] **`ConfirmationsEditor`** — `/admin/forms/$formId/confirmations`. The list + editor host. Shows the form's confirmations in `order` (default pinned/last, clearly badged "Default"), with add, reorder (drag → writes `order`), edit, and delete row actions. Empty state is impossible (a default is auto-created with the form / on first load — §8 invariant), so it always renders at least the default. Wraps `<PluginGuard pluginId="forms">`.
- [ ] **`ConfirmationForm`** — the per-confirmation editor (non-modal slide-over or inline panel). Fields: `name`, a `type` segmented control (Message / Redirect / Page), and the type-specific body:
  - *Message* → a rich-text editor (reusing the admin's existing WYSIWYG, the same one the engine's `wysiwyg` field type uses) with a **merge-tag inserter** (dropdown of available tokens, provided by the Merge Tags system).
  - *Redirect* → a URL input (with allowed-host validation feedback) + an optional key/value query-param table, each value merge-tag-aware.
  - *Page* → a Page picker (search/select a published `pages` row → `pageId`).
- [ ] **`ConfirmationLogicBuilder`** — the conditional-logic editor, **reusing the same logic-builder UI the Builder's Logic tab uses** (Form Logic & Validation System) bound to this confirmation's `conditionalLogic`. Authors `show`/`hide` + `all`/`any` rules over the form's fields. Built here only as a thin binding; the rule UI is reused.
- [ ] **`DefaultConfirmationToggle`** — sets which confirmation is the default; setting a new default clears the prior one in the same mutation (the invariant is enforced server-side, §8).
- [ ] **`ConfirmDialog`** — shared Base UI dialog for "Delete this confirmation?" (and a guard if the user tries to delete the default — disallowed, §8).

### 9.2 Website components (public)

- [ ] **`ConfirmationView`** — renders a resolved `message` confirmation: mounts the **already-sanitized** `renderedMessage` HTML, SSR-safe, theme-token only. Receives focus on success (a `tabIndex={-1}` region with `role="status"`) so screen-reader users are told the outcome (Renderer §7 focus-management contract). Used both for the inline swap and on the `/forms/$slug/confirmation` route.
- [ ] **Redirect handler** — for a `redirect` confirmation, performs a client-side navigation to the validated `redirectUrl` (external → full navigation; internal → router navigate). For a `page` confirmation, routes to `pagePath`. No component chrome of its own; it is the small effect that runs when `ConfirmationRef.type !== "message"`.

### 9.3 Renderer handoff (consumes Renderer §6 `onSubmitted`)

```tsx
// ConvexPress-Website/apps/web/src/extensions/forms/useConfirmation.ts (sketch)
// Wired into the Renderer's onSubmitted(result) handoff. The renderer awaits submit,
// then this resolves + renders/redirects. SSR-safe: all browser work in effects/handlers.
import { useState } from "react";
import { useConvex } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

export function useConfirmation(formId: string) {
  const convex = useConvex();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState<ConfirmationRef | null>(null);

  // Passed to <FormRenderer onSubmitted={...} />.
  async function onSubmitted(result: { ok: boolean; entryId?: string }) {
    if (!result.ok || !result.entryId) return;
    const ref = await convex.query(api.extensions.forms.confirmations.resolveConfirmation, {
      formId,
      submissionId: result.entryId,
    });
    if (ref.type === "redirect" && ref.redirectUrl) {
      window.location.assign(ref.redirectUrl);      // external redirect (already host-validated)
      return;
    }
    if (ref.type === "page" && ref.pagePath) {
      navigate({ to: ref.pagePath });               // internal thank-you Page
      return;
    }
    setConfirmation(ref);                            // message => swap form for ConfirmationView
  }

  return { confirmation, onSubmitted };
}
```

---

## 10. API Design

Backend at `packages/backend/convex/extensions/forms/confirmations.ts`. **Every config mutation opens with `requireCan(ctx, "form.manage_confirmations")`.** The public `resolveConfirmation` query (§7.3) carries **no** capability gate. Sketches elide shared helpers (`assertSingleDefault`, `buildRedirectUrl`, `resolveDefaultRef`).

### 10.1 Admin queries (gated)

```typescript
// List a form's confirmations for the editor (gated).
export const listConfirmations = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_confirmations");
    return await ctx.db
      .query("form_confirmations")
      .withIndex("by_form_order", (q) => q.eq("formId", args.formId))
      .collect();
  },
});
```

### 10.2 Config mutations (gated by `form.manage_confirmations`)

```typescript
// Create a confirmation (never the default — default is auto-seeded; see ensureDefault).
export const createConfirmation = mutation({
  args: {
    formId: v.id("forms"),
    name: v.string(),
    type: v.union(v.literal("message"), v.literal("redirect"), v.literal("page")),
    content: v.optional(v.string()),
    redirectUrl: v.optional(v.string()),
    redirectQuery: v.optional(v.record(v.string(), v.string())),
    pageId: v.optional(v.id("pages")),
    conditionalLogic: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireCan(ctx, "form.manage_confirmations");
    await ensureDefault(ctx, args.formId, userId);           // guarantee the invariant
    if (args.type === "redirect") assertAllowedRedirect(args.redirectUrl); // §8
    const order = await nextOrder(ctx, args.formId);
    const now = Date.now();
    const id = await ctx.db.insert("form_confirmations", {
      formId: args.formId,
      name: args.name,
      type: args.type,
      content: args.type === "message" ? sanitizeRichText(args.content ?? "") : undefined,
      redirectUrl: args.type === "redirect" ? args.redirectUrl : undefined,
      redirectQuery: args.type === "redirect" ? args.redirectQuery : undefined,
      pageId: args.type === "page" ? args.pageId : undefined,
      conditionalLogic: args.conditionalLogic,
      isDefault: false,
      order,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    return { confirmationId: id };
  },
});

// Update a confirmation (type-aware; re-validates redirect host; re-sanitizes message).
export const updateConfirmation = mutation({
  args: {
    confirmationId: v.id("form_confirmations"),
    patch: v.object({
      name: v.optional(v.string()),
      type: v.optional(v.union(v.literal("message"), v.literal("redirect"), v.literal("page"))),
      content: v.optional(v.string()),
      redirectUrl: v.optional(v.string()),
      redirectQuery: v.optional(v.record(v.string(), v.string())),
      pageId: v.optional(v.id("pages")),
      conditionalLogic: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await requireCan(ctx, "form.manage_confirmations");
    const existing = await ctx.db.get(args.confirmationId);
    if (!existing) throw new Error("Confirmation not found");
    if (args.patch.redirectUrl !== undefined) assertAllowedRedirect(args.patch.redirectUrl); // §8
    const next: Record<string, unknown> = { ...args.patch, updatedBy: userId, updatedAt: Date.now() };
    if (args.patch.content !== undefined) next.content = sanitizeRichText(args.patch.content);
    await ctx.db.patch(args.confirmationId, next);
    return { success: true };
  },
});

// Reorder confirmations (writes `order`; the default still evaluates last at resolve time).
export const reorderConfirmations = mutation({
  args: { formId: v.id("forms"), order: v.array(v.id("form_confirmations")) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_confirmations");
    await applyConfirmationOrder(ctx, args.formId, args.order);
    return { success: true };
  },
});

// Set the default (clears the prior default in the same transaction — invariant §8).
export const setDefaultConfirmation = mutation({
  args: { formId: v.id("forms"), confirmationId: v.id("form_confirmations") },
  handler: async (ctx, args) => {
    const userId = await requireCan(ctx, "form.manage_confirmations");
    const current = await ctx.db
      .query("form_confirmations")
      .withIndex("by_form_default", (q) => q.eq("formId", args.formId).eq("isDefault", true))
      .first();
    if (current && current._id !== args.confirmationId) {
      await ctx.db.patch(current._id, { isDefault: false, updatedBy: userId, updatedAt: Date.now() });
    }
    await ctx.db.patch(args.confirmationId, { isDefault: true, updatedBy: userId, updatedAt: Date.now() });
    return { success: true };
  },
});

// Delete a confirmation — the default cannot be deleted (must hand off first, §8).
export const deleteConfirmation = mutation({
  args: { confirmationId: v.id("form_confirmations") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_confirmations");
    const c = await ctx.db.get(args.confirmationId);
    if (!c) throw new Error("Confirmation not found");
    if (c.isDefault) throw new Error("Cannot delete the default confirmation; set another default first.");
    await ctx.db.delete(args.confirmationId);
    return { success: true };
  },
});
```

### 10.3 Public query (un-gated)

`resolveConfirmation` is shown in §7.3. It is the single public surface: a read that takes `{ formId, submissionId }`, evaluates config against the submission's values, and returns a render-ready `ConfirmationRef`. It is `requireCan`-free by design, exactly like the public submit, because it serves anonymous respondents.

---

## 11. Business Rules & Constraints

- **A default always exists.** Every form has exactly **one** `isDefault: true` confirmation at all times. It is **auto-seeded** (a "Thank you for your submission." message) the first time confirmations are loaded/edited for a form (`ensureDefault`), and the invariant is held by `setDefaultConfirmation` (clears the prior default in the same mutation) and `deleteConfirmation` (refuses to delete the default). Resolution can therefore never return nothing.
- **First matching confirmation wins; the default is the catch-all.** Non-default confirmations are evaluated in ascending `order`; the first whose conditional logic matches (or which has none) is returned. The default is evaluated **last regardless of its `order`**.
- **`manage_confirmations` gates all config; resolution is public.** Every mutation requires `requireCan(ctx, "form.manage_confirmations")` (Administrator + Editor). The public `resolveConfirmation` is un-gated — anonymous respondents must see their thank-you, exactly as they may submit anonymously.
- **Redirect safety / allowed hosts.** `redirectUrl` is validated against an **allow-list policy** (`isAllowedRedirectHost`) both on save (`assertAllowedRedirect`) and again at resolve time. Same-origin and explicitly allow-listed external hosts are permitted; anything else is rejected on save and **falls back to the default** at resolve time rather than performing an open redirect. Merge tags may fill query params but **cannot alter the host**. This closes the classic form-confirmation open-redirect vector.
- **Messages support merge tags, and are sanitized.** Message `content` is merge-rendered against the submission's values (delegated to the Merge Tags system) and then passed through `sanitizeRichText` before it is returned/mounted, so an interpolated field value cannot inject script. Sanitization is owned here; tokenization is owned by the Merge Tags system.
- **Confirmations only fire on a *completed* submit.** A `partial` (save-and-continue / mid-multi-step) write shows **no** confirmation; only the completing submit (`isComplete: true`) triggers the renderer's `onSubmitted` handoff and thus resolution (mirrors the Submission System's complete/partial split, §4.3 there).
- **Config only — no entries.** This system stores `form_confirmations` config exclusively. It never writes `form_submissions` or `fieldValues`; it only **reads** the submission's values (via the engine's `fieldValues`) to drive conditional logic + merge tags.
- **Reuse, don't rebuild.** Conditional-logic shape + evaluator come from the Field Engine; merge-tag rendering comes from the Merge Tags system; the logic-builder UI and the rich-text editor are reused from existing admin surfaces. This system builds the confirmations config + the resolution/render only.
- **Additive-only (v2).** `form_confirmations` is declared in the extension's schema fragment and merged by the scanner; this system never edits root `schema.ts`, `registry.ts`, or `nav-config.ts`.

---

## 12. Edge Cases

| Scenario | Handling |
|---|---|
| No confirmation's conditional logic matches | Return the **default** (always exists, evaluated last). Every submit yields a result. |
| A confirmation has no conditional logic | It always matches; place it before the default in `order` so it acts as the effective catch-all branch. |
| Redirect to an **external** URL | Allowed only if the host is on the allow-list; validated on save and at resolve. Performed as a full-page navigation. Disallowed host → fall back to default (no open redirect). |
| Redirect host disallowed at resolve (allow-list changed since save) | Resolve falls back to the **default** rather than redirecting to a now-disallowed host. |
| Target **Page deleted** or unpublished (`pageId` dangling) | Resolution detects the missing/non-`published` page and falls back to the **default** (never a broken route). The admin Page picker also warns on a dangling ref. |
| Merge tag references a field not in the submission | Delegated to the Merge Tags system's unknown-token policy (typically rendered empty); the message still renders. |
| Field value with HTML/script interpolated into a message | Neutralized by `sanitizeRichText` after merge-rendering; no script execution. |
| Partial / mid-multi-step write | No confirmation shown; resolution runs only after a completing submit. |
| Editor tries to delete the default | Rejected (`deleteConfirmation` throws); they must set another default first. Dialog explains why. |
| Two editors edit confirmations concurrently | Per-row patches; last-write-wins on a given confirmation. The single-default invariant is enforced inside `setDefaultConfirmation`, so it holds regardless of interleaving. |
| Forms extension disabled | Admin route 404s via `<PluginGuard>`; the public render is unreachable behind `<PublicPluginGate>` on the renderer. |
| Respondent reloads `/forms/$slug` after submit | The inline confirmation is component state and is lost on reload; a `redirect`/`page` confirmation already navigated away, and the `/forms/$slug/confirmation` route can serve as a stable thank-you landing for those types. |
| Form has only the default confirmation | Normal/most-common case: the default renders for every submit. |

---

## 13. Implementation Checklist

**Phase 1 — data model + default invariant**
- [ ] Add the `form_confirmations` table fragment (additive) at `packages/backend/convex/extensions/forms/schema.ts` with `by_form`, `by_form_order`, `by_form_default` indexes.
- [ ] Implement `ensureDefault` (auto-seed a default "Thank you" message confirmation) and the single-default invariant helpers.

**Phase 2 — config CRUD (admin)**
- [ ] Implement `createConfirmation` / `updateConfirmation` / `deleteConfirmation` / `reorderConfirmations` / `setDefaultConfirmation` + `listConfirmations` — every mutation `requireCan(ctx, "form.manage_confirmations")`.
- [ ] Declare `form.manage_confirmations` in the Forms manifest (Administrator + Editor grants).
- [ ] Redirect allow-list policy: `isAllowedRedirectHost` + `assertAllowedRedirect` (save-time + resolve-time).
- [ ] Rich-text sanitization (`sanitizeRichText`) applied on write for `message` content.

**Phase 3 — resolution (public)**
- [ ] Implement the un-gated `resolveConfirmation` query: ordered eval, default-last, first-match-wins, default fallback.
- [ ] Load values via the engine's `fieldValues` (`entityType: "form_submission"`) + `parseFieldValue`; run `evaluateConditionalLogic`.
- [ ] Build the `ConfirmationRef` per type: merge-render + sanitize message; host-validate redirect; resolve page slug (fallback to default on dangling/disallowed).

**Phase 4 — admin UI**
- [ ] `ConfirmationsEditor` route at `_authenticated/_admin/forms/$formId/confirmations` wrapped in `<PluginGuard pluginId="forms">`.
- [ ] `ConfirmationForm` (type segmented control + per-type body), reusing the WYSIWYG + Page picker; `ConfirmationLogicBuilder` reusing the Logic tab's rule UI; `DefaultConfirmationToggle`; delete-guard dialog.
- [ ] Link the Builder's **Confirmations** tab to this route.

**Phase 5 — public render + handoff**
- [ ] `ConfirmationView` (sanitized message mount, focus/`role="status"`), SSR-safe.
- [ ] `useConfirmation` wired into the Renderer's `onSubmitted` handoff: message → inline swap; redirect → external nav; page → router nav.
- [ ] `/forms/$slug/confirmation` `_marketing` route as the stable thank-you/redirect landing, wrapped in `<PublicPluginGate pluginId="forms">`.
- [ ] Verify with Playwright: configure a conditional message + a redirect + a page confirmation, submit matching/ non-matching values, confirm first-match-wins and default fallback, and confirm a disallowed redirect host falls back to default.

---

## 14. Open Questions

- **Default seeding timing:** auto-seed the default on `form.create` (Builder) vs. lazily on first confirmations load/edit (`ensureDefault`, current plan). Default: lazy seed here, so the Builder needs no change; revisit if the renderer ever resolves before any admin has opened the Confirmations tab (in which case `ensureDefault` should also run read-side or the resolver's fail-safe "Thank you." covers it).
- **Redirect allow-list source:** site-wide setting vs. per-form allow-list vs. same-origin-only by default. Default: same-origin always allowed + a site-wide allow-list of external hosts; confirm where that list is configured (Settings system) before locking `isAllowedRedirectHost`.
- **`page`-type rendering surface:** route to the existing Page route (`/<slug>`) vs. render the page *inside* `/forms/$slug/confirmation`. Default: route to the existing Page (simplest, reuses Page SSR); revisit if editors want the thank-you Page framed by form context.
- **`settings.confirmationRef` cleanup:** drop the vestigial `confirmationRef` from `forms.settings` (this system keys `by_form`) vs. keep it as an optional "pinned/forced confirmation" override. Default: drop it; reopen only if a "always show confirmation X regardless of logic" override is requested. Coordinate the removal with the Builder's settings validator (Builder PRD §13).
- **Confirmation on partial completion of multi-step:** confirmed no confirmation on partials (only on the completing submit). Reconfirm with the Multi-Step system if a per-step "step saved" inline acknowledgement is ever wanted (that would be a Multi-Step concern, not a confirmation).

---

## 15. Cross-References

- Depends on (post-submit signal + values): Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Success handoff caller: Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)
- Conditional-logic shape + evaluator: Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Merge-tag rendering (delegated): Form Merge Tags & Prefill System PRD (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`)
- Off-screen response (email/site notices — NOT this system): Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`)
- Authoring entry point (Confirmations tab) + `confirmationRef` contract: Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)
- Completed-vs-partial gating: Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)
- Public-surface + gate pattern: `ConvexPress-Website/apps/web/src/components/plugins/PublicPluginGate.tsx`, `ConvexPress-Website/apps/web/src/routes/signup.$offerId.tsx`
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Confirmation System · **Plugin:** ConvexPress Forms (v2)
