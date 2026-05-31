# PLAN: Form Confirmation System (ConvexPress Forms, v2)

Lean, ordered build plan. PRD: `./PRD.md`. Read it for rationale; this file is the
build sheet only. All paths absolute. **Additive-only**: never touch root
`schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts`.

## Ground truth (verified against the codebase — reconciles PRD drift)

The `form_confirmations` table already exists in the extension schema fragment but
is **thinner than the PRD sketch**. The plan adapts to what's real:

- **Table today** (`.../extensions/forms/schema.ts`): `formId, name, type(message|redirect|page),
  content?, redirectUrl?, pageId?(v.string), conditionalLogic?(v.string JSON), isDefault, order`
  + indexes `by_form`, `by_form_order`. **Missing vs. PRD:** `redirectQuery`,
  `by_form_default` index, audit fields. → **We add audit fields + `by_form_default`
  in Step 1.** We **skip `redirectQuery`** (not in scope for MVP; merge-tags still
  work inside the base `redirectUrl` string). `pageId` and `conditionalLogic` stay
  `v.string()` (path-as-string / JSON-string) — matches the rest of the forms ext.
- **Evaluator** (`.../extensions/forms/conditionalLogic.ts`): `evaluateConditionalLogic(json: string|undefined, valueMap: Record<string,string>): boolean`,
  **fail-open**. Reuse as-is. There is **no `parseFieldValue`** — submission values are
  already stored as strings in `fieldValues.value`; build the map directly.
- **Merge tags**: no forms merge engine exists. `helpers/notification.ts#interpolateTemplate`
  only handles `{word}`, not the `{field:name}`/`{form:title}`/`{entry:id}` namespaced
  tokens the PRD wants. → **Add a small local `renderConfirmationMergeTags` helper**
  (~20 lines) inside `confirmations.ts`. No new package.
- **Sanitize**: no `lib/sanitize`. `isomorphic-dompurify` **is installed** in both
  repos (used by `custom-fields/fields/FieldMessage.tsx` and Website `CommentItem.tsx`).
  Use `DOMPurify.sanitize` directly.
- **Pages**: there is **no `pages` table in this app's Convex schema**. `pageId` is a
  free `v.string()` path. `page`-type resolution returns that string as `pagePath`
  (no cross-table lookup, no dangling-page DB check here); the dangling/unpublished
  fallback in PRD §7.5 reduces to "empty/blank `pageId` → fall back to default".
- **FormRenderer** (`Website/.../components/forms/FormRenderer.tsx`) already calls
  `extensions.forms.mutations.submit` and flips a local `submitted` flag to show an
  inline thank-you (lines ~142–179). **We wire `resolveConfirmation` into that exact
  `submitted` branch** — no new `onSubmitted` prop, no `useConfirmation.ts` hook,
  no separate `ConfirmationView` component file (keep it the inline swap the renderer
  already does). The standalone `/forms/$slug/confirmation` route is **deferred** (see
  "Deferred" below) — it is a fallback-landing nicety, not MVP.
- **Capabilities**: `form.*` caps are surfaced-not-yet-registered. Use the existing
  `formCap(cap) => cap as Capability` cast pattern (see `mutations.ts`, `nav.ts`).
- **Convex paths**: Admin backend import root is `../../_generated/server`; admin app
  api is `@backend/convex/_generated/api`; Website api is
  `@convexpress-website/backend/generated/api` and extension fns are read off
  `(api as any).extensions.forms.*`.

---

## Step 1 — Schema: finish the `form_confirmations` fragment

**File:** `/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/extensions/forms/schema.ts`

In the existing `form_confirmations: defineTable({...})` block:
- Add audit fields: `createdBy: v.id("users")`, `updatedBy: v.id("users")`,
  `createdAt: v.number()`, `updatedAt: v.number()`.
- Add the third index: `.index("by_form_default", ["formId", "isDefault"])`.
- Leave `pageId`/`conditionalLogic` as `v.string()`. Do **not** add `redirectQuery`.

No root-schema edits — the codegen scanner merges this fragment.

---

## Step 2 — Backend: confirmations config CRUD + helpers + public resolver

**New file:** `/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/extensions/forms/confirmations.ts`
API path becomes `api.extensions.forms.confirmations.*`.

Imports: `query, mutation` from `../../_generated/server`; `v, ConvexError` from
`convex/values`; `Id` from `../../_generated/dataModel`; `requireCan` from
`../../helpers/permissions`; `evaluateConditionalLogic` from `./conditionalLogic`;
`DOMPurify` from `isomorphic-dompurify`. Copy the `formCap()` cast helper from
`mutations.ts`.

**2a. Local helpers (top of file):**
- `sanitizeMessage(html: string): string` → `DOMPurify.sanitize(html, { ... })`
  (mirror the allow-list in `custom-fields/fields/FieldMessage.tsx`).
- `renderConfirmationMergeTags(template, valueMap, form, submission): string` —
  build a flat token map: `field:<name>` for each submitted value, plus
  `form:title`, `form:slug`, `entry:id`, `entry:date`; regex-replace
  `\{([\w:]+)\}` against it (unknown token → empty string). ~20 lines, self-contained.
- `ALLOWED_REDIRECT_HOSTS` + `isAllowedRedirectHost(url): boolean` — same-origin
  always allowed; external hosts checked against a const allow-list (MVP: empty
  array ⇒ same-origin/relative only). Parse via `new URL(url, "https://placeholder")`;
  treat relative URLs (no host) as allowed. `assertAllowedRedirect(url)` throws
  `ConvexError VALIDATION_ERROR` on a disallowed host.
- `ensureDefault(ctx, formId, userId)` — if no `isDefault:true` row exists for the
  form (`by_form_default`), insert a `type:"message"`, `content:"<p>Thank you for
  your submission.</p>"`, `isDefault:true`, `order:0` row with audit stamps.
- `nextOrder(ctx, formId)` — max `order` + 1 over `by_form_order`.

**2b. Admin query (gated):**
- `listConfirmations({ formId })` → `requireCan(ctx, formCap("form.manage_confirmations"))`,
  call `ensureDefault` first (lazy seed so the editor always has ≥1 row), then return
  `by_form_order` collect, sorted with `isDefault` last.

**2c. Config mutations — each opens with `requireCan(ctx, formCap("form.manage_confirmations"))`:**
- `createConfirmation({ formId, name, type, content?, redirectUrl?, pageId?, conditionalLogic? })`
  — `ensureDefault`; if `type==="redirect"` `assertAllowedRedirect`; sanitize `content`
  when `type==="message"`; `order = nextOrder`; insert with `isDefault:false` + audit.
- `updateConfirmation({ confirmationId, patch:{ name?, type?, content?, redirectUrl?, pageId?, conditionalLogic? } })`
  — load+exist-check; re-`assertAllowedRedirect` if `redirectUrl` present; re-sanitize
  if `content` present; patch + `updatedBy/updatedAt`.
- `reorderConfirmations({ formId, order: Id[] })` — patch each row's `order` to its
  index (default keeps its row but always evaluates last at resolve time regardless).
- `setDefaultConfirmation({ formId, confirmationId })` — clear the prior
  `by_form_default` row, set the new one `isDefault:true`, both in the same handler
  (single-default invariant).
- `deleteConfirmation({ confirmationId })` — throw if `isDefault` ("set another
  default first"); else delete.

**2d. Public resolver (UN-gated — no `requireCan`):**
- `resolveConfirmation({ formId, submissionId })`:
  1. Collect `form_confirmations` `by_form_order`; pull aside `def = find(isDefault)`;
     `conditional = rest.sort(order)`.
  2. Build `valueMap: Record<string,string>` from `fieldValues`
     `by_entity (entityType:"form_submission", entityId: submissionId as string)`,
     mapping `row.fieldName → row.value` (values already strings; **no parse**).
     Load the `form` + `submission` docs for merge-tag context.
  3. `winner = conditional.find(c => evaluateConditionalLogic(c.conditionalLogic, valueMap)) ?? def`.
     (The evaluator fail-opens on absent logic, so a logic-less confirmation always
     matches — first-match-wins.)
  4. Fail-safe: if `!winner`, return `{ confirmationId:"", type:"message", renderedMessage:"Thank you." }`.
  5. Build the `ConfirmationRef` by type:
     - `message` → `renderedMessage = sanitizeMessage(renderConfirmationMergeTags(content ?? "", ...))`.
     - `redirect` → if `!isAllowedRedirectHost(redirectUrl)` fall back to default
       (resolve default's message), else return `{ redirectUrl }`.
     - `page` → if `pageId` blank → default; else `{ pagePath: pageId }` (path string as-is).
  Return shape: `{ confirmationId, type, renderedMessage? | redirectUrl? | pagePath? }`.

---

## Step 3 — Capabilities surface (declare, don't register)

**File:** `/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/extensions/forms/manifest.ts`

Confirm `form.manage_confirmations` is represented in whatever capability list the
Forms manifest surfaces (follow the same pattern the other `form.*` caps already
use). Do **not** edit `types/capabilities.ts` (Role/Capability expert's domain — the
`formCap()` cast covers the gap until they register it). Granted to Administrator +
Editor per PRD §5; that grant is the Role expert's to wire, not this plan's.

---

## Step 4 — Admin route: Confirmations editor

**New file:** `/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/forms/$formId/confirmations.tsx`
Route id: `/_authenticated/_admin/forms/$formId/confirmations`.

Mirror `.../forms/$formId/edit.tsx` exactly for chrome/guards:
- Wrap body in `<PluginGuard pluginId="forms">`.
- Use `useQuery(api.extensions.forms.confirmations.listConfirmations, { formId })`
  (via `convex-helpers/react/cache`) + `useMutation` for the five config mutations.
- Gate UI with `useCan(formCap("form.manage_confirmations"))` (insufficient-perms
  card copied from `settings.tsx`).
- **Full-page, no modal editors** (admin hard rule). Components, all inline in this
  file or co-located under the route — Base UI + theme tokens only, no `@radix-ui`,
  no color literals:
  - **List** — confirmations in `order`, the `isDefault` row pinned/badged "Default";
    row actions Edit / Delete / Set-default; reorder controls writing `reorderConfirmations`.
  - **Per-confirmation editor** (inline panel/slide-over, not a content modal) —
    `name` input, a Message/Redirect/Page segmented control, and the type body:
    Message → reuse the admin WYSIWYG (same editor the `wysiwyg` field type uses) with
    a merge-tag token hint; Redirect → URL input with allowed-host validation feedback;
    Page → a path/slug text input bound to `pageId` (no Page picker — no `pages` table
    in this app).
  - **Conditional logic** — reuse the existing `ConditionalLogicBuilder`
    (`apps/web/src/components/custom-fields/...`) bound to this confirmation's
    `conditionalLogic` string. Thin binding only; do not rebuild the rule UI.
  - **Delete-default guard** — a Base UI confirm dialog (the one allowed popup); the
    mutation already refuses, the dialog just explains.

**File:** `/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/extensions/forms/nav.ts`
Add a child nav item under the Forms section linking to the confirmations route
(label "Confirmations"), `capability: formCap("form.manage_confirmations")`. (Or
surface it as a tab/link from `$formId/edit.tsx` — pick one; nav child is simplest.)

---

## Step 5 — Website: wire the resolved confirmation into FormRenderer

**File:** `/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/components/forms/FormRenderer.tsx`

This is the **only** Website code change for MVP. In `handleSubmit` (≈ line 142) the
component already `await submit(...)` and sets `submitted`. Change:
- Capture the submit result: `const res = await submit({...})` → `res.submissionId`.
- After success, resolve: `const ref = await convex.query((api as any).extensions.forms.confirmations.resolveConfirmation, { formId: form._id, submissionId: res.submissionId })`
  (get `convex` via `useConvex()` from `convex/react`).
- Branch on `ref.type`:
  - `redirect` + `ref.redirectUrl` → `window.location.assign(ref.redirectUrl)` (host
    already validated server-side).
  - `page` + `ref.pagePath` → `navigate({ to: ref.pagePath })` (`useNavigate` from
    `@tanstack/react-router`).
  - `message` (default) → store `ref.renderedMessage` in state and render it in the
    existing `submitted` block (≈ lines 164–179) via
    `dangerouslySetInnerHTML={{ __html: renderedMessage }}` (already sanitized server-side;
    optionally re-`DOMPurify.sanitize` client-side as defense-in-depth, matching
    `CommentItem.tsx`). Keep the `data-slot="form-success"` wrapper, `role="status"`,
    and focus-on-success behavior; fall back to the current static "Thank you" copy if
    `renderedMessage` is empty.
- On resolver error, keep the current static thank-you (never block the success state).

No new files in the Website repo. SSR-safe: all of this is inside the submit handler/effects.

---

## Deferred (explicitly out of MVP — note, don't build)

- **`/forms/$slug/confirmation` `_marketing` route** + a standalone `ConfirmationView.tsx`:
  a stable post-reload landing for redirect/page types. The inline swap covers the
  primary path; add this only if a reload-survives-thank-you is later required.
- **`redirectQuery` record** + per-param merge rendering (PRD §8): base `redirectUrl`
  already supports merge tags inline.
- **`pages`-table dangling/unpublished detection**: no `pages` table in this app; revisit
  if/when one lands here.

---

## Verify checklist

Run from the relevant repo root; **foreground, one at a time** (per project rule — no
background/parallel bunx/npx).

- [ ] **Admin typecheck passes.** `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin && bun run typecheck` (or `bunx tsc -p packages/backend && bunx tsc -p apps/web`). Suppress only genuine Convex TS2589 false-positives with scoped `@ts-expect-error`; never `--typecheck=disable`. (Convex deploy itself is the deployment expert's job, not this task.)
- [ ] **Website typecheck passes.** `cd /Users/worsin/Development/ConvexPress/ConvexPress-Website && bun run typecheck`.
- [ ] **Codegen sees the schema add.** Confirm `scripts/generate-extension-index.mjs` (or the generated schema hub) picks up the new audit fields/index — `form_confirmations` types regenerate without hand-editing root `schema.ts`.
- [ ] **`requireCan` on every config mutation.** Grep `confirmations.ts`: each of create/update/delete/reorder/setDefault + `listConfirmations` calls `requireCan(ctx, formCap("form.manage_confirmations"))`; `resolveConfirmation` has **none**.
- [ ] **Default invariant holds.** New form → open Confirmations editor → exactly one "Default" row auto-seeds; `setDefault` moves the badge and clears the old default; deleting the default is rejected with the guard dialog.
- [ ] **First-match-wins + default fallback (Playwright).** Configure: a conditional `message` ("if `plan == enterprise`"), a `redirect`, and a `page` confirmation, plus the default. Submit values that match the conditional → that message shows. Submit non-matching values → default shows.
- [ ] **Redirect performs + host allow-list enforced.** A same-origin/allow-listed `redirect` confirmation navigates on submit; a disallowed host is rejected on save, and (if forced) falls back to the default at resolve — never an open redirect.
- [ ] **Page type routes.** A `page` confirmation with a valid path navigates there; a blank `pageId` falls back to default.
- [ ] **Merge tags render + sanitized.** A message with `{field:email}` / `{entry:id}` interpolates the submitted values; a field value containing `<script>` is neutralized (no execution) in the rendered thank-you.
- [ ] **Renderer success state intact.** `data-slot="form-success"` still present, focus moves to the success region, assistive-tech announces it (`role="status"`), and a resolver failure degrades to the static "Thank you" rather than erroring.
- [ ] **Plugin gates.** Disable the Forms extension → admin `/admin/forms/$formId/confirmations` 404s via `<PluginGuard>`; the public surface is unreachable behind `<PublicPluginGate>` on the renderer route.
