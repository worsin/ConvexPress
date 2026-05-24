# Content Editor System - Full Code Review & Audit

**Date:** 2026-02-13
**Auditor:** Content Editor System Expert
**Scope:** Complete Content Editor System (frontend hooks, components, extensions, backend functions, website rendering)
**Reference:** `.claude/docs/CONTENT-EDITOR-SYSTEM.md` (Knowledge Doc)
**PRD Status:** NOT FOUND -- `specs/ConvexPress/systems/content-editor/PRD.md` does not exist. The `specs/` directory is absent from the ConvexPress project root. The knowledge doc was used as the primary compliance reference.

---

## Files Audited (43 total)

### Core Hooks (8 files)
| File | Path |
|------|------|
| useContentEditor | `ConvexPress-Admin/apps/web/src/components/editor/useContentEditor.ts` |
| useEditorConfig | `ConvexPress-Admin/apps/web/src/components/editor/useEditorConfig.ts` |
| useEditorForm | `ConvexPress-Admin/apps/web/src/hooks/useEditorForm.ts` |
| useAutosave | `ConvexPress-Admin/apps/web/src/hooks/useAutosave.ts` |
| useEditorKeyboardShortcuts | `ConvexPress-Admin/apps/web/src/hooks/useEditorKeyboardShortcuts.ts` |
| useKeyboardSave | `ConvexPress-Admin/apps/web/src/hooks/useKeyboardSave.ts` |
| useNavigationGuard | `ConvexPress-Admin/apps/web/src/hooks/useNavigationGuard.ts` |
| useUnsavedChangesWarning | `ConvexPress-Admin/apps/web/src/hooks/useUnsavedChangesWarning.ts` |

### Editor Components (14 files)
| File | Path |
|------|------|
| EditorLayout | `ConvexPress-Admin/apps/web/src/components/editor/EditorLayout.tsx` |
| TipTapEditor | `ConvexPress-Admin/apps/web/src/components/editor/TipTapEditor.tsx` |
| ContentEditorProvider | `ConvexPress-Admin/apps/web/src/components/editor/ContentEditorProvider.tsx` |
| BlockToolbar | `ConvexPress-Admin/apps/web/src/components/editor/BlockToolbar.tsx` |
| BlockInserter | `ConvexPress-Admin/apps/web/src/components/editor/BlockInserter.tsx` |
| SlashCommandMenu | `ConvexPress-Admin/apps/web/src/components/editor/SlashCommandMenu.tsx` |
| LinkPopover | `ConvexPress-Admin/apps/web/src/components/editor/LinkPopover.tsx` |
| EditorFooter | `ConvexPress-Admin/apps/web/src/components/editor/EditorFooter.tsx` |
| EditorHeader | `ConvexPress-Admin/apps/web/src/components/editor/EditorHeader.tsx` |
| SaveStatusIndicator | `ConvexPress-Admin/apps/web/src/components/editor/SaveStatusIndicator.tsx` |
| AutosaveStatusBadge | `ConvexPress-Admin/apps/web/src/components/editor/AutosaveStatusBadge.tsx` |
| PostEditLockNotice | `ConvexPress-Admin/apps/web/src/components/editor/PostEditLockNotice.tsx` |
| BlockWrapper | `ConvexPress-Admin/apps/web/src/components/editor/BlockWrapper.tsx` |
| BlockSettingsPanel | `ConvexPress-Admin/apps/web/src/components/editor/BlockSettingsPanel.tsx` |

### Sidebar/Panel Components (2 files)
| File | Path |
|------|------|
| EditorSidebar | `ConvexPress-Admin/apps/web/src/components/editor/EditorSidebar.tsx` |
| DocumentPanel | `ConvexPress-Admin/apps/web/src/components/editor/DocumentPanel.tsx` |

### Extensions (8 files)
| File | Path |
|------|------|
| slash-commands | `ConvexPress-Admin/apps/web/src/components/editor/extensions/slash-commands.ts` |
| callout-block | `ConvexPress-Admin/apps/web/src/components/editor/extensions/callout-block.ts` |
| embed-block | `ConvexPress-Admin/apps/web/src/components/editor/extensions/embed-block.ts` |
| button-block | `ConvexPress-Admin/apps/web/src/components/editor/extensions/button-block.ts` |
| spacer-block | `ConvexPress-Admin/apps/web/src/components/editor/extensions/spacer-block.ts` |
| divider-block | `ConvexPress-Admin/apps/web/src/components/editor/extensions/divider-block.ts` |
| columns-block | `ConvexPress-Admin/apps/web/src/components/editor/extensions/columns-block.ts` |
| reusable-block | `ConvexPress-Admin/apps/web/src/components/editor/extensions/reusable-block.ts` |

### Other Frontend (3 files)
| File | Path |
|------|------|
| slash-command-items | `ConvexPress-Admin/apps/web/src/components/editor/slash-command-items.ts` |
| editor-styles.css | `ConvexPress-Admin/apps/web/src/components/editor/editor-styles.css` |
| editor types | `ConvexPress-Admin/apps/web/src/types/editor.ts` |

### Backend (5 files)
| File | Path |
|------|------|
| Schema | `ConvexPress-Admin/packages/backend/convex/schema/editor.ts` |
| Mutations | `ConvexPress-Admin/packages/backend/convex/editor/mutations.ts` |
| Queries | `ConvexPress-Admin/packages/backend/convex/editor/queries.ts` |
| Internals | `ConvexPress-Admin/packages/backend/convex/editor/internals.ts` |
| Validators | `ConvexPress-Admin/packages/backend/convex/editor/validators.ts` |

### Infrastructure (2 files)
| File | Path |
|------|------|
| Schema Hub | `ConvexPress-Admin/packages/backend/convex/schema.ts` |
| Crons | `ConvexPress-Admin/packages/backend/convex/crons.ts` |

### Website Rendering (1 file)
| File | Path |
|------|------|
| renderContent | `ConvexPress-Website/apps/web/src/lib/blog/renderContent.ts` |

### Hooks (1 file)
| File | Path |
|------|------|
| usePostEditLock | `ConvexPress-Admin/apps/web/src/hooks/posts/usePostEditLock.ts` |
| useMetaboxOrder | `ConvexPress-Admin/apps/web/src/hooks/useMetaboxOrder.ts` |

---

## Audit Results Summary

| Category | Status | Issues |
|----------|--------|--------|
| Radix Imports | CLEAN | 0 violations |
| Hardcoded Colors | CLEAN | 0 violations |
| React 19 Compatibility | CLEAN | Patterns are correct |
| TypeScript Quality | ISSUES | 12 instances of `any` / `as any` |
| PRD Compliance | GAPS | 7 missing features |
| TipTap Integration | ISSUES | 3 configuration problems |
| Architecture | ISSUES | 4 structural concerns |
| Error Handling | ACCEPTABLE | Minor gaps |
| Convex Best Practices | GOOD | 1 gap (missing cron) |
| Accessibility | GOOD | aria-live, aria-label present |

---

## 1. Radix Imports Check

**Result: CLEAN -- Zero violations.**

Searched all editor component files, hooks, extensions, and types for any `@radix-ui` imports. None found. The system correctly uses native HTML elements and custom implementations throughout.

---

## 2. Hardcoded Colors Check

**Result: CLEAN -- Zero violations.**

Searched all editor files for `zinc`, `slate`, `gray`, and other hardcoded Tailwind color names. None found. The system consistently uses:
- CSS variables: `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `border-primary`
- Opacity modifiers: `bg-black/40`, `bg-muted/30`
- CSS custom properties in `editor-styles.css`: `var(--color-primary)`, `var(--color-muted-foreground)`, etc.

---

## 3. React 19 Compatibility

**Result: CLEAN -- All patterns are correct.**

### useRef Patterns (Stable Callback Refs)
The following hooks correctly use `useRef` to store callback references, preventing unnecessary re-renders and effect re-registrations:

- **useEditorKeyboardShortcuts.ts**: `onSaveRef`, `onPreviewRef`, `enabledRef` with empty `[]` dependency on useEffect -- correct React 19 pattern.
- **useKeyboardSave.ts**: `onSaveRef`, `isDirtyRef` with empty `[]` dependency on useEffect -- correct.
- **useEditorConfig.ts**: `onOpenRef`, `onCloseRef` for slash menu callbacks -- correct.
- **useContentEditor.ts**: `onContentChangeRef` for content change callback -- correct.
- **useAutosave.ts**: Uses refs for mutation functions and comparison state -- correct.

### useTransition Pattern
- **useEditorForm.ts**: Uses `useTransition()` for `isSubmitting` state during async Convex mutations -- correct React 19 concurrent rendering pattern.

### No Deprecated Patterns Found
- No `useLayoutEffect` misuse
- No string refs
- No legacy context API
- No `UNSAFE_` lifecycle methods

---

## 4. TypeScript Quality

**Result: 12 issues found.**

### `as any` Casts (5 instances in useEditorForm.ts)

All five are on Convex mutation calls where the TypeScript types don't align between the form values and the mutation argument types:

| Location | Code | Concern |
|----------|------|---------|
| `useEditorForm.ts:139` | `saveDraftMutation(updateArgs as any)` | Type mismatch between form values and mutation args |
| `useEditorForm.ts:154` | `publishMutation(updateArgs as any)` | Same |
| `useEditorForm.ts:171` | `updateMutation(updateArgs as any)` | Same |
| `useEditorForm.ts:186` | `submitForReviewMutation(updateArgs as any)` | Same |
| `useEditorForm.ts:205` | `scheduleMutation({ ...updateArgs, ... } as any)` | Same |

**Root Cause:** The `buildUpdateArgs` function returns `Record<string, unknown>` but the Convex mutations expect specific typed arguments. The proper fix is to define a shared argument type that matches the Convex mutation validators.

**Severity:** Medium -- These casts bypass all type safety on mutation arguments, meaning field name typos or missing required fields would not be caught at compile time.

### `any` Types (7 instances across 4 files)

| File | Location | Code | Fix |
|------|----------|------|-----|
| `types/editor.ts` | BlockDefinition.action | `action: (editor: any) => void` | Should be `Editor` from `@tiptap/core` |
| `types/editor.ts` | SlashCommandItem.action | `action: (editor: any) => void` | Same |
| `slash-commands.ts` | executeSlashCommand | `editor: any` parameter | Should be `Editor` from `@tiptap/core` |
| `EditorLayout.tsx` | ~line 59 | `(user as any)?._id` | Need proper User type from auth/Convex |
| `queries.ts` | denormalizeCreators | `ctx: any, blocks: any[]` | Should use `QueryCtx` from Convex and proper block type |

**Severity:** Low-Medium -- The `editor: any` types are understandable since TipTap's Editor type can be complex, but they eliminate IDE autocompletion and type checking for all editor chain operations.

---

## 5. PRD / Knowledge Doc Compliance

**Result: 7 gaps identified.**

### 5.1 Missing Extensions -- Superscript & Subscript (CRITICAL)

The knowledge doc lists **Superscript** and **Subscript** as required mark types:
> "Mark types: bold, italic, underline, strikethrough, code, link, highlight, superscript, subscript"

**Current state:**
- `@tiptap/extension-superscript` is NOT in `package.json`
- `@tiptap/extension-subscript` is NOT in `package.json`
- Neither is imported or registered in `useEditorConfig.ts`
- The BlockToolbar does not have Superscript/Subscript toggle buttons
- The slash command items do not include these marks

**Impact:** Users cannot create superscript or subscript text in the editor.

### 5.2 Code Block Extension Disabled (HIGH)

The knowledge doc lists **Code Block** as a required block type and specifies syntax highlighting support. The `slash-command-items.ts` file registers a "Code Block" slash command that calls `editor.chain().focus().toggleCodeBlock().run()`.

**Current state:**
- `codeBlock: false` in StarterKit configuration
- `@tiptap/extension-code-block-lowlight` is installed in `package.json` but NOT configured
- `lowlight` package is NOT installed (comment in useEditorConfig says "Until those are installed")
- `highlight.js` IS installed (found in node_modules)
- The slash command for Code Block exists and will silently fail (toggleCodeBlock is not registered)
- The BlockToolbar has a "Code Block" option in its block type selector dropdown
- The BlockSettingsPanel has a `CodeBlockSettings` component for language selection

**Impact:** Users see "Code Block" in the slash menu and toolbar but it does nothing. This is a confusing UX.

### 5.3 Typography Extension Missing (LOW)

The knowledge doc mentions smart typography. The `@tiptap/extension-typography` package is not installed or configured.

**Impact:** No auto-replacement of straight quotes to smart quotes, em dashes, etc.

### 5.4 Autosave Debounce Interval Deviation (LOW)

Knowledge doc specifies 30-second default debounce for autosave:
> "Autosave debounce: 30 seconds (default)"

**Current state:** `useAutosave.ts` uses `debounceMs = 2000` (2 seconds) as default.

**Assessment:** The 2-second debounce is arguably better for UX (faster saves), but deviates from the documented specification. The periodic interval (60s) matches the doc.

### 5.5 Missing Autosave Recovery Dialog (MEDIUM)

The knowledge doc specifies:
> "Recovery dialog when newer autosave exists"

No autosave recovery dialog has been implemented. When a user opens a post that has a newer autosave revision, there is no prompt to restore the autosaved version.

### 5.6 Reusable Block "Convert to Regular" is a Stub (MEDIUM)

In `reusable-block.ts`, the `convertReusableToRegular` command is defined but only calls `editor.commands.deleteSelection()` instead of actually resolving the reusable block's content and inserting it as regular blocks.

```typescript
// Current (stub):
convertReusableToRegular:
  () =>
  ({ commands }) => {
    return commands.deleteSelection();
  },
```

**Impact:** Using "Convert to Regular Blocks" on a reusable block will delete it instead of converting it.

### 5.7 Missing PRD File (DOCUMENTATION)

The `specs/ConvexPress/systems/content-editor/PRD.md` file does not exist. The entire `specs/ConvexPress/` directory structure is absent from the project root. Only the knowledge doc (`.claude/docs/CONTENT-EDITOR-SYSTEM.md`) exists as a specification reference.

---

## 6. TipTap Integration Issues

### 6.1 Code Block Commands Registered Without Extension (HIGH)

As noted in 5.2 above, the slash command item for "Code Block" in `slash-command-items.ts` calls `editor.chain().focus().toggleCodeBlock().run()`, but the codeBlock extension is disabled in StarterKit. This command will silently fail.

Similarly, `BlockToolbar.tsx` includes a block type selector option for "Code Block" that also calls `toggleNode("codeBlock", "paragraph")`, which will fail.

And `BlockSettingsPanel.tsx` has a `CodeBlockSettings` component that modifies `codeBlock` attributes -- also non-functional.

**Recommendation:** Either install and configure CodeBlockLowlight, or remove Code Block from the slash commands, toolbar, and settings panel until it is properly set up.

### 6.2 handleToggleLink Redundant Branches (LOW)

In `TipTapEditor.tsx`, the `handleToggleLink` function has identical code in both branches:

```typescript
const handleToggleLink = useCallback(() => {
  if (!editor) return;
  if (editor.isActive("link")) {
    // If link is active, show popover to edit
    setShowLinkPopover(true);
  } else {
    // If no link, show popover to add
    setShowLinkPopover(true);
  }
}, [editor]);
```

Both branches do the same thing: `setShowLinkPopover(true)`. This can be simplified to a single call.

### 6.3 parsedContent Not Memoized (LOW)

In `useContentEditor.ts`, the initial content parsing happens on every render:

```typescript
const parsedContent = (() => {
  if (!initialContent) return undefined;
  try {
    return JSON.parse(initialContent);
  } catch {
    return undefined;
  }
})();
```

This IIFE runs on every render but the result is only used as the `content` prop for `useEditor`, which only reads it on initialization. While not a performance problem (JSON.parse of unchanged strings is fast), it is cleaner to memoize with `useMemo`.

---

## 7. Architecture Issues

### 7.1 ContentEditorProvider Not Wired Up (MEDIUM)

`ContentEditorProvider.tsx` defines a React context for sharing editor state (isReadOnly, canUploadFiles, canCreateReusableBlocks, onContentChange) but it is NOT used anywhere in the component tree:

- `EditorLayout.tsx` does not wrap its children in `ContentEditorProvider`
- `TipTapEditor.tsx` does not consume `useEditorContext()`
- No other component imports `useEditorContext`

The context exists as dead code. Either it should be wired into the component tree or removed.

### 7.2 Duplicate CSS: BlockWrapper vs editor-styles.css (MEDIUM)

`BlockWrapper.tsx` exports an `editorBlockStyles` string containing ProseMirror CSS rules that substantially overlap with `editor-styles.css`. Both define styles for:
- `.ProseMirror` base styles
- Block hover/selection states
- Callout blocks
- Spacer blocks
- Button blocks
- Reusable blocks
- Embed blocks
- Divider blocks
- Column blocks

There is also a CSS variable naming inconsistency:
- `editor-styles.css` uses `var(--color-primary)`, `var(--color-muted-foreground)` (with `--color-` prefix)
- Some rules in `BlockWrapper.tsx` use the same convention but inline

**Impact:** Any styling change needs to be made in two places. Risk of visual inconsistency when one is updated and the other is not.

### 7.3 Inconsistent Navigation Blocker APIs (LOW)

Two hooks serve nearly identical purposes with different TanStack Router blocker APIs:

| Hook | API Used |
|------|----------|
| `useNavigationGuard.ts` | `useBlocker({ blockerFn, condition })` |
| `useUnsavedChangesWarning.ts` | `useBlocker({ shouldBlockFn, withResolver: false })` |

`useNavigationGuard` uses `blockerFn` + `condition`, while `useUnsavedChangesWarning` uses `shouldBlockFn` + `withResolver`. These may be targeting different versions of the TanStack Router useBlocker API, or one may be using a deprecated API surface.

**Recommendation:** Consolidate to one hook using the current TanStack Router API, or document why both are needed.

### 7.4 EditorSidebar and DocumentPanel Are Unused Scaffolding (LOW)

`EditorSidebar.tsx` and `DocumentPanel.tsx` are fully implemented components that are not imported or used anywhere. They appear to be scaffolding for a future tabbed sidebar layout (Gutenberg-style Document/Block tabs).

- `EditorSidebar.tsx`: Tab container for Document/Block tabs
- `DocumentPanel.tsx`: Summary view of post settings

Neither is imported by `EditorLayout.tsx` or any other component.

**Impact:** Dead code. Not harmful but adds maintenance burden.

---

## 8. Missing Cron Registration (MEDIUM)

### cleanupExpiredLocks Not Registered

`ConvexPress-Admin/packages/backend/convex/editor/internals.ts` defines a `cleanupExpiredLocks` internal mutation that deletes editor locks past their `expiresAt` timestamp. However, this function is NOT registered in `ConvexPress-Admin/packages/backend/convex/crons.ts`.

Every other system that has a cleanup internal has its cron registered (Registration, Revision, Search, Email, Site Notification, Audit Log, Sitemap, API, Routing, Event Dispatcher, Media). The Content Editor System is the only one missing its cron.

**Impact:** Expired editor locks are only cleaned up when new lock acquisition checks find them. If a user's browser crashes and they never return, the lock will persist in the database indefinitely (though it will be ignored by `getLock` which checks expiry). Over time, stale lock records accumulate.

**Recommendation:** Add to `crons.ts`:
```typescript
// ── Content Editor System ──────────────────────────────────────────────────
// Hourly cleanup of expired editor locks (locks older than 2 minutes).
// Editor locks use a 30s heartbeat; any lock not renewed for 2+ minutes is stale.
// Added by: Content Editor System Expert
crons.hourly(
  "editor-lock-cleanup",
  { minuteUTC: 45 },
  internal.editor.internals.cleanupExpiredLocks,
);
```

---

## 9. Error Handling Assessment

### Good Patterns Found
- `useAutosave.ts`: Catches save errors, sets error status with message, provides `clearError()` function
- `useEditorForm.ts`: Try/catch around all mutation calls with `sonner` toast notifications for errors
- `mutations.ts`: Validates content JSON, checks title length, content size, locked state, circular references
- `queries.ts`: Returns empty arrays for unauthenticated users, null for missing records
- `usePostEditLock.ts`: Catches lock acquisition failures, surfaces error state
- `renderContent.ts`: Graceful fallback for unknown node types (renders as paragraph)

### Gaps
- **useContentEditor.ts**: JSON.parse of initialContent silently swallows errors and returns `undefined`. While this is acceptable (the editor just starts empty), it could log a warning for debugging.
- **slash-commands.ts**: `executeSlashCommand` does not catch errors from command execution. If a command's `action` function throws, the error propagates unhandled.
- **BlockSettingsPanel.tsx**: No error handling for `getAttributes()` calls. If the editor state is out of sync, these could return unexpected values.

**Overall:** Error handling is acceptable. The critical paths (saving, autosave, lock management) have proper error handling. The gaps are in non-critical areas.

---

## 10. Convex Best Practices

### Good Patterns
- **Modular schema**: `schema/editor.ts` exports `editorTables` which is spread into the hub `schema.ts` -- correct pattern
- **Index usage**: `reusableBlocks` has `by_status`, `by_category`, `by_created`; `editorLocks` has `by_post`, `by_user`, `by_expires` -- all query-aligned
- **Search index**: `search_blocks` on title with status/category filter fields -- correct Convex search pattern
- **Validator reuse**: `validators.ts` defines shared argument objects used across mutations and queries
- **Internal functions**: Cleanup and system operations correctly use `internalMutation` / `internalQuery`
- **Permission checks**: Mutations use `requireCan()` helper for capability-based access control
- **Batch processing**: `cleanupExpiredLocks` collects and processes in reasonable batches

### Gap
- **cleanupExpiredLocks query pattern**: The cleanup function queries ALL locks then filters expired ones in JavaScript. It should use the `by_expires` index to only fetch expired locks:

```typescript
// Current (less efficient):
const allLocks = await ctx.db.query("editorLocks").collect();
const expired = allLocks.filter(lock => lock.expiresAt < now);

// Better:
const expired = await ctx.db
  .query("editorLocks")
  .withIndex("by_expires", q => q.lt("expiresAt", now))
  .collect();
```

---

## 11. Accessibility Assessment

### Good Patterns Found
- `useContentEditor.ts`: Editor has `role="textbox"`, `aria-multiline="true"`, `aria-label="Content editor"`
- `SaveStatusIndicator.tsx`: Uses `aria-live="polite"` for status announcements
- `AutosaveStatusBadge.tsx`: Uses `aria-live="polite"` for autosave status
- `BlockToolbar.tsx`: Buttons have `aria-label`, `aria-pressed`, `title` attributes
- `PostEditLockNotice.tsx`: Uses `role="alert"` for the lock warning banner
- `EditorFooter.tsx`: Uses `role="status"` for stats display

### Gaps
- **BlockInserter.tsx**: No keyboard navigation within the block list (no ArrowUp/ArrowDown support to move between block items). Users must Tab through each item.
- **SlashCommandMenu.tsx**: Has ArrowUp/ArrowDown/Enter/Escape keyboard handling -- good.
- **BlockSettingsPanel.tsx**: Native `<select>` and `<input>` elements are inherently accessible -- good.

---

## 12. Miscellaneous Findings

### 12.1 Divider Block `style` Attribute Name Conflict (LOW)

`divider-block.ts` uses `style` as a custom attribute name for the divider's border style (solid/dashed/dotted/double). This conflicts with the HTML `style` attribute naming convention. While TipTap handles this as a custom node attribute (not an HTML attribute), it can cause confusion when reading code.

### 12.2 BlockInserter Uses ASCII Character Icons (LOW)

`BlockInserter.tsx` uses ASCII characters for block type icons (e.g., letters, symbols) instead of Lucide React icons. The component has a comment noting "production-ready version with icon components." This is a placeholder approach.

### 12.3 BlockToolbar Uses Inline SVGs (LOW)

`BlockToolbar.tsx` uses inline SVG icons instead of importing from Lucide React. This works but is inconsistent with the rest of the admin app which uses Lucide React icons.

### 12.4 Slug Editor Potential Duplication (LOW)

`EditorLayout.tsx` appears to render a slug editor both inline (below the title) and as a sidebar metabox. If both are rendered, changes in one may not sync to the other.

### 12.5 `useCallback` in `updateStats` Doesn't Need Dependencies (TRIVIAL)

In `useContentEditor.ts`, `updateStats` is wrapped in `useCallback` with empty `[]` deps, but it calls `setStats` which is stable. The `useCallback` is technically unnecessary since the function is only called inside `onUpdate` and `onCreate` callbacks, not passed as a prop. However, it does no harm.

---

## Issue Severity Summary

### CRITICAL (2)
1. **Missing Superscript/Subscript extensions** -- Knowledge doc requires these marks but packages are not installed and extensions are not configured
2. **Code Block silently broken** -- Slash command and toolbar show Code Block option but the extension is disabled, causing silent failures

### HIGH (1)
3. **Code Block commands registered without extension** -- Three places reference Code Block (slash menu, toolbar, settings panel) but the extension is not active

### MEDIUM (5)
4. **`as any` casts in useEditorForm.ts** -- 5 Convex mutation calls bypass type safety
5. **ContentEditorProvider not wired up** -- Dead context that should be integrated or removed
6. **Missing autosave recovery dialog** -- Knowledge doc specifies this feature
7. **Reusable Block convert-to-regular is a stub** -- Destructive behavior (deletes instead of converting)
8. **Missing cron for cleanupExpiredLocks** -- Stale locks accumulate in database

### LOW (8)
9. **`any` types in 4 files** -- 7 instances of loose typing
10. **Duplicate CSS in BlockWrapper vs editor-styles.css** -- Maintenance burden
11. **Inconsistent navigation blocker APIs** -- Two hooks, two different TanStack Router APIs
12. **EditorSidebar/DocumentPanel unused** -- Dead code scaffolding
13. **handleToggleLink redundant branches** -- Identical code in both branches
14. **parsedContent not memoized** -- IIFE runs every render (low impact)
15. **BlockInserter lacks keyboard navigation** -- Tab-only navigation through block list
16. **Autosave debounce deviates from spec** -- 2s vs documented 30s

---

## Recommended Fix Priority

### Phase 1: Fix Critical/High Issues
1. Install `@tiptap/extension-superscript` and `@tiptap/extension-subscript`; add to `useEditorConfig.ts`; add toolbar buttons
2. Install `lowlight` package; configure `CodeBlockLowlight` in `useEditorConfig.ts` (highlight.js is already installed)
3. OR: Remove Code Block from slash commands, toolbar, and settings panel until properly configured

### Phase 2: Fix Medium Issues
4. Define proper TypeScript types for mutation arguments to eliminate `as any` casts
5. Either wire up `ContentEditorProvider` in `EditorLayout` or remove it
6. Implement autosave recovery dialog
7. Implement `convertReusableToRegular` properly (resolve block content, insert as regular blocks)
8. Register `cleanupExpiredLocks` cron in `crons.ts`

### Phase 3: Clean Up Low Issues
9. Replace `any` types with proper `Editor` type from `@tiptap/core` and `QueryCtx` from Convex
10. Consolidate duplicate CSS into single source of truth (editor-styles.css)
11. Consolidate navigation blocker hooks
12. Remove or document unused EditorSidebar/DocumentPanel
13. Simplify handleToggleLink
14. Memoize parsedContent
15. Add keyboard navigation to BlockInserter
16. Document autosave debounce rationale (2s vs 30s)

---

## Overall Assessment

The Content Editor System is **well-architected and largely functional**. The core TipTap integration, autosave system, edit locking, custom extensions, slash commands, and keyboard shortcuts all follow sound patterns. React 19 compatibility is clean. No Radix imports or hardcoded colors were found.

The two critical issues (missing Superscript/Subscript and broken Code Block) are both extension configuration gaps that are straightforward to fix. The medium issues are mostly about completing stub implementations and wiring up existing infrastructure.

The Convex backend is clean, well-indexed, and follows the modular schema pattern correctly. The website-side rendering pipeline is comprehensive and handles all custom block types properly.

**Estimated overall completion vs knowledge doc: ~82%**

The missing 18% is:
- Superscript/Subscript marks (~3%)
- Code Block with syntax highlighting (~5%)
- Autosave recovery dialog (~3%)
- Reusable block convert-to-regular (~2%)
- ContentEditorProvider integration (~2%)
- Cron registration (~1%)
- TypeScript strictness (~2%)
