# PRD: Form Logic & Validation System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The conditional-logic + server-trusted-validation half of the Forms tree; extends the Form Field Engine's existing field-level evaluator + validator to sections/pages and owns the authoritative submit-time contract.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **rule + trust layer** of the Forms extension. It is not a renderer and not a builder — it is the shared logic library and the authoritative server contract that both consume. It does two things: (1) it **extends** the Form Field Engine's existing per-field conditional-logic evaluator to also drive **section-level** and **page-level** visibility plus **cross-field / conditional-required** rules; and (2) it defines the single **server-trusted enforcement contract** — *recompute visibility from submitted values, then require only visible fields, then `validateFieldValue` per visible field* — that the Form Submission System's submit mutation calls. Client-side visibility is a UX convenience and is **never** trusted server-side.

This system is **reuse-heavy by design.** The Form Field Engine already ships a working field-level conditional-logic evaluator (`show`/`hide`, `and`/`or`, operators `==`, `!=`, `>`, `<`, `contains`, `empty`, `not_empty`) stored as JSON in each field-def's `conditionalLogic`, and a declarative per-type `validateFieldValue()`. Admin authoring reuses the engine's `ConditionalLogicBuilder` verbatim. This PRD does **not** re-implement any of that. It adds the *scopes* (section/page) the engine doesn't have, the *cross-field* rule kind the engine doesn't have, and the *server boundary* the engine deliberately leaves to its hosts (Form Field Engine PRD §7, §8).

**Recommended home:**
- **Shared evaluator/validator code:** the `@convexpress/field-engine` package (working name; see the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)). Section/page-scope evaluation and the `recomputeVisibility` + `validateSubmission` boundary helpers live here so both the Website renderer (client UX) and the Admin submit mutation (server truth) import the *same* pure functions. This is the whole point: one rule engine, two callers, zero drift.
- **Authoring UI:** Admin, at `apps/web/src/routes/_authenticated/_admin/forms/$formId/settings` — it reuses the engine's `ConditionalLogicBuilder` and the Builder's field-settings surface.
- **Server enforcement:** consumed *inside* the Form Submission System's submit mutation at `packages/backend/convex/extensions/forms/`; this system owns the contract, the Submission System owns the mutation that calls it.

**Consumes these ConvexPress systems:**

- **Form Field Engine** (`@convexpress/field-engine`) — the source of the field-level evaluator (`evaluateConditionalLogic(field, valueMap)`), the per-type validator (`validateFieldValue(type, value, settings, required)` → `ValidationResult`), the `ConditionalLogicData` rule shape, and the `ConditionalLogicBuilder`. This system **extends** these; it does not fork them. See the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`).
- **Form Renderer System** — the client-side *consumer* of this system's evaluation functions. The renderer recomputes visibility live as the respondent types and shows inline (UX-only) errors; it is the client half of the same contract whose server half lives here. See the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`).
- **Form Submission System** — the server-side *consumer*. Its public unauthenticated submit mutation calls this system's `recomputeVisibility` → require-visible → `validateFieldValue` pipeline before it writes a single `fieldValue`. See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- **Form Multi-Step & Save-Continue System** — the owner of the `page_break` marker that page-level logic attaches to (skip-page rules). This system reads those markers to compute page visibility; Multi-Step owns navigation. See the Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`).
- **Role & Capability System** — gates the authoring surface. `form.manage_settings` is required to configure logic + validation rules (`requireCan(ctx, "form.manage_settings")`).

**WooCommerce / WordPress analog:** Gravity Forms' conditional logic (field/section/page rules with `gf_apply_rules`) **plus** its server-side `GFFormDisplay::validate()` — the part of Gravity Forms that re-evaluates conditional logic on the server at submit and validates only the fields that should be visible, so a hidden required field never blocks a legitimate entry and a spoofed value for a hidden branch is never accepted.

---

## 1. Overview

### 1.1 Purpose

Provide ConvexPress forms with **conditional show/hide at three scopes** — field, section, and page — and a **server-trusted validation contract** so that what a respondent *sees* (client UX) and what the server *accepts* (truth) are computed by the **same rule engine** but the server is always authoritative. The headline guarantee: **a field hidden by logic cannot be falsely required, and a client claiming a field is hidden is never believed** — the server recomputes visibility from the submitted values and only then decides what is required and valid.

Field-level conditional logic and per-type validation **already exist** in the Form Field Engine. This system fills the three gaps the engine intentionally leaves open: (a) the engine evaluates one field against a value map but has no notion of a *section* or a *page*; (b) the engine's rules are single-field comparisons with no *cross-field* or *conditional-required* relationship; (c) the engine's PRD (§7, §8) states the engine itself enforces nothing on the server — it leaves the submit boundary to its hosts. This system owns (a), (b), and (c).

### 1.2 Scope

> **Reuse-heavy.** Most of the field-level machinery is imported, not written. The new surface area is the scope extension (section/page), the new rule kinds (cross-field, conditional-required), and the authoritative server boundary.

**In scope:**
- **Section-level conditional logic** — show/hide a contiguous group of fields (a section marker / `group`-style cluster) using the same `ConditionalLogicData` rule shape the engine already defines.
- **Page-level conditional logic** — skip/show a whole page (the span between `page_break` markers) so a multi-step form can branch past entire pages.
- **Cross-field rules** — rules whose left and right operands are both fields (e.g. "end date must be after start date"), beyond the engine's field-vs-literal comparison.
- **Conditional-required rules** — a field becomes required *only when* another field has a given value (e.g. "if `contact_method == phone`, then `phone` is required").
- **The canonical rule schema** — one normalized `ConditionalLogicData` shape used by builder, client evaluator, and server evaluator (today the builder and the metabox evaluator disagree — see §3.4; this system reconciles them).
- **The server-trust contract** — pure functions `recomputeVisibility(form, submittedValues)` → `validateSubmission(form, submittedValues, visibility)` that the Submission System calls: recompute visibility from submitted values, require only visible fields, run `validateFieldValue` per visible field, run cross-field rules over visible fields.
- **Zod compilation at the boundary** — compile a Zod schema from the *visible* field definitions and run it alongside the imperative per-type checks at the submit boundary (engine PRD §8).
- **Circular-condition rejection at save** — reject a logic configuration that forms a dependency cycle (field A shows-if B, B shows-if A) when the author saves it.
- **Authoring UI** on the form settings route, reusing the engine's `ConditionalLogicBuilder` and adding section/page-scope + cross-field/conditional-required affordances.

**Out of scope:**
- The field-level evaluator, the per-type `validateFieldValue`, and the `ConditionalLogicBuilder` themselves — owned by the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`). This system **extends** and **reuses** them.
- The submit mutation, entry storage, and event emission — owned by the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`). This system supplies the rule functions that mutation calls; it does not own the mutation.
- Live client rendering, show/hide animation, inline error display — owned by the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`). This system supplies the pure evaluation it calls.
- Page navigation, step state, save-and-resume — owned by the Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`). This system computes *which pages are visible*; Multi-Step decides *how to move between them*.
- Calculations/formulas as logic inputs — owned by the Form Calculation & Pricing System PRD (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`). (Open question §11: whether a calculated value may be a rule operand.)
- The builder UI shell, field CRUD, and form settings persistence plumbing — owned by the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`). This system contributes the logic/validation panel content into that shell.
- Anti-spam validation (captcha/honeypot) — owned by the Form Spam & Security System.

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Field Engine (`@convexpress/field-engine`) | Source of `evaluateConditionalLogic`, `validateFieldValue`, the `ConditionalLogicData` rule shape, and `ConditionalLogicBuilder`. This system extends all four. |
| Form Builder System | Owns the form-settings persistence + the field-settings surface this system's authoring panel plugs into. |
| Form Multi-Step & Save-Continue System | Owns the `page_break` marker that page-level rules attach to. (Soft dependency: page-scope logic is inert on a single-page form.) |
| Role & Capability System | Provides `requireCan` + the `form.manage_settings` capability gating the authoring surface. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Submission System | Calls this system's `recomputeVisibility` + `validateSubmission` inside its submit mutation — the authoritative server gate, before any `fieldValue` write. |
| Form Renderer System | Calls this system's (engine-rooted) evaluation functions client-side for live field/section/page show/hide and inline UX validation. |
| Form Multi-Step & Save-Continue System | Reads computed page visibility to skip pages whose page-level rules evaluate to hidden. |
| Form Confirmation / Notification Systems | Indirect: they fire off the Submission System's post-validation success — they trust that this system already enforced the rules. |

### 2.3 Integration shape

```typescript
// The canonical rule schema (normalized superset of the engine's existing
// ConditionalLogicData). Field-scope rules are exactly today's engine shape;
// section/page scope and the cross-field operand are this system's additions.
type RuleScope = "field" | "section" | "page";

interface ConditionalRule {
  // Left operand: always a sibling field key.
  field: string;
  operator: "==" | "!=" | ">" | "<" | "contains" | "empty" | "not_empty";
  // Right operand. Default: a literal string (today's engine behaviour).
  // When operandKind === "field", `value` is another field key (cross-field).
  value: string;
  operandKind?: "literal" | "field"; // default "literal"
}

interface ConditionalLogicData {
  action: "show" | "hide";
  logic: "and" | "or";
  rules: ConditionalRule[];
}

// What the server boundary computes and returns. The Submission System
// consumes this; it does not re-derive it.
interface VisibilityResult {
  visibleFieldKeys: Set<string>;   // fields the server considers active
  hiddenFieldKeys: Set<string>;    // hidden ⇒ not required, value ignored
  visiblePageIndexes: Set<number>; // pages not skipped by page-level logic
}

interface SubmissionValidationResult {
  ok: boolean;
  // Per-field errors keyed by fieldKey, mapped back to inline display.
  errors: Record<string, string>;
}

// The two pure functions this system owns. Imported by BOTH the renderer
// (client UX) and the submit mutation (server truth). Same code, two callers.
declare function recomputeVisibility(
  form: FormDefinitionForLogic,
  submittedValues: Record<string, string>,
): VisibilityResult;

declare function validateSubmission(
  form: FormDefinitionForLogic,
  submittedValues: Record<string, string>,
  visibility: VisibilityResult,
): SubmissionValidationResult;
```

---

## 3. Architecture

### 3.1 Rule model — reused from the engine, extended to three scopes

The engine already defines `ConditionalLogicData` and evaluates it for a single field against a `valueMap` (`evaluateConditionalLogic(field, valueMap)`), producing a visibility boolean from `action` (`show`/`hide`), `logic` (`and`/`or`), and an array of `{field, operator, value}` rules. This system keeps that shape **unchanged for field scope** and reuses the exact same evaluation primitive for the two new scopes:

- **Field scope (existing):** rule JSON stored on the field-def `conditionalLogic`. Unchanged. The engine owns it.
- **Section scope (new):** the same `ConditionalLogicData` JSON, stored on a **section marker** — implemented as the `conditionalLogic` of a `group` field (the engine's existing container type) or a dedicated section marker in the field-def `settings`. Hiding the section hides all fields inside it (and, server-side, marks them all not-required).
- **Page scope (new):** the same `ConditionalLogicData` JSON, stored on a **`page_break` marker's `settings`** (the marker is owned by the Multi-Step system). A hidden page removes every field on that page from the visible set.

Because all three scopes share one rule shape, the same operator semantics, the same `and`/`or` combinator, and the same `show`/`hide` inversion apply everywhere. There is exactly **one** rule-evaluation primitive in the codebase.

### 3.2 New rule kinds this system adds

1. **Cross-field rules** — the engine compares a field to a *literal* (`value` is a string). This system adds `operandKind: "field"`, so `value` is resolved as another field's value before comparison (e.g. `endDate > startDate`). Backward compatible: absent `operandKind` means `"literal"`, i.e. exactly today's behaviour.
2. **Conditional-required rules** — a field-def carries an optional `requiredWhen: ConditionalLogicData`. The field is required **iff** it is visible **and** `requiredWhen` evaluates true (or the field's static `required` flag is set). This is what makes "phone required only if contact method is phone" expressible without lying to the static `required` flag.

Both new kinds are pure additions to the rule data; both are evaluated by the same combinator (`and`/`or` over per-rule booleans) the engine already uses.

### 3.3 The server-trust contract (the core deliverable)

This is the single most important thing this system owns. At submit time, inside the Form Submission System's mutation, the server runs this exact sequence — **never trusting the client's idea of visibility**:

```
                 submitted values (slug + value map)  ← from a possibly hostile client
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ 1. recomputeVisibility(form, submittedValues)                  │
   │    - re-evaluate EVERY field/section/page rule from the        │
   │      SUBMITTED VALUES (not any client-sent visibility flag)    │
   │    - resolve cross-field operands from submitted values        │
   │    - produce {visibleFieldKeys, hiddenFieldKeys,               │
   │      visiblePageIndexes}                                       │
   └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ 2. require ONLY visible fields                                 │
   │    - a hidden field is treated as NOT required, full stop      │
   │    - a visible field is required iff: static `required` OR      │
   │      `requiredWhen` evaluates true                             │
   └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ 3. validateFieldValue(type, value, settings, required)         │
   │    per VISIBLE field (engine validator, reused verbatim)       │
   │    + cross-field rules over visible fields                      │
   │    + a Zod schema compiled from the VISIBLE field defs          │
   └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ 4. drop values for hidden fields; persist only visible values  │
   │    (the Submission System owns the write)                      │
   └──────────────────────────────────────────────────────────────┘
```

The two pure functions `recomputeVisibility` and `validateSubmission` live in the shared package so the **client renderer calls the identical code** for its live UX — guaranteeing the respondent's preview matches the server's verdict in the happy path, while the server remains the sole authority in the adversarial path.

### 3.4 Reconciling the two existing rule schemas (a real bug this system fixes)

There is a live inconsistency in the current code that this system must canonicalize, or section/page logic will inherit it:

- The engine's **authoring** builder (`ConvexPress-Admin/apps/web/src/components/custom-fields/ConditionalLogicBuilder.tsx`) writes rules as `{ action, logic, rules: [{ field, operator, value }] }` — note the key is **`field`**, and there is **no `enabled`** flag (empty `rules` ⇒ `onChange(undefined)`).
- The engine's **metabox evaluator** (`ConvexPress-Admin/apps/web/src/components/custom-fields/metabox/MetaboxRenderer.tsx`) reads rules as `{ enabled, action, logic, rules: [{ fieldKey, operator, value }] }` — note the key is **`fieldKey`** and it requires **`logic.enabled`** to be truthy.

A rule authored by the builder today therefore does **not** activate in the metabox renderer (`fieldKey` is `undefined`, `enabled` is absent). This system adopts the **builder's shape as canonical** (`field`, no `enabled`; presence of rules = active) and provides a tiny normalizer for any legacy `{fieldKey, enabled}` JSON, so all three callers (builder, client evaluator, server evaluator) agree. The form renderer (Form Renderer PRD §6) already evaluates against `f.key`, consistent with the canonical choice. Fixing this is in scope because section/page logic reuses the same evaluator and would otherwise be dead on arrival.

### 3.5 Where the code lives

```
@convexpress/field-engine (shared — extended by this system)
├── conditional-logic.ts     evaluateConditionalLogic(rule, valueMap)   [engine; reused]
├── validate.ts              validateFieldValue(type, value, settings, required) [engine; reused]
├── logic/scope.ts           evaluateScope(scope, marker, valueMap)     [NEW — section/page]
├── logic/cross-field.ts     resolveOperand + cross-field comparison     [NEW]
├── logic/required.ts        isFieldRequired(field, visibility, values)  [NEW — conditional-required]
├── logic/normalize.ts       canonicalizeRule(json) (legacy fieldKey/enabled → field) [NEW]
├── logic/visibility.ts      recomputeVisibility(form, values)           [NEW — server contract]
├── logic/submit.ts          validateSubmission(form, values, visibility)[NEW — server contract]
└── logic/zod.ts             compileZodFromVisibleFields(form, visibility)[NEW]

Admin (authoring)
└── routes/_authenticated/_admin/forms/$formId/settings  → reuses ConditionalLogicBuilder
                                                            + section/page/cross-field affordances

Backend (enforcement — owned by Submission System, contract owned here)
└── packages/backend/convex/extensions/forms/submit.ts   → imports recomputeVisibility + validateSubmission
```

---

## 4. Data Model

**No new tables.** This system stores rules entirely inside existing field-definition JSON columns the engine already owns (Form Field Engine PRD §5). It introduces no schema, consistent with the v2 additive-only contract.

| Rule kind | Where it lives | Shape |
|---|---|---|
| Field-scope show/hide | field-def `conditionalLogic` (JSON) | `ConditionalLogicData` (engine's existing column — unchanged) |
| Section-scope show/hide | the section marker's `conditionalLogic` (a `group` field-def, or a section marker in `settings`) | `ConditionalLogicData` |
| Page-scope skip/show | the `page_break` marker's `settings.conditionalLogic` (JSON) | `ConditionalLogicData` |
| Cross-field operand | inside any rule: `operandKind: "field"` + `value` = a field key | additive field on `ConditionalRule` |
| Conditional-required | field-def `settings.requiredWhen` (JSON) | `ConditionalLogicData` |

Because every rule is just additive JSON on existing `fieldDefinitions` rows (`conditionalLogic`, `settings`), there is nothing to migrate and nothing to add to `schema.ts`. The `fieldValues` table (engine §5: `entityType: "form_submission"`, `entityId: <submissionId>`) is written only by the Submission System, and only for fields this system marks visible.

```
fieldDefinitions (engine-owned)
   ├─ conditionalLogic (JSON)  ── field-scope rule          ┐
   ├─ settings.requiredWhen (JSON) ── conditional-required  ├─ all read by recomputeVisibility / validateSubmission
   └─ settings.conditionalLogic (JSON) on section/page_break markers ── section/page scope ┘
                                          │
                          (server)  recomputeVisibility → validateSubmission
                                          │
                                  visible values only ──> fieldValues (Submission System writes)
```

---

## 5. Routes

### 5.1 Admin route (authoring)

| Route | Path | Layout | App | Auth Required | Roles |
|---|---|---|---|---|---|
| Form Settings (logic + validation authored here) | `/admin/forms/$formId/settings` | `_admin` | Admin | Yes | Administrator, Editor |

- **Auth:** the route sits under `_authenticated/_admin` (Convex Auth). It is admin-only; there is no public route for this system — rules are *authored* in Admin and *enforced* server-side, with no respondent-facing surface of its own.
- **Surface:** the logic/validation panel is a section of the form-settings page owned by the Form Builder System; this system contributes the conditional-logic + validation-rule authoring affordances into that page. Per-field conditional logic is also editable inline in the field-settings drawer via the reused `ConditionalLogicBuilder` (Builder PRD).
- **No public route.** Unlike the Renderer, this system renders nothing to respondents. Its client-side behaviour runs *inside* the Renderer's components.

---

## 6. Actions

| Action | Capability | Description | Roles | Triggers Events |
|---|---|---|---|---|
| Configure form logic & validation | `form.manage_settings` | Author/edit field, section, and page conditional logic; cross-field and conditional-required rules | Administrator, Editor | none |

- **Enforcement.** Every mutation that persists logic/validation rules calls `requireCan(ctx, "form.manage_settings")` (signature: `requireCan(ctx, capability)` → `UserDoc`, throwing `UNAUTHORIZED`/`FORBIDDEN`; see `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts`). This is the same capability the Builder uses for the settings surface — this system does not introduce a new capability, it reuses `form.manage_settings`.
- **Capability registration.** Per the admin-side hard rule, extensions *surface* capabilities; the Role & Capability expert *registers* them. `form.manage_settings` is owned by the Forms extension manifest, not redefined here.
- **No respondent action.** Submitting a form is the Form Submission System's action; this system contributes the validation step inside it but owns no respondent-facing action of its own.

---

## 7. Events / Notifications

**None owned.** This system emits no events and triggers no notifications.

- The only side effect at submit time is *acceptance or rejection*, and the accepting mutation (and its `form.submitted` event) is owned by the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- Notifications (autoresponder, admin alert) are owned by the Form Notification System and fire off the Submission System's event, not this system.

This section is intentionally empty to keep this system a pure rule/contract layer.

---

## 8. Validation Rules

### 8.1 Per-field validation — reused from the engine (unchanged)

Per-type validation is the engine's `validateFieldValue(type, value, settings, required)` → `ValidationResult { valid, error? }` (`ConvexPress-Admin/packages/backend/convex/helpers/customFieldValidation.ts`). This system **calls it verbatim** for every visible field at the server boundary. It covers: empty/required check; `text`/`textarea` max length; `number`/`range` min/max + numeric; `email` + `url`/`oembed` regex; `password` min length; `select`/`checkbox`/`radio`/`button_group` choice membership; `true_false`; `date_picker`/`date_time_picker`/`time_picker` format; `color_picker` hex/rgba; `link`/`relationship`/`gallery`/`repeater`/`flexible_content` JSON + min/max; and pass-through for layout types (`message`/`accordion`/`tab`). This system adds **nothing** to per-type rules — it only decides *which* fields get validated (the visible ones) and *whether* each is required.

### 8.2 Cross-field / conditional-required rules — added by this system

| Rule | Semantics |
|---|---|
| **Cross-field comparison** | A rule with `operandKind: "field"` resolves both operands from the submitted values and applies the same operator set (`==`, `!=`, `>`, `<`, `contains`, `empty`, `not_empty`). Numeric operators coerce via `Number()` exactly as the engine evaluator does. Only evaluated when **both** referenced fields are visible (a comparison against a hidden field is treated as vacuously satisfied — see §10). Example: `endDate > startDate`. |
| **Conditional-required** | A field with `settings.requiredWhen` is required iff it is visible **and** `requiredWhen` evaluates true, OR its static `required` flag is set. Drives "required only when…" without abusing the static flag. |
| **Required ⇒ visible only** | The static `required` flag is honored **only when the field is visible**. A hidden required field is *not* required (§9). This is the rule the engine PRD §8 explicitly delegates to this system. |

### 8.3 The Zod boundary

At the submit boundary, this system compiles a Zod schema from the **visible** field definitions (`compileZodFromVisibleFields`) and runs it alongside the imperative `validateFieldValue` checks (engine PRD §8: "the form host compiles a Zod schema from field definitions and runs it alongside `validateFieldValue`"). Zod gives structural/shape guarantees (types, required presence) at the boundary; the imperative per-type checks remain the source of truth for type-specific rules (choice membership, min/max, formats). Both run; both must pass.

### 8.4 Authoring-time validation

| Rule | When | Behaviour |
|---|---|---|
| **Circular condition** | On save | Reject a rule set whose field/section/page dependency graph contains a cycle (A shows-if B, B shows-if A). Surface the offending fields. (§9) |
| **Dangling reference** | On save | A rule referencing a deleted/renamed field key is flagged; the author must repoint or remove it. |
| **Operator/type sanity** | On save (warning) | Warn when an operator is unlikely to be meaningful for the operand's field type (e.g. `>` on a `true_false`) — see §10 for runtime handling. |

---

## 9. Business Rules

- **Client visibility = UX only; server is authoritative.** `evaluateConditionalLogic` on the client decides what the respondent *sees*. It never decides what is *accepted*. The server re-runs `recomputeVisibility` from the submitted values and is the sole source of truth. (Form Renderer PRD §9; engine PRD §8.)
- **A hidden field cannot be falsely required.** Required-ness is evaluated **after** visibility. If a field is hidden (by field/section/page rule), it is treated as not-required and its value is ignored — even if its static `required` flag is set or a malicious client omits it. This is the system's headline guarantee.
- **Client-claimed visibility is never trusted.** The submit payload carries values, not visibility flags. Even if a client sends a "this was visible" assertion, the server discards it and recomputes. A spoofed value for a field that the server computes as hidden is dropped, not accepted.
- **One rule engine, two callers.** The client renderer and the server mutation import the *same* pure functions from the shared package. Divergence between "what the user saw" and "what the server enforced" is therefore impossible in the happy path and resolved in the server's favor in the adversarial path.
- **Hidden ⇒ omitted from persisted values.** Fields the server computes as hidden are excluded from the written `fieldValues`, so stale values from an inactive branch never persist. (Mirrors Form Renderer PRD §9 "Hidden ⇒ omitted" on the client; the server enforces it regardless of what the client sent.)
- **Circular conditions are rejected at save, not at submit.** A cycle is a configuration error, caught when the author saves, so respondents never hit an unresolvable form. At runtime, defensive evaluation treats an unresolved cycle as "show" (fail-open for visibility) rather than throwing.
- **Page-scope logic is inert without page breaks.** On a single-page form, page-level rules have no effect (there are no `page_break` markers to attach to). They activate only under the Multi-Step system.
- **Canonical rule shape.** All rules use the engine's builder shape (`{action, logic, rules: [{field, operator, value, operandKind?}]}`); legacy `{fieldKey, enabled}` JSON is normalized on read (§3.4).

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| **Required field hidden by logic** | Not required. Visibility is computed first; a hidden field is dropped from the required set and its (absent) value is fine. The headline guarantee — enforced server-side regardless of client. |
| **A field is conditional on a field that lives on a skipped page** | The controlling field's value is still present in the submitted value map (the respondent may have entered it before the page was skipped, or it may be a default). `recomputeVisibility` resolves page visibility and field visibility from the **same** submitted value map in dependency order; if the controlling field is itself on a hidden page, its value is treated as empty for downstream rule evaluation, so the dependent field resolves against an empty operand (deterministic, not undefined). |
| **Operator/type mismatch at runtime** (e.g. `>` on a non-numeric, `contains` on a number) | Mirror the engine evaluator's coercion exactly: numeric operators use `Number()` (a `NaN` comparison yields `false`); `contains` coerces operands to string. No throw — a mismatched rule evaluates to a defined boolean, never an exception. Authoring warns (§8.4) but runtime never crashes. |
| **Cross-field rule referencing a hidden field** | The referenced field's value is treated as empty/absent; the comparison is evaluated against that empty operand (vacuously satisfied for "must be after" style rules so a hidden operand never blocks submit). Prevents a hidden branch from making a visible field unsatisfiable. |
| **Circular dependency authored** | Rejected on save (§8.4). If somehow persisted (e.g. imported JSON), runtime cycle detection breaks the cycle by treating the unresolved node as "show" (fail-open) so the form remains submittable. |
| **Rule references a deleted/renamed field key** | Authoring flags it (§8.4). At runtime an unknown left operand resolves to empty; the rule evaluates deterministically and never throws. |
| **Client sends a value for a server-hidden field** | Dropped. The value is not validated, not required, and not persisted. A client cannot force-accept a hidden branch's data. |
| **Client omits a value for a server-visible required field** | Rejected. The server requires it because *it* computed the field visible — independent of what the client rendered. |
| **`show` vs `hide` action inversion** | Reused from the engine: `action === "show"` ⇒ visible when rules match; `action === "hide"` ⇒ hidden when rules match. Identical semantics across all three scopes. |
| **Section hidden but a field inside has its own field-level rule** | Section visibility gates first: a field inside a hidden section is hidden regardless of its own rule (the field-level rule can only further restrict, never re-show, a hidden section). |
| **Empty rule set** | Per the canonical shape, no rules ⇒ always visible / not conditionally required (the builder emits `undefined` for an empty rule set). |

---

## 11. Implementation Checklist

**Phase 1 — canonicalize the rule schema (unblocks everything)**
- [ ] Add `logic/normalize.ts`: `canonicalizeRule(json)` mapping legacy `{fieldKey, enabled}` → canonical `{field}` (no `enabled`); presence of rules = active (§3.4).
- [ ] Point the engine's metabox evaluator and the form renderer at the canonical shape so builder-authored rules actually activate.
- [ ] Unit-test parity: a rule authored by `ConditionalLogicBuilder` evaluates identically in client and server evaluators.

**Phase 2 — scope extension (section + page)**
- [ ] `logic/scope.ts`: `evaluateScope` reusing `evaluateConditionalLogic` for section markers (`group`-style cluster) and `page_break` markers.
- [ ] Wire section-scope storage on the section marker's `conditionalLogic`; page-scope on `page_break` `settings.conditionalLogic`.
- [ ] Section gating overrides inner field rules (hidden section ⇒ all inner fields hidden).

**Phase 3 — new rule kinds**
- [ ] `logic/cross-field.ts`: `operandKind: "field"` operand resolution + comparison reusing the engine's operator/coercion semantics.
- [ ] `logic/required.ts`: `isFieldRequired(field, visibility, values)` honoring static `required` (visible-only) and `settings.requiredWhen`.

**Phase 4 — the server-trust contract**
- [ ] `logic/visibility.ts`: `recomputeVisibility(form, submittedValues)` → `{visibleFieldKeys, hiddenFieldKeys, visiblePageIndexes}`, resolving field/section/page in dependency order.
- [ ] `logic/submit.ts`: `validateSubmission(form, submittedValues, visibility)` — require visible-only, `validateFieldValue` per visible field, cross-field rules over visible fields.
- [ ] `logic/zod.ts`: `compileZodFromVisibleFields` run alongside the imperative checks at the boundary.
- [ ] Provide both functions as pure package exports; the Submission System imports them inside its submit mutation (no admin coupling — engine CI guard applies).

**Phase 5 — authoring + guards**
- [ ] Reuse `ConditionalLogicBuilder` on `/admin/forms/$formId/settings`; add section/page-scope selectors + cross-field operand + `requiredWhen` affordances.
- [ ] `requireCan(ctx, "form.manage_settings")` on every rule-persisting mutation.
- [ ] Circular-condition + dangling-reference rejection on save (§8.4); operator/type sanity warnings.

**Phase 6 — verification**
- [ ] Adversarial tests: hidden required field accepted; spoofed hidden-branch value dropped; omitted visible-required value rejected.
- [ ] Cross-page conditional resolves deterministically (controlling field on a skipped page → empty operand).
- [ ] Client/server parity test over a form exercising all three scopes + both new rule kinds.

---

## 12. Open Questions

- **Section marker representation:** reuse the engine's `group` container as the section unit, or introduce a dedicated lightweight `section` marker in field-def `settings`? Default: reuse `group` (zero new types), revisit if authors need sections that don't visually nest.
- **Calculated values as rule operands:** may a `calculation` field (Form Calculation & Pricing System) be the right operand of a cross-field rule, or the trigger of a conditional-required rule? Default: defer — calculations are evaluated by their own system; expose a read seam only if demand appears. See the Form Calculation & Pricing System PRD (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`).
- **Operator coercion strictness:** keep the engine's lenient `Number()`/string coercion (no runtime throw) for cross-field comparisons, or add typed comparison per operand field type (date-aware `>` for date fields)? Default: lenient to match the engine; add date-aware comparison only if date cross-field rules prove error-prone.
- **`requiredWhen` vs static `required` precedence:** if both are set, OR them (current §8.2 rule) or let `requiredWhen` override? Default: OR (either makes it required) — simplest mental model for authors.
- **Where Zod compilation runs:** in the shared package (portable, importable by the Website renderer too) or only server-side? Default: shared package, so the renderer can run the identical Zod schema for inline UX, preserving the "one engine, two callers" invariant.

---

## 13. Cross-References

- Dependency (rule engine + validator + builder): Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Client consumer (live show/hide + inline UX errors): Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)
- Server consumer (calls `recomputeVisibility` + `validateSubmission` at submit): Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Page-break owner (page-scope attaches here): Form Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)
- Authoring shell (settings surface this panel plugs into): Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)
- Source files reused: `ConvexPress-Admin/apps/web/src/components/custom-fields/ConditionalLogicBuilder.tsx`, `ConvexPress-Admin/packages/backend/convex/helpers/customFieldValidation.ts`, `ConvexPress-Admin/apps/web/src/components/custom-fields/metabox/MetaboxRenderer.tsx`
- Capability helper: `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts` (`requireCan`)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Logic & Validation System · **Plugin:** ConvexPress Forms (v2)
