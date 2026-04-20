# Admin Usability Audit - 2026-04-06

Scope: `ConvexPress-Admin`

Goal: audit the backend against WordPress-style admin behavior and tighten the highest-friction UX issues first.

## Audit Criteria

1. List-table semantic parity
   - Default `All` views should exclude destructive states like `trash` unless the user explicitly opens `Trash`.
   - Counts, tabs, bulk actions, and the actual record set must agree with each other.

2. Control semantics
   - Settings selectors should behave like dropdown selects, not ad hoc searchable popovers.
   - Stored values should remain internal; visible UI should show human-readable labels.

3. Label fidelity
   - Dropdown triggers and option lists should render titles/labels, not raw IDs, slugs, enum codes, or database values.

4. Destructive-action affordance
   - Trash and permanent-delete states must be clearly separated.
   - Default views must not feel “sticky” after a destructive action.

5. WordPress admin familiarity
   - Posts, pages, comments, and settings should follow the same mental model users expect from WordPress.

6. Production confidence
   - Audited UX areas should not rely on known-broken type contracts.

## Fixed In This Pass

### 1. Posts `All` no longer includes trashed posts by default

Problem:
- The posts list counts already treated `All` as “all non-trash posts”.
- The actual list query returned trashed posts when no explicit status filter was set.
- Result: the badge and the visible table disagreed, and deleting posts felt broken because trashed items were still visible in `All`.

Fix:
- Updated the admin post list query to exclude `trash` whenever no explicit status tab is selected.

Files:
- `ConvexPress-Admin/packages/backend/convex/posts/queries.ts`

Outcome:
- `All` now behaves like WordPress.
- `Trash` is now a deliberate view instead of leaking into the default list.

### 2. Comments `All` no longer includes spam/trash by default

Problem:
- Comment counts defined `All` as approved + pending.
- The list query still merged approved, pending, spam, and trash into the default view.

Fix:
- Updated the admin comment list query so statusless/default views exclude `spam` and `trash`.

Files:
- `ConvexPress-Admin/packages/backend/convex/comments/queries.ts`

Outcome:
- Comment list semantics now match their own tab counts and WordPress expectations more closely.

### 3. Core settings entity selectors now use dropdown selects instead of combobox popovers

Problem:
- `PageSelect`, `CategorySelect`, and `TimezoneSelect` were implemented with `ComboboxField`, which is a searchable popover control.
- That was inconsistent with the requested backend UX direction and felt less WordPress-like for settings.

Fix:
- Moved active settings selectors onto the shared `SelectField`.
- Extended `SelectField` to support grouped options and explicit empty options so these selectors could stay clean without falling back to the combobox.

Files:
- `ConvexPress-Admin/apps/web/src/components/settings/fields/SelectField.tsx`
- `ConvexPress-Admin/apps/web/src/components/settings/PageSelect.tsx`
- `ConvexPress-Admin/apps/web/src/components/settings/CategorySelect.tsx`
- `ConvexPress-Admin/apps/web/src/components/settings/TimezoneSelect.tsx`

Outcome:
- Reading, Writing, Privacy, and General settings now use dropdown-style selectors for these fields.
- The active settings experience is more consistent.

### 4. Timezone labels were normalized toward human-readable titles

Problem:
- The timezone selector was showing several raw IANA-ish values like `Europe/Paris` and `America/New_York` directly in labels.

Fix:
- Rewrote the visible labels to be UI-facing titles while preserving the stored IANA values underneath.

Outcome:
- The control now reads like a settings UI rather than a raw schema value list.

## Findings Still Open

### 1. `ComboboxField` still exists and can be reintroduced

Current state:
- The active settings pages audited in this pass no longer use it.
- The component is still present on disk.

Risk:
- Future work could accidentally reintroduce popover-style selectors into settings without noticing.

Recommendation:
- Either deprecate it explicitly or restrict its use to cases where search is mandatory and justified.

### 2. Value-oriented admin summaries still exist in some secondary UI

Examples:
- `ConvexPress-Admin/apps/web/src/components/custom-fields/FieldSettingsPanel.tsx`

Current issue:
- Some summary strings still intentionally surface `value : label` or raw value-centric representations.

Risk:
- These are not dropdown triggers, but they still leak implementation values into the UX.

Recommendation:
- Second-pass audit should clean summary/render-only surfaces the same way this pass cleaned selectors.

### 3. “No popovers” is not globally enforced across the entire admin

Examples:
- notification menus
- user menu
- editor link popover

Current issue:
- This pass removed popover-style settings selectors, not every popover-pattern interaction in the product.

Recommendation:
- Decide whether the rule means:
  - no popover-backed form selectors, or
  - no popover interactions across the admin at all

That distinction matters before broader refactors.

### 4. The wider admin is still not type-clean

Current state:
- The audited files in this pass were cleaned enough to avoid their direct selector/query regressions.
- The admin app still has many unresolved TypeScript failures in unrelated areas such as search dashboards, custom fields, KB, tickets, profile/user editing, Airtable sync, analytics settings misuse, and `wordpressSync`.

Risk:
- Those failures reduce confidence that all backend UX paths are production-stable.

Recommendation:
- Continue the production hardening pass in parallel with UX cleanup, especially around high-traffic admin routes.

## Recommended Next UX Pass

1. Sweep all list-table default states for WordPress parity
   - users
   - menus
   - redirects
   - audit/log tables
   - any entity with status tabs

2. Sweep all admin selectors and summaries for label/value leakage
   - custom fields
   - SEO settings
   - sitemap settings
   - invitation/user-role selectors

3. Decide the global rule for popovers
   - form controls only
   - or the whole admin shell

4. Add a regression checklist for destructive actions
   - trash item
   - confirm item disappears from `All`
   - confirm count badges update
   - confirm item appears only in `Trash`

## Verification Notes

- I re-ran admin type checking after the changes.
- The admin app still has many unrelated type failures.
- The files changed in this pass are no longer the primary source of the remaining failure list.
- One pre-existing unrelated error is still present inside `posts/queries.ts` around `numericId` filtering.
