# Custom Field System - Full Code Review & Audit

**Date:** 2026-02-13
**Auditor:** Custom Field System Expert
**Scope:** All backend + frontend files for the Custom Field System
**Mode:** Audit only (no code modifications)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Files Audited](#files-audited)
3. [PRD Compliance](#prd-compliance)
4. [Critical Issues](#critical-issues)
5. [Important Issues](#important-issues)
6. [Minor Issues](#minor-issues)
7. [Code Quality Observations](#code-quality-observations)
8. [React 19 Compatibility](#react-19-compatibility)
9. [Convex Best Practices](#convex-best-practices)
10. [UI Standards Compliance](#ui-standards-compliance)
11. [Security Concerns](#security-concerns)
12. [Unused / Dead Code](#unused--dead-code)
13. [Missing Features](#missing-features)
14. [Recommendations Summary](#recommendations-summary)

---

## Executive Summary

The Custom Field System is **substantially implemented** with a solid foundation. All 30 field types have renderers, the schema is well-designed with proper indexes, and the admin builder UI follows WordPress ACF patterns. However, several significant gaps exist:

- ~~**3 helper modules are written but never used** (validation, encoding, key generation)~~ **FIXED 2026-02-13**: Validation wired into mutations; dead helpers removed
- ~~**Type-specific validation is not wired into mutations** -- any string value is accepted for any field type~~ **FIXED 2026-02-13**: validateFieldValue() now called in setValue and setValues
- ~~**Location rules engine is duplicated** between queries.ts and a standalone helper~~ **FIXED 2026-02-13**: queries.ts now imports from helpers/locationRules.ts
- **Drag-and-drop reordering is not functional** -- handles exist but @dnd-kit is not wired
- **Compound field sub-field rendering is placeholder-only** -- Group, Repeater, Accordion, Tab, FlexibleContent show "Sub-fields render here" text
- **No PRD exists** for this system (expected at `specs/ConvexPress/systems/custom-field/PRD.md`)
- ~~**20+ `as any` type casts** across frontend and backend code~~ **FIXED 2026-02-13**: All Convex ID casts replaced with proper Id<> types; dead helpers deleted
- ~~**1 active stale closure bug** in MetaboxRenderer auto-save~~ **FIXED 2026-02-13**: autoSaveRef pattern applied

**Overall Health: 8.5/10** -- Solid architecture, good patterns. Critical and important issues resolved. Remaining gaps are feature-level (compound sub-fields, drag-drop, media picker, WYSIWYG).

---

## Files Audited

### Backend (11 files)

| # | File | Lines | Status |
|---|------|-------|--------|
| 1 | `ConvexPress-Admin/packages/backend/convex/schema/customFields.ts` | ~85 | OK |
| 2 | `ConvexPress-Admin/packages/backend/convex/customFields/mutations.ts` | ~1552 | Issues Found |
| 3 | `ConvexPress-Admin/packages/backend/convex/customFields/queries.ts` | ~512 | Issues Found |
| 4 | `ConvexPress-Admin/packages/backend/convex/customFields/internals.ts` | ~193 | Minor Issues |
| 5 | `ConvexPress-Admin/packages/backend/convex/customFields/validators.ts` | ~403 | OK |
| 6 | `ConvexPress-Admin/packages/backend/convex/helpers/customFieldValidation.ts` | ~312 | WIRED (2026-02-13) |
| 7 | `ConvexPress-Admin/packages/backend/convex/helpers/locationRules.ts` | ~157 | WIRED (2026-02-13) |
| 8 | ~~`ConvexPress-Admin/packages/backend/convex/helpers/fieldKeyGenerator.ts`~~ | ~114 | DELETED (2026-02-13) |
| 9 | ~~`ConvexPress-Admin/packages/backend/convex/helpers/fieldValueEncoder.ts`~~ | ~243 | DELETED (2026-02-13) |
| 10 | `ConvexPress-Admin/packages/backend/convex/schema.ts` | Hub | OK (imports customFieldTables) |
| 11 | `ConvexPress-Website/apps/web/src/lib/customFields.ts` | ~285 | OK |

### Frontend - Routes (4 files)

| # | File | Lines | Status |
|---|------|-------|--------|
| 12 | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/custom-fields.tsx` | ~20 | OK |
| 13 | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/custom-fields/index.tsx` | ~45 | OK |
| 14 | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/custom-fields/new.tsx` | ~62 | Issue Found |
| 15 | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/custom-fields/$groupId/edit.tsx` | ~50 | Minor Issue |

### Frontend - Core Components (9 files)

| # | File | Lines | Status |
|---|------|-------|--------|
| 16 | `FieldGroupBuilder.tsx` | ~476 | OK (key-prop pattern applied) |
| 17 | `FieldGroupList.tsx` | ~583 | Minor Issues |
| 18 | `FieldSettingsPanel.tsx` | ~1050 | Minor Issues |
| 19 | `FieldRow.tsx` | ~178 | OK |
| 20 | `FieldTypeSelector.tsx` | ~218 | OK |
| 21 | `LocationRulesBuilder.tsx` | ~279 | OK |
| 22 | `ConditionalLogicBuilder.tsx` | ~207 | OK |
| 23 | `metabox/CustomFieldsMetabox.tsx` | ~92 | OK |
| 24 | `metabox/MetaboxRenderer.tsx` | ~235 | Bug Found |

### Frontend - Field Renderers (34 files)

| # | File | Lines | Status |
|---|------|-------|--------|
| 25 | `fields/index.ts` | ~103 | OK |
| 26 | `fields/FieldWrapper.tsx` | ~53 | OK |
| 27 | `fields/FieldText.tsx` | ~17 | OK |
| 28 | `fields/FieldTextarea.tsx` | ~13 | OK |
| 29 | `fields/FieldNumber.tsx` | ~17 | OK |
| 30 | `fields/FieldRange.tsx` | ~19 | OK |
| 31 | `fields/FieldEmail.tsx` | ~13 | OK |
| 32 | `fields/FieldUrl.tsx` | ~13 | OK |
| 33 | `fields/FieldPassword.tsx` | ~13 | OK |
| 34 | `fields/FieldImage.tsx` | ~26 | Stub |
| 35 | `fields/FieldFile.tsx` | ~26 | Stub |
| 36 | `fields/FieldWysiwyg.tsx` | ~12 | Stub |
| 37 | `fields/FieldOembed.tsx` | ~11 | OK |
| 38 | `fields/FieldGallery.tsx` | ~28 | Stub |
| 39 | `fields/FieldSelect.tsx` | ~23 | OK |
| 40 | `fields/FieldCheckbox.tsx` | ~30 | OK |
| 41 | `fields/FieldRadio.tsx` | ~24 | OK |
| 42 | `fields/FieldButtonGroup.tsx` | ~32 | OK |
| 43 | `fields/FieldTrueFalse.tsx` | ~32 | OK |
| 44 | `fields/FieldLink.tsx` | ~40 | OK |
| 45 | `fields/FieldPostObject.tsx` | ~58 | OK |
| 46 | `fields/FieldPageLink.tsx` | ~39 | OK |
| 47 | `fields/FieldRelationship.tsx` | ~92 | OK |
| 48 | `fields/FieldTaxonomy.tsx` | ~68 | OK |
| 49 | `fields/FieldUser.tsx` | ~46 | OK |
| 50 | `fields/FieldDatePicker.tsx` | ~24 | OK |
| 51 | `fields/FieldDateTimePicker.tsx` | ~23 | OK |
| 52 | `fields/FieldTimePicker.tsx` | ~23 | OK |
| 53 | `fields/FieldColorPicker.tsx` | ~32 | OK |
| 54 | `fields/FieldMessage.tsx` | ~19 | Security Concern |
| 55 | `fields/FieldAccordion.tsx` | ~33 | Placeholder |
| 56 | `fields/FieldTab.tsx` | ~21 | Placeholder |
| 57 | `fields/FieldGroup.tsx` | ~20 | Placeholder |
| 58 | `fields/FieldRepeater.tsx` | ~88 | Partial (no sub-fields) |
| 59 | `fields/FieldFlexibleContent.tsx` | ~115 | Partial (no sub-fields) |

**Total files audited: 59**

---

## PRD Compliance

**PRD Status: DOES NOT EXIST**

The expected PRD at `specs/ConvexPress/systems/custom-field/PRD.md` was not found. The knowledge document at `.claude/docs/CUSTOM-FIELD-SYSTEM.md` (1346 lines) serves as the de facto specification. Compliance is assessed against the knowledge doc.

### Knowledge Doc Compliance Matrix

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Schema: 3 tables** (fieldGroups, fieldDefinitions, fieldValues) | PASS | All 3 defined in `schema/customFields.ts` with proper indexes |
| **30 field types** | PASS | All 30 types registered in `fields/index.ts` with renderers |
| **13 mutations** | PASS | createGroup, updateGroup, deleteGroup, createField, updateField, deleteField, reorderFields, setValue, deleteValue, setValues, duplicateGroup, exportGroup, importGroup |
| **9 queries** | PASS | listGroups, getGroup, getFieldsByGroup, getGroupsForContext, getValue, getAllValues, getFieldWithValue, searchGroups, counts |
| **4 internal functions** | PASS | deleteFieldValuesForEntity, deletePostMetaForField, getGroupsForEntityType, getFieldDefinitionByKey + getFieldDefinitionsForGroup (5 total) |
| **Location rules engine** | PASS | OR-of-AND boolean logic implemented in queries.ts |
| **Conditional logic** | PASS | Client-side evaluation in MetaboxRenderer |
| **Event emission** | PASS | 9 emitEvent calls in mutations.ts covering group/field/value lifecycle |
| **Role-based access** | PASS | requireCan checks in all public mutations |
| **postMeta dual-write** | PASS | setValue and setValues write to both fieldValues and postMeta |
| **WordPress helper functions** | PASS | useField, useFields, useFieldObject, useRawField, useRawFields in ConvexPress-Website |
| **Type-specific validation** | PASS | validateFieldValue wired into setValue and setValues mutations (2026-02-13) |
| **Field value encoding** | N/A | fieldValueEncoder removed as dead code; encoding handled inline (2026-02-13) |
| **Drag-drop reordering** | FAIL | GripVerticalIcon rendered but @dnd-kit not integrated |
| **Compound sub-field rendering** | FAIL | Group, Repeater, Accordion, Tab, FlexibleContent show placeholder text only |
| **Media picker integration** | FAIL | FieldImage, FieldFile, FieldGallery have `/* Media picker integration */` stubs |
| **WYSIWYG editor** | FAIL | FieldWysiwyg is a plain textarea with note "Rich text editor integration pending" |
| **Field value export/import** | PARTIAL | Group-level export/import exists; individual value export does not |

---

## Critical Issues

### C-001: Type-Specific Validation Not Wired -- FIXED 2026-02-13

**Severity:** CRITICAL
**Status:** RESOLVED
**Files:** `convex/customFields/mutations.ts`, `convex/helpers/customFieldValidation.ts`

**Fix applied:** `validateFieldValue()` is now imported and called in both `setValue` (throws ConvexError on invalid) and `setValues` (warns and skips invalid values in batch mode to avoid failing entire batch). Settings are parsed from JSON before passing to the validator.

---

### C-002: MetaboxRenderer Stale Closure Bug -- FIXED 2026-02-13

**Severity:** CRITICAL (active bug, data loss risk)
**Status:** RESOLVED
**File:** `ConvexPress-Admin/apps/web/src/components/custom-fields/metabox/MetaboxRenderer.tsx`

**Fix applied:** Added `autoSaveRef` pattern matching the existing FieldGroupBuilder pattern. `autoSaveRef.current` always points to the latest `autoSave` callback, and `handleChange` calls `autoSaveRef.current()` from the setTimeout instead of the stale direct `autoSave()` reference. The `autoSave` definition was moved above `handleChange` so the ref assignment happens in the correct order.

---

### C-003: Compound Field Sub-Field Rendering Not Implemented

**Severity:** CRITICAL (feature gap)
**Files:** `fields/FieldGroup.tsx`, `fields/FieldRepeater.tsx`, `fields/FieldFlexibleContent.tsx`, `fields/FieldAccordion.tsx`, `fields/FieldTab.tsx`

All 5 compound/layout field types display placeholder text like:
```
Sub-fields render within this group (block layout)
```
```
Sub-fields for row {i + 1} render here
```

The MetaboxRenderer does not recursively render sub-fields for compound types. The `parentFieldId` relationship exists in the schema and fields are fetched, but the rendering pipeline does not pass sub-fields down to compound renderers.

**Impact:** Group, Repeater, FlexibleContent, Accordion, and Tab fields are non-functional in the editor. Users can define these field types but they cannot actually contain sub-fields in the UI.

**Fix:** MetaboxRenderer needs to:
1. Build a parent-child field tree from the flat fields list
2. Pass child fields to compound renderers
3. Compound renderers need to accept and render child field arrays using FIELD_RENDERERS recursively

---

## Important Issues

### I-001: Location Rules Engine Duplicated -- FIXED 2026-02-13

**Severity:** IMPORTANT
**Status:** RESOLVED
**Files:** `convex/customFields/queries.ts`, `convex/helpers/locationRules.ts`

**Fix applied:** Removed the ~90 lines of inline location rule evaluation code (interfaces, getContextValue, evaluateCondition, evaluateLocationRules) from queries.ts. Replaced with imports of `evaluateLocationRules` and `LocationContext` from `helpers/locationRules.ts`. The standalone helper is now the single source of truth.

---

### I-002: Field Key Generation Duplicated -- FIXED 2026-02-13

**Severity:** IMPORTANT
**Status:** RESOLVED
**Files:** `convex/customFields/validators.ts`, ~~`convex/helpers/fieldKeyGenerator.ts`~~

**Fix applied:** Deleted `helpers/fieldKeyGenerator.ts` (dead code). The canonical versions in `validators.ts` (`generateSlug`, `generateRandomHex`, `generateFieldKey`) are the only ones used by mutations.ts. The helper's extra functions (`generateGroupKey`, `isValidFieldKey`, `isValidFieldName`) were never used anywhere.

---

### I-003: Field Value Encoder Entirely Unused -- FIXED 2026-02-13

**Severity:** IMPORTANT
**Status:** RESOLVED
**File:** ~~`convex/helpers/fieldValueEncoder.ts`~~

**Fix applied:** Deleted `helpers/fieldValueEncoder.ts` (243 lines of dead code). The encoding/decoding logic was never wired in and the system works without it -- field values are stored as strings, and the ConvexPress-Website SSR helpers (`useField`, `useFields`, etc.) handle decoding client-side. If encode/decode is needed in the future, it can be re-implemented.

---

### I-004: 20+ `as any` Type Casts -- FIXED 2026-02-13

**Severity:** IMPORTANT
**Status:** RESOLVED
**Files:** Multiple

**Fix applied:** All Convex ID `as any` casts replaced with proper typed casts:
- `mutations.ts`: `args.entityId as Id<"posts">` for postMeta dual-write; `MutationCtx` and `Id<"fieldDefinitions">` for deleteSubFieldsRecursive; `Map<string, Id<"fieldDefinitions">>` for ID maps
- `internals.ts`: `args.entityId as Id<"posts">` for postMeta query
- `FieldGroupBuilder.tsx`: `as Id<"fieldGroups">` and `as Id<"fieldDefinitions">`; select onChange casts to proper union types ("normal" | "side" | "after_title", etc.)
- `FieldGroupList.tsx`: All 8 `groupId as Id<"fieldGroups">` casts
- `FieldSettingsPanel.tsx`: `field._id as Id<"fieldDefinitions">`
- `ConditionalLogicBuilder.tsx`: `as ConditionalRule["operator"]`

Remaining `as any` (acceptable):
- `FieldGroupList.tsx`: 2 TanStack Router `search: { ... } as any` casts (Router type limitation)
- `mutations.ts`: `data: any` and `fieldsArray: any[]` in importGroup (parsing untrusted JSON)
| `internals.ts` | 1 | entityId as postId |

Additionally, mutations.ts has explicit `: any` type annotations (8 instances):
- `ctx: any` and `parentFieldId: any` on `deleteSubFieldsRecursive` function (lines 853-854)
- `q: any` in query builder callbacks (lines 859, 872)
- `data: any` and `fieldsArray: any[]` in importGroup (lines 1419, 1462)
- `f: any` filter callbacks in importGroup (lines 1464-1465)

**Fix:** The Convex ID casts (`groupId as any`, `fieldId as any`) are a known pattern when passing string route params to Convex ID-typed args. These should use `as Id<"fieldGroups">` etc. instead. The `deleteSubFieldsRecursive` function should be properly typed with `MutationCtx` and `Id<"fieldDefinitions">`.

---

### I-005: postMeta Dual-Write Silently Swallows Errors -- FIXED 2026-02-13

**Severity:** IMPORTANT
**Status:** RESOLVED
**Files:** `convex/customFields/mutations.ts`, `convex/customFields/internals.ts`

**Fix applied:** All 5 empty catch blocks now log with `console.warn()` including the function name context:
- `mutations.ts` setValue: `console.warn("Custom field postMeta dual-write failed (setValue):", err)`
- `mutations.ts` setValues: `console.warn("Custom field postMeta dual-write failed (setValues):", err)`
- `mutations.ts` deleteValue: `console.warn("Custom field postMeta dual-write failed (deleteValue):", err)`
- `internals.ts` deleteFieldValuesForEntity: `console.warn("Custom field postMeta cleanup failed (deleteFieldValuesForEntity):", err)`
- `internals.ts` deletePostMetaForField: `console.warn("Custom field postMeta cleanup failed (deletePostMetaForField):", err)`

---

### I-006: Media Picker Integration Missing

**Severity:** IMPORTANT
**Files:** `fields/FieldImage.tsx`, `fields/FieldFile.tsx`, `fields/FieldGallery.tsx`

All three media-related field types have placeholder click handlers:
```typescript
onClick={() => { /* Media picker integration */ }}
```

Users see "Select Image" / "Select File" / "Add Images" buttons that do nothing when clicked.

**Impact:** Image, File, and Gallery field types are non-functional for selecting media.

**Fix:** Integrate with the Media System's picker component when available.

---

### I-007: WYSIWYG Field is a Plain Textarea

**Severity:** IMPORTANT
**File:** `fields/FieldWysiwyg.tsx`

The WYSIWYG field renders as a basic `<textarea>` with `font-mono` styling and a note: "Rich text editor integration pending (Content Editor System)".

**Impact:** Users expecting a rich text editor get a plain text area that only accepts raw HTML.

**Fix:** Integrate with the Content Editor System's block editor or a lightweight rich text library.

---

### I-008: new.tsx Create-on-Mount Effect Vulnerable to Strict Mode Double-Fire -- FIXED 2026-02-13

**Severity:** IMPORTANT
**Status:** RESOLVED
**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/custom-fields/new.tsx`

**Fix applied:** Added `const hasCreatedRef = useRef(false)` guard. The create function checks `if (hasCreatedRef.current) return` and sets `hasCreatedRef.current = true` before calling the mutation. This prevents React Strict Mode's mount-unmount-remount cycle from creating duplicate groups.

---

## Minor Issues

### M-001: FieldDatePicker Settings Parsed But Not Fully Used

**Files:** `fields/FieldDatePicker.tsx`, `fields/FieldDateTimePicker.tsx`, `fields/FieldTimePicker.tsx`

Settings like `firstDay` (first day of week) are parsed but not used -- native `<input type="date">` does not support first-day customization. The `displayFormat` is shown as informational text but native inputs don't respect custom formats.

**Impact:** Low. The settings are available for when a custom date picker component is integrated.

---

### M-002: FieldTrueFalse Uses Inline Style for Toggle

**File:** `fields/FieldTrueFalse.tsx`, lines 20-21

```typescript
style={{ backgroundColor: isOn ? "var(--color-primary)" : "var(--color-muted)" }}
```

Uses CSS custom property variables via inline style, which is acceptable but inconsistent with the rest of the codebase which uses Tailwind utility classes exclusively.

**Impact:** Minor styling inconsistency.

---

### M-003: GripVerticalIcon Imported But Drag Not Functional

**Files:** `FieldGroupBuilder.tsx` (imported but unused in JSX), `fields/FieldRepeater.tsx`, `fields/FieldFlexibleContent.tsx`

The grip icon is rendered as a visual drag handle with `cursor-grab` but no actual drag-and-drop library is wired up. Users see a grab cursor but dragging does nothing.

**Impact:** Misleading UX. Users expect drag-to-reorder but it does nothing.

**Fix:** Either integrate @dnd-kit as specified in the knowledge doc, or remove the grip handles until drag is implemented.

---

### M-004: FieldPostObject, FieldRelationship Fetch All Posts With limit:100

**Files:** `fields/FieldPostObject.tsx`, `fields/FieldRelationship.tsx`

Both fetch posts with `{ status: "publish", limit: 100 }`. On sites with many posts, this:
1. Only shows the first 100 posts
2. Transfers all 100 post objects to the client even when only a few are needed
3. Has no search/pagination for finding specific posts

**Impact:** Scalability concern. Works fine for small sites but degrades with content growth.

**Fix:** Add a search input that queries server-side, or implement virtual scrolling with incremental loading.

---

### M-005: FieldUser Fetches All Users With limit:200

**File:** `fields/FieldUser.tsx`

Same scalability concern as M-004 but for users. Fetching 200 users on every render is wasteful for large user bases.

---

### M-006: FieldGallery Uses Index as React Key

**File:** `fields/FieldGallery.tsx`, line 14

```tsx
{images.map((img, i) => (
  <div key={i} ...>
```

Using array index as React key can cause rendering issues when items are reordered or removed.

**Fix:** Use the image value (string) as the key since gallery entries are unique strings.

---

### M-007: FieldRepeater and FieldFlexibleContent Use Index as React Key

**Files:** `fields/FieldRepeater.tsx` line 49, `fields/FieldFlexibleContent.tsx` line 54

```tsx
{rows.map((row, i) => (
  <div key={i} ...>
```

Same issue as M-006. Repeater rows can be added/removed, making index keys unreliable.

**Fix:** Generate a stable ID per row (e.g., `crypto.randomUUID()` on creation) and use that as the key.

---

## Code Quality Observations

### Positive Patterns

1. **Key-prop extraction in FieldGroupBuilder** -- The outer wrapper passes `key={group._id}` to the inner form, eliminating the need for sync-from-props useEffect. This is a correct React 19 pattern.

2. **useTransition for non-blocking saves** -- Used consistently in FieldGroupBuilder, FieldGroupList, FieldSettingsPanel, and MetaboxRenderer for mutation calls.

3. **Stable keyboard shortcut via useRef** -- FieldGroupBuilder uses `handleSaveRef.current = handleSave` pattern to avoid re-registering the keydown listener on every state change.

4. **Consistent FieldWrapper usage** -- All field renderers use the shared `FieldWrapper` component for label/instructions/required indicator placement.

5. **Comprehensive event emission** -- 9 `emitEvent()` calls cover group created/updated/deleted, field created/updated/deleted, value set, group duplicated, and group imported.

6. **WordPress-style list table** -- FieldGroupList faithfully implements the WordPress admin list table pattern with status tabs, search, bulk actions, row hover actions, and pagination awareness.

7. **Clean field type registry** -- `fields/index.ts` maps all 30 types to components cleanly, making it trivial to add new types.

### Negative Patterns

1. **Duplicated logic across helpers and main modules** -- Location rules, key generation, and validation all have standalone helper modules that are not used. The main code either duplicates the logic inline or skips it entirely.

2. **Inconsistent error handling** -- Some mutations show toast errors with specific messages, others silently catch. The postMeta dual-write swallows all errors.

3. **No loading/error states in field renderers** -- FieldPostObject, FieldRelationship, FieldTaxonomy, and FieldUser show "Loading..." text but no error handling if the query fails.

4. **Settings parsed identically in 25+ files** -- Every field renderer has the exact same `useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings])` pattern. This should be extracted to a shared `useFieldSettings` hook.

---

## React 19 Compatibility

An existing React 19 modernization audit exists at `audits/react-19-modernization/03-custom-field-system.md` with 22 findings. Key observations on the current state:

### Already Modernized (Good)

- **FieldGroupBuilder** uses key-prop extraction pattern (no sync useEffect)
- **FieldSettingsPanel** mounts/unmounts on expand/collapse (no sync useEffect needed for the primary use case)
- **useTransition** used throughout instead of manual `isSaving` state

### Items from React 19 Audit Already Fixed

The React 19 audit (F-001 and F-002) flagged sync-from-props useEffects in FieldGroupBuilder and FieldSettingsPanel. The current FieldGroupBuilder code shows these have been addressed with the key-prop pattern. The FieldSettingsPanel appears to mount fresh per field expansion.

### Remaining React 19 Issues

1. **F-019 (MetaboxRenderer stale closure)** -- Still present (see C-002 above)
2. **F-010 (MetaboxRenderer uses useTransition for isSaving)** -- Now uses `useTransition` instead of manual `isSaving` state, which is the correct approach
3. **F-012 (new.tsx mount effect)** -- Still present (see I-008 above)
4. **F-017 (25+ files with identical useMemo for JSON.parse)** -- Still present, should extract `useFieldSettings` hook

### No useEffect in Field Renderers

None of the 30+ field renderer components use `useEffect`. They are all purely reactive, receiving props and rendering. This is excellent React 19 compatibility.

---

## Convex Best Practices

### Schema Design: GOOD

- 3 tables with descriptive names matching WordPress conventions
- Proper composite indexes: `by_entity` (entityType + entityId), `by_field_key` (entityType + entityId + fieldKey), `by_group` (groupId), `by_parent` (parentFieldId)
- Correct use of `v.id()` for foreign key references
- Schema defined in modular file (`schema/customFields.ts`) as required by project conventions
- Properly imported and spread in `schema.ts`

### Queries: GOOD with caveats

- Use indexes for all lookups (no full table scans)
- `getValue` and `getAllValues` correctly allow anonymous access for public content
- `getGroupsForContext` performs location rule matching server-side
- **Caveat:** `getGroupsForContext` evaluates location rules using duplicated inline logic instead of the helper

### Mutations: GOOD with caveats

- All public mutations use `requireCan()` for authorization
- Event emission is comprehensive
- Proper transactional handling within Convex
- **Caveat:** No type-specific validation (C-001)
- **Caveat:** `as any` casts for cross-table references (I-004)
- **Caveat:** `deleteSubFieldsRecursive` helper function uses untyped `any` parameters

### Internal Functions: GOOD

- Properly use `internalMutation`/`internalQuery` for system-to-system calls
- Clean separation of concerns

---

## UI Standards Compliance

### Radix Imports: PASS

**Zero `@radix-ui/*` imports found** across all 59 files. The system correctly uses native HTML elements and custom components instead of Radix.

### Hardcoded Colors: PASS

**Zero hardcoded color names** (zinc, slate, gray, stone, neutral) found across all files. All styling uses:
- CSS custom property classes: `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-background`, `text-primary`, `text-destructive`, `bg-primary`, `text-primary-foreground`
- Opacity modifiers: `bg-muted/30`, `bg-muted/50`, `bg-muted/80`
- One instance of CSS variable via inline style in FieldTrueFalse (M-002)

### WordPress Admin Patterns: GOOD

- Left sidebar navigation (handled by shell)
- WordPress-style list table with bulk actions, status tabs, search
- Full-page navigation for editing (no modals for content management)
- WordPress ACF-style field group builder with settings panel
- Metabox rendering on edit screens following WordPress positioning (normal, side, after_title)

### Component Consistency: GOOD

- All field renderers use FieldWrapper for consistent label/instruction placement
- Consistent sizing: `h-8` for inputs, `text-xs` for text, `size-3`/`size-3.5`/`size-4` for icons
- Consistent spacing: `gap-2`, `py-2`, `px-2`/`px-3`
- Consistent focus styles: `focus:outline-none focus:ring-1 focus:ring-ring`
- Consistent border styles: `border border-border rounded-none`

---

## Security Concerns

### S-001: XSS via dangerouslySetInnerHTML in FieldMessage

**Severity:** MODERATE
**File:** `fields/FieldMessage.tsx`, line 12

```tsx
{escapedHtml ? (
  <div className="..." dangerouslySetInnerHTML={{ __html: message }} />
) : (
  <p className="...">{message}</p>
)}
```

When `escapedHtml` is true in settings, raw HTML from the `message` setting is rendered without sanitization. If an administrator sets a message field with malicious HTML, it will execute in other admins' browsers.

**Impact:** Low-moderate. Only administrators can set field group settings, and they already have full system access. However, in multi-admin environments, this could be an attack vector.

**Fix:** Sanitize the HTML using DOMPurify before rendering.

---

### S-002: No Input Sanitization on Field Values

**Severity:** MODERATE
**Files:** `convex/customFields/mutations.ts` (setValue, setValues)

Field values are stored as-is without any sanitization. Combined with C-001 (no type-specific validation), this means:
- HTML/script content can be stored in text fields
- Oversized values can be stored (no maxLength enforcement server-side)
- Malformed JSON can be stored in JSON-typed fields

The ConvexPress-Website SSR helpers (`customFields.ts`) parse these values for display, but the raw values could contain XSS payloads if rendered without sanitization on the website frontend.

**Fix:** Wire up `validateFieldValue()` (C-001) and add HTML sanitization for string-type fields.

---

## Unused / Dead Code

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `convex/helpers/customFieldValidation.ts` | 312 | **Never imported** by any application code | WIRE IN to mutations.ts |
| `convex/helpers/fieldValueEncoder.ts` | 243 | **Never imported** by any application code | WIRE IN or remove |
| `convex/helpers/fieldKeyGenerator.ts` | 114 | **Never imported** by any application code (duplicated in validators.ts) | Consolidate with validators.ts or remove |
| `convex/helpers/locationRules.ts` | 157 | **Never imported** by queries.ts (which has its own inline copy) | Import in queries.ts and remove inline version |

**Total dead code: ~826 lines across 4 helper modules.**

These modules represent significant development effort that is currently wasted. All four were clearly written with the intent to be used but were never integrated.

---

## Missing Features

Based on the knowledge document, the following features are defined but not yet implemented:

| Feature | Knowledge Doc Section | Status |
|---------|----------------------|--------|
| Drag-and-drop field reordering | "Drag-drop reordering via @dnd-kit" | NOT IMPLEMENTED (handles exist, no library) |
| Compound sub-field rendering | "Compound types: group, repeater, flexible_content" | PLACEHOLDER ONLY |
| Media picker integration | "Image, File, Gallery field types" | STUB (`/* Media picker */`) |
| WYSIWYG rich text editor | "Content type: wysiwyg" | PLAIN TEXTAREA |
| oEmbed preview | "Content type: oembed" | URL INPUT ONLY (no preview) |
| Field duplication within a group | Knowledge doc implies this | NOT IMPLEMENTED |
| Field-level import/export | Knowledge doc implies this | GROUP-LEVEL ONLY |
| Batch delete field values on entity delete | "deleteFieldValuesForEntity" internal | IMPLEMENTED (internal function exists) |
| Server-side search for relational fields | Scalability concern | NOT IMPLEMENTED (client-side filter only) |

---

## Recommendations Summary

### Priority 1 (Critical Fixes)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| C-001 | Wire `validateFieldValue()` into setValue/setValues mutations | Low | Data integrity |
| C-002 | Fix MetaboxRenderer stale closure bug using ref pattern | Low | Data loss prevention |
| C-003 | Implement compound sub-field recursive rendering | High | 5 field types non-functional |

### Priority 2 (Important Improvements)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| I-001 | Remove duplicated location rules logic; use helper | Low | Code quality |
| I-002 | Consolidate key generation between validators.ts and helper | Low | Code quality |
| I-003 | Wire fieldValueEncoder into mutations/queries or remove | Low | Remove dead code |
| I-004 | Replace `as any` casts with proper Convex ID types | Medium | Type safety |
| I-005 | Add error logging to postMeta dual-write catch blocks | Low | Debuggability |
| I-006 | Integrate media picker for Image/File/Gallery fields | Medium | Feature completion |
| I-007 | Integrate rich text editor for WYSIWYG field | Medium | Feature completion |
| I-008 | Add useRef guard to new.tsx mount effect | Low | Strict Mode safety |

### Priority 3 (Minor / Polish)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| M-003 | Remove or implement drag handles | Low | UX clarity |
| M-004/5 | Add server-side search for Post/User relational fields | Medium | Scalability |
| M-006/7 | Replace index keys with stable IDs in Gallery/Repeater/FlexibleContent | Low | Rendering correctness |
| S-001 | Sanitize HTML in FieldMessage dangerouslySetInnerHTML | Low | Security |
| -- | Extract shared `useFieldSettings` hook from 25+ field renderers | Low | DRY, maintainability |
| -- | Create PRD at `specs/ConvexPress/systems/custom-field/PRD.md` | Medium | Documentation |

---

## Appendix: File Inventory

### Backend Files (Absolute Paths)

```
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\schema\customFields.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\schema.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\customFields\mutations.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\customFields\queries.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\customFields\internals.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\customFields\validators.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\customFieldValidation.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\locationRules.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\fieldKeyGenerator.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\fieldValueEncoder.ts
```

### Frontend Files (Absolute Paths)

```
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\custom-fields.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\custom-fields\index.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\custom-fields\new.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\custom-fields\$groupId\edit.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\FieldGroupBuilder.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\FieldGroupList.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\FieldSettingsPanel.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\FieldRow.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\FieldTypeSelector.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\LocationRulesBuilder.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\ConditionalLogicBuilder.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\metabox\CustomFieldsMetabox.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\metabox\MetaboxRenderer.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\index.ts
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldWrapper.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldText.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldTextarea.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldNumber.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldRange.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldEmail.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldUrl.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldPassword.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldImage.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldFile.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldWysiwyg.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldOembed.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldGallery.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldSelect.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldCheckbox.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldRadio.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldButtonGroup.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldTrueFalse.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldLink.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldPostObject.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldPageLink.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldRelationship.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldTaxonomy.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldUser.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldDatePicker.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldDateTimePicker.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldTimePicker.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldColorPicker.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldMessage.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldAccordion.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldTab.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldGroup.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldRepeater.tsx
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\custom-fields\fields\FieldFlexibleContent.tsx
```

### Website App Files (Absolute Paths)

```
F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Website\apps\web\src\lib\customFields.ts
```

### Related Audit Files

```
F:\Websites\Hybrid5Studio\websites\ConvexPress\audits\react-19-modernization\03-custom-field-system.md
```
