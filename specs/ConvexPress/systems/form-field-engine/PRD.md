# PRD: Form Field Engine (Shared)

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). First system in the Forms dependency tree; everything else consumes it.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** A **host-agnostic field-engine package**, extracted from the existing **Custom Field System** (`customFields`), consumed by three hosts: the Forms builder (admin authoring), the Forms public renderer (Website), and the existing admin metaboxes. It is shared infrastructure, not a user-facing CRUD system.

**Recommended home:** a shared package, e.g. `packages/field-engine/` (working name `@convexpress/field-engine`), importable by both the Admin app and the Website app. (Open question — see §11. Parked under the Forms plugin in Airtable for now; may be re-homed to Core.)

**Consumes these ConvexPress systems:**

- **Custom Field System** (`customFields`) — the *source* of the engine. Provides the 30 field types, the `FIELD_RENDERERS` registry, compound field components (`FieldGroup`/`FieldRepeater`/`FieldFlexibleContent`), the `validateFieldValue()` validator, and the `fieldDefinitions` / `fieldValues` / `fieldGroups` data model. This PRD's core work is **extracting** that engine cleanly, not rebuilding it.
- **Media System** — file/image/gallery field types upload through Convex file storage.
- **Event Dispatcher** — the engine itself emits nothing; its host systems do.

**WooCommerce / WordPress analog:** Advanced Custom Fields' field API + Gravity Forms' `GF_Field` framework — the typed-field registry, render, and validation layer shared across hosts.

---

## 1. Overview

### 1.1 Purpose

Extract the field-definition / render / validate machinery currently embedded in the `customFields` admin extension into a **host-agnostic engine** so a single field catalog, renderer set, conditional-logic evaluator, and validator can power: (a) the Forms public renderer, (b) the Forms admin builder, and (c) the existing post/page metaboxes — with no duplication and no admin-app coupling leaking into the public Website.

### 1.2 Scope

**In scope:**
- A field-type registry (30 types) with a stable `FieldRendererProps` contract.
- Portable simple-field renderers (17) usable in Admin *and* Website.
- Compound-field orchestration (`group`, `repeater`, `flexible_content`) as a host-agnostic contract (the current renderers are admin-only stubs — §6).
- A relational-field data-fetching seam (inject query functions; do not hard-wire `@backend/convex`).
- The conditional-logic evaluator (`show`/`hide`, `and`/`or`, operators) as a pure function.
- The declarative per-type validator (`validateFieldValue`) as a pure, server-importable function.
- Value (de)serialization (`parseFieldValue`).

**Out of scope:**
- The form data model (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)).
- The builder UI (the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)).
- Calculations/formulas — the engine has none today (the Form Calculation & Pricing System PRD (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`)).
- Multi-page/wizard concerns (the Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Custom Field System (`customFields`) | The engine is extracted from it; it is the source of truth for types/renderers/validator/schema. |
| Media System | Upload-backed field types. |

### 2.2 Systems that depend on this

Every other Forms system: Builder, Renderer, Submission, Logic & Validation, Multi-Step, Calculation & Pricing, Merge Tags, Actions & Feeds, plus the future metabox host. This is the root of the Forms dependency tree.

---

## 3. Architecture

### 3.1 The extraction

Today the engine lives inside the admin app under `ConvexPress-Admin/apps/web/src/components/custom-fields/`. The render registry and logic evaluator are clean (React + presentational only), but two seams leak host specifics:

1. **Relational renderers** (`post_object`, `page_link`, `relationship`, `taxonomy`, `user`, `link`) hard-import `@backend/convex/_generated/api` and query admin tables.
2. **Compound orchestration** (rendering a repeater's sub-fields) lives in the admin-only `MetaboxRenderer`; the shared `FieldRepeater`/`FieldGroup` components are presentational stubs.

The extraction moves the **portable core** into a shared package and leaves **host-specific bindings** in each app.

```
@convexpress/field-engine (shared)
├── types.ts                 FieldDefinition, FieldValue, FieldRendererProps, ConditionalLogicData
├── registry.ts              FIELD_RENDERERS (component map) + SUPPORTED_FIELD_TYPES
├── renderers/               17 simple + 3 layout renderers (portable)
├── compound/                FieldGroup / FieldRepeater / FieldFlexibleContent contracts
├── conditional-logic.ts     evaluateConditionalLogic(field, valueMap) -> boolean
├── validate.ts              validateFieldValue(type, value, settings, required)
└── serialize.ts             parseFieldValue / encodeFieldValue

Host-specific (stays per app)
├── Admin:   MetaboxRenderer + relational renderers bound to admin Convex
├── Website: FormRenderer + relational renderers bound via injected query fns
└── Forms:   the builder consumes the registry to author definitions
```

### 3.2 Host-agnostic seam (the contract)

- Renderers receive data via props only: `(field, value, onChange, context)`. No direct Convex imports.
- Relational lookups are injected: the host passes a `resolveRelation(kind, query)` function; the engine never imports a generated API.
- Compound orchestration is an interface the host implements (how to render N rows of sub-fields), so Admin and Website can each supply their renderer while sharing the catalog + contracts.

---

## 4. Field Type Catalog (30)

- **Basic (7):** text, textarea, number, range, email, url, password
- **Content (5):** image, file, wysiwyg, oembed, gallery
- **Choice (5):** select, checkbox, radio, button_group, true_false
- **Relational (6):** link, post_object, page_link, relationship, taxonomy, user
- **Date/Time (4):** date_picker, date_time_picker, time_picker, color_picker
- **Layout, no value (3):** message, accordion, tab
- **Compound / container (3):** group, repeater, flexible_content

Forms-specific additions (owned by other systems, registered into this catalog): `page_break` (Multi-Step), `calculation` (Calculation & Pricing), `captcha`/`honeypot` (Spam & Security), `payment`/`product` (Commerce Action). The engine exposes a registration API so those systems add types without forking the registry.

---

## 5. Data Model

**No new tables.** The engine reuses the `customFields` schema wholesale:

- `fieldDefinitions` — `groupId, label, name, key, type, instructions, required, defaultValue, settings (JSON), conditionalLogic (JSON), wrapper*, menuOrder, parentFieldId` (recursive for compounds).
- `fieldValues` — `entityType, entityId, fieldKey, fieldName, value (JSON), updatedBy, updatedAt`. Generic by design: a form submission stores values as `entityType: "form_submission"`, `entityId: <submissionId>`.
- `fieldGroups` — group definitions + location rules (location rules are a *host* concern, not engine).

The Forms host attaches a field-set to a Form (vs. metaboxes attaching to a post type). The value model is identical, which is the whole reason this extraction is high-leverage.

---

## 6. Public API (package exports)

| Export | Kind | Notes |
|---|---|---|
| `FIELD_RENDERERS` | registry | type-slug → React component |
| `registerFieldType(def)` | fn | lets other systems add types (page_break, calculation, captcha, payment) |
| `FieldRenderer` | component | renders one field from `(field, value, onChange, ctx)` |
| `evaluateConditionalLogic(field, valueMap)` | fn | pure; returns visibility boolean |
| `validateFieldValue(type, value, settings, required)` | fn | pure; server + client; **wrap with Zod** at the form boundary |
| `parseFieldValue` / `encodeFieldValue` | fn | JSON (de)serialization per type |
| `SUPPORTED_FIELD_TYPES` | const | catalog list |

---

## 7. Routes / Actions / Events / Notifications

**N/A — this is a library, not a user-facing system.** It owns no routes, no capabilities, no events, and no notifications. Its consumers own those (see the Builder, Renderer, and Submission PRDs). This section is intentionally empty to keep the engine a pure dependency.

---

## 8. Business Rules & Constraints

- **Server-trusted validation.** `validateFieldValue` runs on the Convex mutation boundary at submit; client-side validation is UX only. A field hidden by conditional logic is treated as not-required server-side (the Logic & Validation System owns that rule).
- **No admin coupling in the shared package.** Anything importing `@backend/convex` or admin-shell stays host-side. CI guard: the shared package must not import either.
- **SSR-safe.** Website renders forms under TanStack Start SSR; renderers must not assume `window` at module load.
- **Zod at the boundary.** The form host compiles a Zod schema from field definitions and runs it alongside `validateFieldValue` (the imperative per-type checks remain the source of per-type rules).

---

## 9. Edge Cases

| Scenario | Handling |
|---|---|
| Relational field rendered on Website | Host injects a query fn; engine never imports admin API. |
| Repeater nested inside a repeater | Compound contract is recursive; orchestration recurses host-side. |
| Unknown field type at render | Render a safe fallback + log; never throw in the public renderer. |
| Layout field (message/accordion/tab) in a submission | No stored value; skipped by serializer + validator. |

---

## 10. Implementation Checklist

**Phase 1 — extract**
- [ ] Create `packages/field-engine/` with types, registry, simple renderers, conditional-logic, validate, serialize.
- [ ] Add CI guard: shared package imports no `@backend/convex` / admin-shell.

**Phase 2 — decouple**
- [ ] Convert relational renderers to injected `resolveRelation`.
- [ ] Promote compound orchestration to a host-implemented interface; replace admin-only stubs.

**Phase 3 — dual-host**
- [ ] Admin (`MetaboxRenderer`) consumes the package (no behavior change for existing customFields).
- [ ] Website `FormRenderer` consumes the package (the Renderer PRD builds on this).
- [ ] Registration API verified by adding `page_break` from the Multi-Step system.

---

## 11. Open Questions

- **Ownership:** Forms-owned vs Core-owned (the existing Custom Field System is the other consumer). Currently linked under the Forms plugin in Airtable with a Depends-On to Custom Field System; re-home to Core if metabox parity work starts first.
- **Package boundary:** one `field-engine` package vs. split `field-engine-core` (logic/validate/serialize, framework-agnostic) + `field-engine-react` (renderers). Default: single package; split only if a non-React consumer appears.

---

## 12. Cross-References

- Source: Custom Field System PRD (`specs/ConvexPress/systems/custom-field-system/PRD.md`)
- Consumers: Form Builder (`specs/ConvexPress/systems/form-builder-system/PRD.md`), Form Renderer (`specs/ConvexPress/systems/form-renderer-system/PRD.md`), Form Submission (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Field Engine (Shared) · **Plugin:** ConvexPress Forms (v2)
