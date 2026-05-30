# PRD: Form Builder System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). Second system in the Forms dependency tree; consumes the Form Field Engine.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **admin visual form designer** — the authoring surface of the Forms extension. It owns the `forms` table and the full-page admin CRUD + builder shell. It is the system that turns the host-agnostic Form Field Engine into a usable product: an editor places fields on a canvas, configures per-field and per-form settings, and persists a Form.

**Code lives at:**
- Backend: `packages/backend/convex/extensions/forms/forms.ts` (+ `schema.ts` fragment for the `forms` table).
- Manifest/nav: `apps/web/src/extensions/forms/` (extension manifest, `pluginId: "forms"`, nav entries, capability declarations).
- Admin routes: `apps/web/src/routes/_authenticated/_admin/forms/`.

**Airtable metadata:** Category **Content & Marketing** · Layer **Admin** · Complexity **Complex** · Priority **P0 - Critical**.

**Consumes these ConvexPress systems:**

- **Form Field Engine** — the drag-drop field builder UI, the `FIELD_RENDERERS` registry, and the field-definition model (`fieldDefinitions` / `fieldGroups`). The Builder canvas *is* the engine's palette + sortable list; the FieldSettingsPanel edits engine field definitions. The Builder builds **no** field-rendering code of its own.
- **Role & Capability System** — every mutation gates on `requireCan(ctx, "form.<cap>")`; capabilities are granted to Administrator + Editor.
- **Event Dispatcher** — emits `form.created`, `form.updated`, `form.deleted` on lifecycle transitions (no notifications).
- **Plugin registry (v2 scanner)** — every admin route wraps `<PluginGuard pluginId="forms">`; the manifest is merged in by codegen, never hand-edited into `registry.ts`.

**WooCommerce / WordPress analog:** Gravity Forms' **Form Editor** (`/wp-admin/admin.php?page=gf_edit_forms`) — the form list, the drag-drop field editor with its Fields / Settings / Confirmations tabs, and the per-form settings screen. This system is the ConvexPress equivalent of the editor shell; the engine is the `GF_Field` framework underneath it.

---

## 1. Overview

### 1.1 Purpose

Provide the admin-facing visual designer for Forms: create, edit, duplicate, and archive forms; place and order fields on a canvas via the Form Field Engine's drag-drop builder; and configure both per-field settings (label, required, conditional logic, validation) and per-form settings (scheduling window, entry limit, require-login, confirmation/notification references). This system **owns the `forms` table** and the admin CRUD around it; it **reuses** the engine for everything field-shaped.

### 1.2 Scope

**In scope:**
- The `forms` table (id, title, slug, status, description, settings JSON, audit fields) with `by_slug` + `by_status` indexes.
- Admin CRUD: `form.create`, `form.update`, `form.delete` (soft-delete → `archived`), `form.duplicate`, `form.view`.
- Four full-page admin routes (list, new, builder, settings) — each wrapped in `<PluginGuard pluginId="forms">`.
- The **Builder shell**: the canvas that hosts the engine's field palette + sortable field list, plus the field-settings panel and the builder's Fields / Logic / Calculations tab chrome (the *tabs* are owned here; their *contents* are owned by the engine and the Logic/Calculation systems).
- Attaching the engine's field-definition set to a Form (the Form is the owner: `entityType: "form"`, `entityId: <formId>`).
- Lifecycle events (`form.created` / `form.updated` / `form.deleted`).

**Out of scope:**
- The field-type catalog, renderers, conditional-logic evaluator, and validator (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)).
- Public rendering of a built form (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)).
- Storing/listing/managing submitted entries (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) + the Form Entry Management System PRD (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`)).
- Conditional-logic *authoring semantics* and server-trusted validation rules (the Form Logic & Validation System PRD (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`)) — the Builder only hosts the Logic tab UI.
- Calculations/pricing fields (the Form Calculation & Pricing System PRD (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`)) — the Builder only hosts the Calculations tab UI.
- Confirmations and notifications behavior (the Form Confirmation System / Form Notification System PRDs) — the Builder's settings JSON only stores *references* to them.

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why Required |
|---|---|
| Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`) | Source of the drag-drop builder UI, `FIELD_RENDERERS`, and the `fieldDefinitions` model the Builder authors against. Hard dependency — this is the root of the Forms tree. |
| Role & Capability System | `requireCan(ctx, "form.<cap>")` gating on every mutation; grants to Administrator + Editor. |
| Event Dispatcher | Lifecycle event emission. |
| Plugin registry (v2 scanner) | `PluginGuard` route gating + manifest discovery for `pluginId: "forms"`. |

### 2.2 Systems that depend on this

| System | Integration Point |
|---|---|
| Form Renderer System | Reads a published `forms` row + its attached field definitions to render the public form. |
| Form Submission System | Resolves a Form by `slug`, enforces `settings` (scheduling/limit/require-login) at submit. |
| Form Logic & Validation System | Supplies the Builder's **Logic** tab; persists `conditionalLogic` onto engine field definitions. |
| Form Calculation & Pricing System | Supplies the Builder's **Calculations** tab; registers `calculation` field types into the engine catalog. |
| Form Entry Management / Confirmation / Notification systems | Reference a Form by id; `settings` stores their refs. |

---

## 3. Routes

All routes are admin-only, `App = Admin`, `auth = true`, and live under `apps/web/src/routes/_authenticated/_admin/forms/`. **Every route component wraps its tree in `<PluginGuard pluginId="forms">`** so the screens 404/redirect when the Forms extension is disabled.

| Route | Path | Layout | Auth | Roles | Purpose |
|---|---|---|---|---|---|
| Forms list | `/admin/forms` | `_admin` | Yes | Administrator, Editor | Table of all non-deleted forms; create / duplicate / archive / open actions. |
| New Form | `/admin/forms/new` | `_admin` | Yes | Administrator, Editor | Minimal create form (title → slug); on submit, `form.create` then navigate to the builder. |
| Builder canvas | `/admin/forms/$formId/edit` | `_admin` | Yes | Administrator, Editor | The drag-drop builder. Tabs: **Fields** (engine palette + canvas), **Logic** (Logic & Validation system), **Calculations** (Calculation & Pricing system). |
| Form Settings | `/admin/forms/$formId/settings` | `_admin` | Yes | Administrator, Editor | Per-form settings: scheduling window, entry limit, require-login, confirmation/notification references, status (draft/publish/archive). |

**Navigation pattern (Base UI, full-page):** Per the admin-shell convention, there are **no modal content editors**. The builder and settings are full pages reached by router navigation (`/admin/forms/$formId/edit`, `.../settings`). Dialogs are reserved for **confirmations only** (e.g., "Archive this form?", "Duplicate this form?"). Tabs within the builder are in-page route state, not separate routes, so the canvas state persists while switching Fields ↔ Logic ↔ Calculations.

---

## 4. Data Model

This system **owns the `forms` table**. Form *fields* are not stored here — they reuse the Form Field Engine's `fieldDefinitions` model, attached to a form via `entityType: "form"`, `entityId: <formId>` (the form is the owner, exactly as a post type is the owner for metaboxes). This is the deliberate high-leverage reuse: a Form is a thin owner row + an engine field-set.

### 4.1 The `forms` table

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// (additive fragment — merged into schema.ts by the v2 scanner; never hand-edited there)

forms: defineTable({
  // Identity
  title: v.string(),
  slug: v.string(),                       // unique, public — the Renderer/Submission resolve by this
  description: v.optional(v.string()),

  // Lifecycle
  status: v.union(
    v.literal("draft"),                   // editable, not publicly renderable
    v.literal("published"),               // live; Renderer + Submission accept it
    v.literal("archived")                 // soft-deleted; hidden from list by default
  ),

  // Settings (JSON blob — owned here, interpreted by Renderer/Submission/Confirmation/Notification)
  settings: v.object({
    // Scheduling window (epoch ms; null = open)
    scheduleStart: v.optional(v.number()),
    scheduleEnd: v.optional(v.number()),
    // Entry limit (null = unlimited); Submission enforces against entry count
    entryLimit: v.optional(v.number()),
    // Access
    requireLogin: v.boolean(),            // when true, Submission rejects guests
    // References (ids/keys only — behavior lives in the referenced systems)
    confirmationRef: v.optional(v.string()),  // → Form Confirmation System
    notificationRefs: v.optional(v.array(v.string())), // → Form Notification System
  }),

  // Audit
  createdBy: v.id("users"),
  updatedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])             // unique lookup for public resolution
  .index("by_status", ["status"]),        // list filtering (draft/published/archived)
```

### 4.2 How fields attach (engine reuse)

No new field tables. The Builder writes through the engine's existing model:

- `fieldGroups` — one group per Form (the Form's field-set container). The Builder creates/owns a group keyed to the form.
- `fieldDefinitions` — each placed field is an engine field definition with `groupId` = the form's group, carrying `label, name, key, type, required, defaultValue, settings (JSON), conditionalLogic (JSON), menuOrder, parentFieldId` (recursive for compound `group`/`repeater`/`flexible_content`). The Builder's drag-drop reorders by writing `menuOrder`.
- `fieldValues` — **not touched by the Builder.** Values are written by the Form Submission System (`entityType: "form_submission"`). The Builder is authoring-only.

The owner linkage: a Form's field group records `entityType: "form"`, `entityId: <formId>` so the Renderer can fetch "the fields for this form" the same way metaboxes fetch "the fields for this post type."

### 4.3 Status lifecycle

```
        create
          │
          ▼
     ┌─────────┐   publish    ┌────────────┐
     │  draft  │ ───────────▶ │ published  │
     └─────────┘ ◀─────────── └────────────┘
        │   ▲     unpublish        │
 archive│   │restore               │archive
        ▼   │                      ▼
     ┌──────────────────────────────┐
     │           archived           │  ← soft-delete target (form.delete)
     └──────────────────────────────┘
```

---

## 5. Actions

All actions are mutations gated by `requireCan(ctx, "form.<cap>")`. Capabilities below are granted to **Administrator + Editor** (per the route/capability map). Each mutation that mutates state emits its event via the Event Dispatcher.

| Action | Capability | Description | Roles | Emits |
|---|---|---|---|---|
| Create form | `form.create` | Insert a `forms` row (draft) + its engine field group. | Administrator, Editor | `form.created` |
| Update form | `form.update` | Patch title/slug/description/settings/status; reorder/edit fields via the engine. | Administrator, Editor | `form.updated` |
| Delete form | `form.delete` | **Soft-delete:** set `status: "archived"` (no hard row delete). | Administrator, Editor | `form.deleted` |
| Duplicate form | `form.duplicate` | Deep-copy a form: new `forms` row (draft, new unique slug) + cloned field group/definitions. | Administrator, Editor | `form.created` |
| View form | `form.view` | Read a form + its field-set in the admin (gates queries used by the builder/list). | Administrator, Editor | — |

**Capability declaration (manifest):** the four mutating caps + `form.view` are declared in `apps/web/src/extensions/forms/` and merged into the capability registry by codegen. `requireCan` is the single enforcement point — UI gating (hiding buttons) is convenience only.

---

## 6. Events

Emitted via `ctx.scheduler.runAfter(0, internal.events.dispatch, …)` (or the extension's `emitEvent` helper). Payloads use brace-shorthand.

| Event | Trigger | Payload |
|---|---|---|
| `form.created` | A form is created (incl. via duplicate). | `{ formId, title, createdBy }` |
| `form.updated` | A form's row or field-set is updated. | `{ formId, changedFields, updatedBy }` |
| `form.deleted` | A form is soft-deleted (archived). | `{ formId, deletedBy }` |

`changedFields` is a string array of the top-level keys that changed (e.g. `["title", "settings.requireLogin"]`) so downstream consumers can react narrowly.

**Events consumed:** none. The Builder is a source, not a sink.

---

## 7. Notifications

**None.** Form lifecycle events (`form.created` / `form.updated` / `form.deleted`) are **not** wired to the Email Notification System or the Site Notification System. They exist for audit/automation consumers only. (Form *submission* notifications are a different concern, owned by the Form Notification System.) This section is intentionally empty by design.

---

## 8. User Interface

**Stack:** Base UI (not Radix), Tailwind v4, full-page router navigation. No modal content editors — dialogs are confirmation-only.

### 8.1 Components

**Admin components (this system):**
- [ ] `FormsList` — `/admin/forms` table of forms (title, slug, status badge, updated-at, field count). Row actions: Open (→ builder), Settings, Duplicate (confirm dialog), Archive (confirm dialog). Status filter (draft/published/archived). Empty state → "Create your first form."
- [ ] `NewFormForm` — `/admin/forms/new`. Title input + auto-slug (editable). Submit → `form.create` → navigate to `/admin/forms/$formId/edit`.
- [ ] `FormBuilderCanvas` — `/admin/forms/$formId/edit`. **Hosts the engine.** Left rail = the engine's field palette (`SUPPORTED_FIELD_TYPES`); center = the sortable field list rendered through `FIELD_RENDERERS` in preview mode; drag-from-palette and reorder write `menuOrder` on engine `fieldDefinitions`. Owns the **Fields / Logic / Calculations** tab chrome; mounts the Logic & Validation and Calculation & Pricing tab bodies as children.
- [ ] `FieldSettingsPanel` — right rail / slide-over (non-modal) editing the selected engine field definition: label, name/key, required, default, instructions, per-type `settings`. Conditional-logic editing is delegated to the Logic tab. Writes via `form.update`.
- [ ] `FormSettingsForm` — `/admin/forms/$formId/settings`. Edits the `settings` JSON: scheduling window (start/end date-time), entry limit, require-login toggle, confirmation/notification reference pickers, and the status control (draft ⇄ published, archive/restore). Saves via `form.update`.
- [ ] `BuilderToolbar` — title (inline-editable), status pill, Save state, "Preview" (deep-link to the Renderer), and the publish/unpublish control.
- [ ] `ConfirmDialog` — shared Base UI dialog for Archive / Duplicate / Unpublish confirmations only.

**Reused from the Form Field Engine (NOT built here):** the field palette, `FieldRenderer` / `FIELD_RENDERERS`, compound-field orchestration, and the field-definition shape. `FormBuilderCanvas` and `FieldSettingsPanel` are thin hosts around these.

### 8.2 Builder canvas pattern

```tsx
// /admin/forms/$formId/edit — the Builder hosts the engine; it renders no field internals itself.
function FormBuilderCanvas({ formId }: { formId: Id<"forms"> }) {
  const form = useQuery(api.extensions.forms.forms.getForm, { formId });
  const fields = useQuery(api.fieldEngine.listDefinitionsForOwner, {
    entityType: "form",
    entityId: formId,
  });
  const updateForm = useMutation(api.extensions.forms.forms.update);
  const [tab, setTab] = useState<"fields" | "logic" | "calculations">("fields");

  if (!form || !fields) return <BuilderSkeleton />;

  return (
    <PluginGuard pluginId="forms">
      <div className="grid grid-cols-[16rem_1fr_20rem] gap-4">
        {/* LEFT: engine palette — the source of truth for placeable types */}
        <FieldPalette types={SUPPORTED_FIELD_TYPES} onAdd={(type) => addField(formId, type)} />

        {/* CENTER: tabbed builder body */}
        <div>
          <BuilderTabs value={tab} onValueChange={setTab} />
          {tab === "fields" && (
            <SortableFieldList
              fields={fields}
              renderField={(f) => <FieldRenderer field={f} value={f.defaultValue} preview />}
              onReorder={(order) =>
                updateForm({ formId, reorder: order }) // writes menuOrder on engine defs
              }
              onSelect={setSelectedFieldId}
            />
          )}
          {tab === "logic" && <FormLogicTab formId={formId} />}          {/* Logic & Validation system */}
          {tab === "calculations" && <FormCalculationsTab formId={formId} />} {/* Calculation & Pricing system */}
        </div>

        {/* RIGHT: per-field settings (non-modal slide-over) */}
        <FieldSettingsPanel formId={formId} fieldId={selectedFieldId} />
      </div>
    </PluginGuard>
  );
}
```

---

## 9. Business Rules

### 9.1 Slug uniqueness

- `slug` is unique across all non-archived forms and is the public identifier the Renderer/Submission resolve by (`by_slug`).
- On create, slug is derived from title (kebab-case) and disambiguated with a numeric suffix if taken (`contact`, `contact-2`).
- On update, changing the slug re-checks uniqueness; collisions are rejected (mutation throws), not silently suffixed.
- **Duplicate** always mints a fresh unique slug (`<slug>-copy`, then `-copy-2`, …) and resets status to `draft`.

### 9.2 Soft-delete

- `form.delete` sets `status: "archived"`; it never removes the row or its field definitions (per the "never remove functionality" rule + to preserve referential integrity for any historical submissions).
- Archived forms are excluded from the default list and are non-renderable by the public Renderer; they remain restorable to `draft`.
- Archiving frees the slug for reuse only if a future rule allows it; default keeps the slug reserved while archived to avoid breaking inbound links.

### 9.3 Draft / publish

- New forms start as `draft` and are not publicly renderable.
- Publishing requires at least one non-layout field (a form with only `message`/`accordion`/`tab` layout fields cannot be published).
- `published → draft` (unpublish) is allowed and immediately removes public availability; existing submissions are untouched.
- Scheduling (`scheduleStart`/`scheduleEnd`) is enforced at *submit* by the Submission system, not by status; a published form outside its window accepts no entries.

### 9.4 Settings validation

- `entryLimit`, if set, must be a positive integer; `scheduleEnd` (if both set) must be ≥ `scheduleStart`.
- `confirmationRef` / `notificationRefs` are stored opaquely; the Builder validates they exist via the owning systems' queries but does not interpret behavior.

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| Two editors save the builder concurrently | Last-write-wins on the `forms` row; field edits are per-`fieldDefinition` so they rarely collide. `updatedAt`/`updatedBy` reflect the latest. |
| Slug collision on update | Mutation throws a typed error; UI surfaces "Slug already in use." No silent rename on explicit edits. |
| Duplicating a form with compound/nested fields | Deep-clone walks `parentFieldId` recursively so repeater/group children are copied with remapped ids. |
| Publishing a form with zero input fields | Rejected by rule 9.3; toolbar disables Publish and explains why. |
| Archiving a published form with live submissions | Allowed; submissions are retained (soft-delete). Renderer stops serving it. |
| Forms extension disabled while an editor is on a builder route | `<PluginGuard pluginId="forms">` redirects/404s; no orphaned mutations fire. |
| Engine adds a new field type (e.g. `page_break`, `calculation`) | Appears in the palette automatically via `SUPPORTED_FIELD_TYPES`; Builder needs no change (registration is the engine's job). |
| Layout field placed but later type-catalog removes it | Renderer/serializer skip unknown/layout types; Builder shows a safe fallback, never throws. |

---

## 11. API Design

Backend at `packages/backend/convex/extensions/forms/forms.ts`. **Every mutation opens with `requireCan` and ends by emitting its event.** Sketches below elide engine field-copy helpers (`cloneFieldSetForOwner`, `nextMenuOrder`) which live alongside.

### 11.1 Queries

```typescript
// List forms for the admin table (gated by form.view).
export const listForms = query({
  args: {
    status: v.optional(v.union(
      v.literal("draft"), v.literal("published"), v.literal("archived"),
    )),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.view");

    const rows = args.status
      ? await ctx.db.query("forms").withIndex("by_status", (q) => q.eq("status", args.status!)).collect()
      : await ctx.db.query("forms")
          .withIndex("by_status") // default list: exclude archived
          .filter((q) => q.neq(q.field("status"), "archived"))
          .collect();

    // Decorate with field counts from the engine.
    return Promise.all(rows.map(async (form) => ({
      ...form,
      fieldCount: await countFieldsForOwner(ctx, "form", form._id),
    })));
  },
});

// Get one form + its attached field-set (gated by form.view) — powers builder + settings.
export const getForm = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.view");
    const form = await ctx.db.get(args.formId);
    if (!form) return null;
    const fields = await listFieldDefinitionsForOwner(ctx, "form", form._id); // engine
    return { ...form, fields };
  },
});
```

### 11.2 Mutations

```typescript
// Create a draft form + its engine field group.
export const create = mutation({
  args: {
    title: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireCan(ctx, "form.create");

    const slug = await ensureUniqueSlug(ctx, args.slug ?? slugify(args.title));
    const now = Date.now();

    const formId = await ctx.db.insert("forms", {
      title: args.title,
      slug,
      description: args.description,
      status: "draft",
      settings: { requireLogin: false }, // sane defaults; rest optional
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Create the engine field group that owns this form's fields.
    await createFieldGroupForOwner(ctx, { entityType: "form", entityId: formId });

    await emitEvent(ctx, "form.created", { formId, title: args.title, createdBy: userId });
    return { formId };
  },
});

// Update form row and/or reorder fields.
export const update = mutation({
  args: {
    formId: v.id("forms"),
    patch: v.optional(v.object({
      title: v.optional(v.string()),
      slug: v.optional(v.string()),
      description: v.optional(v.string()),
      status: v.optional(v.union(
        v.literal("draft"), v.literal("published"), v.literal("archived"),
      )),
      settings: v.optional(v.any()),    // validated against the settings shape
    })),
    reorder: v.optional(v.array(v.id("fieldDefinitions"))), // new field order
  },
  handler: async (ctx, args) => {
    const userId = await requireCan(ctx, "form.update");
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");

    const changedFields: string[] = [];
    const next: Record<string, unknown> = { updatedBy: userId, updatedAt: Date.now() };

    if (args.patch?.slug && args.patch.slug !== form.slug) {
      await assertSlugFree(ctx, args.patch.slug, args.formId); // throws on collision
      next.slug = args.patch.slug; changedFields.push("slug");
    }
    for (const key of ["title", "description", "settings", "status"] as const) {
      if (args.patch?.[key] !== undefined) { next[key] = args.patch[key]; changedFields.push(key); }
    }
    if (args.patch?.status === "published") assertPublishable(form); // rule 9.3

    await ctx.db.patch(args.formId, next);

    if (args.reorder) {
      await applyFieldOrder(ctx, args.reorder); // writes menuOrder on engine defs
      changedFields.push("fields");
    }

    await emitEvent(ctx, "form.updated", { formId: args.formId, changedFields, updatedBy: userId });
    return { success: true };
  },
});

// Soft-delete (archive).
export const remove = mutation({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const userId = await requireCan(ctx, "form.delete");
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");

    await ctx.db.patch(args.formId, {
      status: "archived",          // soft-delete: never ctx.db.delete()
      updatedBy: userId,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, "form.deleted", { formId: args.formId, deletedBy: userId });
    return { success: true };
  },
});

// Deep-duplicate a form (new draft + cloned field-set).
export const duplicate = mutation({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const userId = await requireCan(ctx, "form.duplicate");
    const source = await ctx.db.get(args.formId);
    if (!source) throw new Error("Form not found");

    const slug = await ensureUniqueSlug(ctx, `${source.slug}-copy`);
    const now = Date.now();

    const newFormId = await ctx.db.insert("forms", {
      title: `${source.title} (copy)`,
      slug,
      description: source.description,
      status: "draft",            // copies always start as draft
      settings: source.settings,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Recursively clone the engine field-set (handles compound/nested fields).
    await cloneFieldSetForOwner(ctx, {
      from: { entityType: "form", entityId: args.formId },
      to: { entityType: "form", entityId: newFormId },
    });

    // Duplicate is a creation → emit form.created.
    await emitEvent(ctx, "form.created", { formId: newFormId, title: `${source.title} (copy)`, createdBy: userId });
    return { formId: newFormId };
  },
});
```

---

## 12. Implementation Checklist

**Phase 1 — table + CRUD**
- [ ] Add the `forms` table fragment (additive) at `packages/backend/convex/extensions/forms/schema.ts` with `by_slug` + `by_status`.
- [ ] Implement `create` / `update` / `remove` / `duplicate` mutations + `listForms` / `getForm` queries — each with `requireCan` + (mutations) `emitEvent`.
- [ ] Slug helpers: `slugify`, `ensureUniqueSlug`, `assertSlugFree`.
- [ ] Declare `form.create/update/delete/duplicate/view` capabilities in the manifest (Administrator + Editor grants).

**Phase 2 — admin shell**
- [ ] Routes under `_authenticated/_admin/forms/` (`index`, `new`, `$formId/edit`, `$formId/settings`), each wrapped in `<PluginGuard pluginId="forms">`.
- [ ] `FormsList` + `NewFormForm` + `FormSettingsForm` (Base UI, full-page; confirm dialogs only).
- [ ] Register the extension manifest + nav entries at `apps/web/src/extensions/forms/` (merged by the v2 scanner).

**Phase 3 — builder (engine host)**
- [ ] `FormBuilderCanvas` hosting the engine palette + sortable field list (reorder → `menuOrder`).
- [ ] `FieldSettingsPanel` editing engine field definitions (non-modal slide-over).
- [ ] Builder tab chrome (Fields / Logic / Calculations); mount Logic & Validation and Calculation & Pricing tab bodies as children.
- [ ] Wire `cloneFieldSetForOwner` for recursive duplicate of compound fields.

**Phase 4 — rules + polish**
- [ ] Enforce publish rule (≥1 non-layout field), settings validation (entryLimit/schedule window).
- [ ] Empty/loading/skeleton states; status filter; field-count decoration.
- [ ] Verify with Playwright: create → place fields → publish → duplicate → archive.

---

## 13. Open Questions

- **Field-group cardinality:** one `fieldGroup` per form (current plan) vs. allowing multiple groups for visual sectioning. Default: one group per form; revisit if sectioned layouts are requested.
- **Slug reuse on archive:** keep the slug reserved while archived (default, link-safe) vs. free it for new forms. Decide alongside the Renderer's 404/redirect behavior.
- **Versioning:** do edits to a published form take effect live, or should publish snapshot the field-set? Default: live edits (no versioning); a `formRevisions` table is a future system, not this one.
- **Settings shape ownership:** `confirmationRef`/`notificationRefs` are opaque strings here; confirm the exact id/key contract with the Confirmation + Notification systems before locking the `settings` validator.

---

## 14. Cross-References

- Dependency (root): Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Public consumer: Form Renderer System (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)
- Persists entries: Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Builder **Logic** tab: Form Logic & Validation System (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`)
- Builder **Calculations** tab: Form Calculation & Pricing System (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Builder System · **Plugin:** ConvexPress Forms (v2)
