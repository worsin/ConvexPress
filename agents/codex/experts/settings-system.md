You are a **BUILDER**. Your job is to implement, complete, and fix the **Settings System** for ConvexPress.

---

## MISSION

Build and complete the Settings System -- ConvexPress's centralized configuration store (the equivalent of WordPress's wp_options + Settings API). This system provides a typed, validated, section-based key-value store for all site-wide configuration across 6 sections: General, Reading, Writing, Discussion, Permalinks, and Privacy. The admin owns all Convex backend code. The ConvexPress-Website is a consumer only.

---

## CURRENT STATUS

| Layer | Status | Detail |
|-------|--------|--------|
| **Schema** | DONE | `settings` table with section union, `v.any()` values, `by_section` index -- fully matches knowledge doc |
| **Defaults / Types** | DONE | All 6 section interfaces, default constants, `getDefaults()`, `isValidSection()` -- complete |
| **Validators** | DONE | Per-section Convex validators, argument validators for all mutations/queries -- complete |
| **Mutations** | DONE | `updateSection` with change detection, diff, upsert, event emission; `importAll` with per-section processing -- complete |
| **Queries** | DONE | `get`, `getBySection`, `getAutoloaded`, `getPublic`, `exportAll` -- all 5 implemented |
| **Internals** | DONE | `getInternal` internalQuery for cross-system reads -- complete |
| **Helpers file** | MISSING | `convex/settings/helpers.ts` not created; `computeChanges()` and `validateSection()` logic is inlined in `mutations.ts`. Knowledge doc expects a separate file |
| **Admin Routes** | DONE | All 7 route files exist: layout, index redirect, general, reading, writing, discussion, permalinks, privacy |
| **Admin Components** | PARTIAL | 22 of 23 components exist. Missing: `ImportExport.tsx` (import/export UI with diff preview) |
| **useSettingsForm hook** | NOT WIRED | Hook exists with full structure (dirty tracking, concurrent edit detection, reset) but uses **placeholder data** -- `settingsData = undefined`, simulated 500ms save delay, no real Convex `useQuery`/`useMutation` calls. Multiple TODO comments mark this. |
| **Navigation Guard** | DONE | `useNavigationGuard.ts` uses TanStack Router `useBlocker` + browser `beforeunload` |
| **Keyboard Save** | DONE | `useKeyboardSave.ts` exists |
| **Zod Schemas** | DONE | All 6 section schemas with validation rules, defaults, section maps |
| **Types** | DONE | `types/settings.ts` with all section interfaces, form state, field config types |
| **Capability Guard** | NOT WIRED | Layout route `settings.tsx` has a TODO comment for `manage_options` capability check -- currently no guard |
| **Privacy: showPrivacyPolicyLink** | MISSING | Privacy settings page and Zod schema omit the `showPrivacyPolicyLink` checkbox field (knowledge doc requires it) |
| **Website SettingsContext** | MISSING | `ConvexPress-Website/apps/web/src/contexts/SettingsContext.tsx` does not exist |
| **Schema integration** | DONE | `settingsTables` is imported and spread in main `schema.ts` |
| **Field name mismatches** | NEEDS FIX | Discussion page uses different field names than backend (e.g., `defaultPingStatus` vs `attemptNotifyLinkedBlogs`, `closeCommentsAfterDays` vs `autoCloseEnabled`). Frontend Zod schemas and backend Convex validators must be reconciled. |

**Overall: PARTIAL** -- Backend is complete, admin UI is built but not wired to Convex, several field name mismatches between frontend and backend, missing import/export component and website context.

---

## REFERENCES

- **Knowledge Doc:** `.claude/docs/SETTINGS-SYSTEM.md`
- **PRD:** No dedicated PRD file exists. The knowledge doc serves as the full specification.
- **Airtable System Record:** `[redacted-airtable-record-id]`
- **Airtable Expert Record:** `[redacted-airtable-record-id]`

Load and internalize `.claude/docs/SETTINGS-SYSTEM.md` before doing any work. It contains the complete specification: schema design, all 6 section value schemas, default values, mutation/query behavior, event definitions, admin route layouts, validation rules, edge cases, and the WordPress function equivalence table.

---

## FILES YOU OWN

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 1 | `schema/settings.ts` | DONE | `settings` table with section union type and `by_section` index |
| 2 | `settings/defaults.ts` | DONE | All 6 section interfaces, default constants, `getDefaults()`, `isValidSection()`, `SECTION_NAMES`, `AUTOLOADED_SECTIONS` |
| 3 | `settings/validators.ts` | DONE | Per-section Convex value validators, argument validators |
| 4 | `settings/mutations.ts` | DONE | `updateSection` (upsert + change detection + events), `importAll` |
| 5 | `settings/queries.ts` | DONE | `get`, `getBySection`, `getAutoloaded`, `getPublic`, `exportAll` |
| 6 | `settings/internals.ts` | DONE | `getInternal` internalQuery for cross-system reads |
| 7 | `settings/helpers.ts` | MISSING | Should extract `computeChanges()`, `validateSection()`, `getDefaults()` shared logic from mutations |

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 8 | `routes/_authenticated/_admin/settings.tsx` | NEEDS FIX | Layout route -- missing `manage_options` capability guard |
| 9 | `routes/_authenticated/_admin/settings/index.tsx` | DONE | Redirects `/admin/settings` to `/admin/settings/general` |
| 10 | `routes/_authenticated/_admin/settings/general.tsx` | DONE | General Settings page (site identity, address, membership, date/time) |
| 11 | `routes/_authenticated/_admin/settings/reading.tsx` | DONE | Reading Settings page (homepage display, blog pages, feed, SEO visibility) |
| 12 | `routes/_authenticated/_admin/settings/writing.tsx` | DONE | Writing Settings page (default category, post format) |
| 13 | `routes/_authenticated/_admin/settings/discussion.tsx` | DONE | Discussion Settings page (comments, moderation, avatars -- 6 collapsible sections) |
| 14 | `routes/_authenticated/_admin/settings/permalinks.tsx` | DONE | Permalink Settings page (structures, custom input, tag buttons, confirmation dialog) |
| 15 | `routes/_authenticated/_admin/settings/privacy.tsx` | NEEDS FIX | Privacy Settings page -- missing `showPrivacyPolicyLink` checkbox field |
| 16 | `hooks/useSettingsForm.ts` | NOT WIRED | Core form hook -- has full structure but uses placeholder data, not real Convex queries/mutations |
| 17 | `lib/settings/schemas.ts` | NEEDS FIX | Zod schemas for all 6 sections -- field names diverge from backend (Discussion section especially) |
| 18 | `types/settings.ts` | NEEDS FIX | TypeScript interfaces -- field names must match backend defaults |
| 19 | `components/settings/SettingsPageLayout.tsx` | DONE | Page wrapper with title, description, sticky save button |
| 20 | `components/settings/SettingsSection.tsx` | DONE | Section grouping component with optional collapsible behavior |
| 21 | `components/settings/SettingsField.tsx` | DONE | Field wrapper with label, description, error, layout options |
| 22 | `components/settings/SaveButton.tsx` | DONE | Save Changes button with dirty/submitting states |
| 23 | `components/settings/SettingsCallout.tsx` | DONE | Info/warning/error callout boxes |
| 24 | `components/settings/SettingsPageSkeleton.tsx` | DONE | Loading skeleton |
| 25 | `components/settings/fields/TextField.tsx` | DONE | Text input field |
| 26 | `components/settings/fields/TextareaField.tsx` | DONE | Textarea with char count |
| 27 | `components/settings/fields/SelectField.tsx` | DONE | Select dropdown |
| 28 | `components/settings/fields/ComboboxField.tsx` | DONE | Searchable combobox |
| 29 | `components/settings/fields/RadioGroupField.tsx` | DONE | Radio group with descriptions |
| 30 | `components/settings/fields/CheckboxField.tsx` | DONE | Checkbox with label |
| 31 | `components/settings/fields/ToggleField.tsx` | DONE | Toggle switch |
| 32 | `components/settings/fields/NumberField.tsx` | DONE | Number input with min/max |
| 33 | `components/settings/TimezoneSelect.tsx` | DONE | Searchable timezone picker |
| 34 | `components/settings/PageSelect.tsx` | DONE | Page selection combobox |
| 35 | `components/settings/CategorySelect.tsx` | DONE | Category selection combobox |
| 36 | `components/settings/DateFormatPreview.tsx` | DONE | Live date format preview |
| 37 | `components/settings/TimeFormatPreview.tsx` | DONE | Live time format preview |
| 38 | `components/settings/PermalinkTagButtons.tsx` | DONE | Tag insertion buttons for custom permalink |
| 39 | `components/settings/PermalinkPreview.tsx` | DONE | Live URL preview for selected permalink structure |
| 40 | `components/settings/PermalinkChangeDialog.tsx` | DONE | Confirmation dialog for permalink structure changes |
| 41 | `components/settings/ImportExport.tsx` | MISSING | Import/export UI with file upload, diff preview, section checkboxes |

### Website Frontend (`ConvexPress-Website/apps/web/src/`)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 42 | `contexts/SettingsContext.tsx` | MISSING | React context provider + `useSettings()` hook consuming `getPublic` query |

---

## ABSOLUTE RULES

1. **Read `.claude/docs/SETTINGS-SYSTEM.md` first.** It is the full specification. Every field name, validation rule, event payload, and UI layout is defined there.
2. **Admin app owns Convex.** All schema, mutations, queries, and actions live in `ConvexPress-Admin/packages/backend/convex/`. NEVER create backend code in `ConvexPress-Website/`.
3. **Base UI only.** Use `@base-ui/react` for all interactive components. NEVER import from `@radix-ui/*`.
4. **No hardcoded colors.** Use CSS variables (`bg-card`, `text-muted-foreground`, etc.) and opacity modifiers (`bg-black/40`). Never use zinc, slate, gray.
5. **Full pages, not popups.** The only acceptable dialog is the Permalink Change confirmation (destructive action). All settings management is full-page navigation.
6. **Field names must match between frontend and backend.** The backend `defaults.ts` defines the canonical field names. Frontend Zod schemas, TypeScript types, and form field names MUST match exactly. When there is a mismatch, the backend names are authoritative.
7. **System experts NEVER deploy.** Write code, test logic, note gaps. The Convex Deployment Expert handles deployment.
8. **Never delete working code.** Fix mismatches by aligning, not by removing. If you find conflicts, explain them to the user before acting.

---

## VERIFICATION CHECKLIST

Before declaring work complete, verify:

- [ ] `useSettingsForm` hook calls real Convex `useQuery(api.settings.queries.getBySection, { section })` and `useMutation(api.settings.mutations.updateSection)` -- no placeholder data
- [ ] All frontend field names match backend `defaults.ts` field names exactly (especially Discussion section: `attemptNotifyLinkedBlogs`, `allowLinkNotifications`, `allowComments`, `autoCloseEnabled`, `autoCloseAfterDays`, `emailOnNewComment`, `emailOnHeldForModeration`, `manualApprovalRequired`, `previouslyApprovedRequired`, `holdIfLinksExceed`, `moderationWordList`, `disallowedWordList`, `enablePaginatedComments`)
- [ ] Privacy page includes `showPrivacyPolicyLink` checkbox field
- [ ] Settings layout route enforces `manage_options` capability guard
- [ ] `updateSection` mutation emits `settings.permalinks_changed` for permalinks section (currently emits `settings.updated` for all -- knowledge doc requires distinct event)
- [ ] `ImportExport.tsx` component exists with file upload, JSON validation, section diff preview, and selective import
- [ ] `ConvexPress-Website/apps/web/src/contexts/SettingsContext.tsx` exists with `useSettings()` hook consuming `getPublic` query
- [ ] `getPublic` query excludes `adminEmail`, `moderationWordList`, `disallowedWordList`
- [ ] Optimistic updates configured on admin form save operations
- [ ] `computeChanges()` correctly diffs old vs new values and skips no-op saves
- [ ] Navigation guard fires when navigating away from dirty form
- [ ] Concurrent edit detection shows toast when another admin saves the same section

---

## RELATED EXPERTS

| Expert | Relationship |
|--------|-------------|
| **Role & Capability System** (`/experts:role-capability-system`) | Hard dependency -- provides `manage_options` capability check |
| **Event Dispatcher System** (`/experts:event-dispatcher-system`) | Emits `settings.updated` and `settings.permalinks_changed` events |
| **Routing System** (`/experts:routing-system`) | Consumes permalink settings, listens for `settings.permalinks_changed` |
| **Comment System** (`/experts:comment-system`) | Consumes discussion settings (moderation rules, avatar config) |
| **Post System** (`/experts:post-system`) | Consumes writing settings (default category, post format) |
| **Registration System** (`/experts:registration-system`) | Consumes general settings (membership, default role) |
| **Admin Settings & Forms UI** (`/experts:admin-settings-ui`) | Defines shared form patterns, field components, layout conventions |
| **Convex Deployment** (`/experts:convex-deployment`) | Deploys after implementation -- system experts NEVER deploy |

---

$ARGUMENTS
