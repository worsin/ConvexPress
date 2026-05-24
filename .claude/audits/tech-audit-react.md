# React Technology Audit -- KB, Ticket System & Support Bridge

**Auditor:** React Technology Expert Agent
**Date:** 2026-04-02
**Scope:** 32 files across Admin KB routes, Admin Ticket routes, Admin Support routes, Website Help routes, Website Support routes, Widget components, and Widget hooks.
**React KB Version:** All checklist items, known issues, best practices, and documented Claude mistakes from `.claude/commands/experts/tech/react-expert.md`

---

## Summary

**Files Audited:** 32
**Critical Issues:** 2
**High Issues:** 12
**Medium Issues:** 16
**Low Issues:** 8
**Total Issues:** 38

The codebase is generally well-structured with good patterns for loading/error/empty states, proper use of `key` props, and consistent styling using CSS variables. The most impactful findings are: (1) a suppressed `eslint-disable react-hooks/exhaustive-deps` that masks a real dependency bug, (2) pervasive use of `any` type assertions -- especially in the Website app -- undermining TypeScript's safety, (3) missing `useEffect` dependency arrays in the article reader's `trackView` call, and (4) multiple instances of unguarded `async` handlers on buttons without debounce protection against double-clicks.

---

## Critical Issues

### CRIT-1: Suppressed exhaustive-deps ESLint rule hides stale closure bug

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx`
- **Line:** 85-86
- **Rule:** Audit Checklist #7 (Hooks rules compliance), Known Issue "useEffect exhaustive-deps lint rule ignored"
- **Description:** The `useEffect` that populates form fields has `// eslint-disable-next-line react-hooks/exhaustive-deps` and depends only on `[art?._id]`. However, the effect body reads `art.title`, `art.content`, `art.excerpt`, `art.slug`, `art.categoryId`, `art.metaTitle`, `art.metaDescription`, and `art.keywords`. If the article object updates in-place (same `_id`, different field values -- e.g. another admin edits it), the effect will NOT re-run, leaving stale values in the form. This is exactly the stale closure pattern the KB flags as HIGH severity.
- **Fix:** Remove the eslint-disable comment. Either depend on `[art]` (the full object, which changes reference when Convex updates it), or destructure the needed fields into the dependency array. Since Convex reactive queries return new object references on data change, `[art]` is correct here.

### CRIT-2: Missing useEffect dependencies -- trackView fires only once even when article changes

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`
- **Line:** 154-161
- **Rule:** Audit Checklist #5 (useEffect cleanup), Known Issue "Stale closures in useEffect"
- **Description:** The `useEffect` that calls `trackView` depends on `[art?._id, sessionId]` but also uses `trackView` (a Convex mutation reference). While mutation references are typically stable, the more serious issue is that `trackView` is called inside an effect with no cleanup or guard against StrictMode double-invocation. In development, this will fire the view-tracking mutation twice per page load.
- **Fix:** Add an AbortController or a `hasTracked` ref to prevent double-tracking. Additionally, include `trackView` in the dependency array or extract it via `useRef` (the latter is already done elsewhere in the widget code -- follow that pattern).

---

## High Issues

### HIGH-1: Pervasive `any` type assertions in Website routes

- **Files:**
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/index.tsx` (lines 79, 81, 110, 114)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx` (lines 33, 53, 54, 73)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/collections/$slug.tsx` (lines 44, 45, 85)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx` (lines 25-28, 63, 64, 104)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx` (line 151, 152, 167-168)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx` (lines 93, 109, 119)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx` (lines 60, 68)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/index.tsx` (line 50)
  - `ConvexPress-Website/apps/web/src/components/support/views/TicketDetailView.tsx` (lines 23, 38, 39, 77)
  - `ConvexPress-Website/apps/web/src/components/support/views/TicketFormView.tsx` (line 61)
- **Rule:** Audit Checklist #17 (TypeScript strict typing), Best Practice "MUST DO"
- **Description:** Over 30 instances of `as any` casts across website code. Many are on Convex query results (`data as any`, `category as any`, `error: any`). This completely defeats TypeScript's type safety and can hide runtime bugs where the actual data shape doesn't match assumptions.
- **Fix:** Create proper type definitions for Convex query return types. For `@ts-expect-error` on `convexQuery` + `useSuspenseQuery`, consider creating typed wrapper hooks. For error handling, use `catch (error: unknown)` with proper type narrowing instead of `catch (error: any)`.

### HIGH-2: `@ts-expect-error` comments suppress type safety on every SSR-prefetched query

- **Files:**
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/index.tsx` (lines 33, 37)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx` (line 26, 31)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/collections/$slug.tsx` (line 26)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx` (line 48)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx` (line 132)
- **Rule:** Audit Checklist #17 (TypeScript strict typing)
- **Description:** Seven `@ts-expect-error` annotations with identical comment "Convex query type mismatch with useSuspenseQuery". This is a systematic type compatibility issue between `@convex-dev/react-query` and `@tanstack/react-query` that should be resolved once with a typed utility, not suppressed repeatedly.
- **Fix:** Create a typed wrapper like `useConvexSuspenseQuery<T>(queryRef, args)` that handles the type bridging in one place.

### HIGH-3: Multiple `catch (error: any)` in Website support routes

- **Files:**
  - `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx` (lines 93, 109, 119)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx` (line 68)
- **Rule:** Audit Checklist #17 (TypeScript strict typing)
- **Description:** Using `catch (error: any)` instead of `catch (error: unknown)`. The admin routes consistently use `catch (err: unknown)` with proper type narrowing -- the website routes should follow the same pattern.
- **Fix:** Replace `error: any` with `error: unknown` and use `(error as { data?: { message?: string } })?.data?.message` pattern matching the admin routes.

### HIGH-4: No Error Boundaries around route-level components

- **Files:** All 30 component files
- **Rule:** Audit Checklist #8 (Error Boundaries for critical UI sections), Known Issue "Suspense boundary doesn't catch errors"
- **Description:** None of the KB, Ticket, or Support routes wrap their content in Error Boundaries. If a Convex query throws (network error, permission denied, etc.), the entire app crashes with a white screen. The Website help routes use `useSuspenseQuery` which is especially vulnerable -- a query failure propagates as a thrown error with no boundary to catch it.
- **Fix:** Add Error Boundaries at the route level. TanStack Router supports `errorComponent` in route definitions -- use that. At minimum, add an `ErrorBoundary` wrapper around `useSuspenseQuery`-consuming components in the Website app.

### HIGH-5: Ticket detail page uses `as any` for attachment rendering

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx`
- **Line:** 240
- **Rule:** Audit Checklist #17 (TypeScript strict typing)
- **Description:** `msg.attachments.map((att: any, i: number) => ...)` uses `any` type for attachment objects. The `messages` type is already defined inline (line 124-130) and includes `attachments?: Array<{ name: string; size: number }>`, so the `any` cast is unnecessary and incorrect.
- **Fix:** Remove `any` type annotation: `msg.attachments.map((att, i) => ...)`. TypeScript will infer the correct type from the already-typed `messages` array.

### HIGH-6: Inline type assertion for `data` destructuring bypasses Convex return type

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx`
- **Line:** 102-131
- **Rule:** Audit Checklist #17 (TypeScript strict typing)
- **Description:** The entire `data` return from `getTicketWithReplies` is cast with `as { ticket: ...; messages: ... }`. This is a large manual type definition that could drift from the actual Convex function return type, creating silent type mismatches.
- **Fix:** Import or infer the return type from the Convex function definition. Use `typeof api.tickets.queries.getTicketWithReplies` with Convex's `FunctionReturnType` utility if available.

### HIGH-7: `handleReply` button lacks `void` wrapper on async call -- unhandled promise

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx`
- **Line:** 184
- **Rule:** Best Practice "MUST DO: Disable or Debounce Mutating Actions"
- **Description:** `onClick={handleReply}` passes the async function directly. Unlike the admin ticket detail which uses `onClick={() => void handleReply()}`, this directly assigns the async function. React will receive the Promise return from the event handler. Additionally, rapid clicks can fire multiple replies before `disabled` state takes effect.
- **Fix:** Change to `onClick={() => void handleReply()}`. Consider adding a debounce or setting a `isSending` flag before the await (which is already partially implemented but should wrap the onClick).

### HIGH-8: `handleReopen` button lacks `void` wrapper -- unhandled promise

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx`
- **Line:** 202
- **Rule:** Best Practice "MUST DO: Disable or Debounce Mutating Actions"
- **Description:** `onClick={handleReopen}` directly assigns async function without `void` wrapper. Also missing `disabled` state during reopen mutation.
- **Fix:** Change to `onClick={() => void handleReopen()}`. Add `isReopening` state to disable the button during the mutation.

### HIGH-9: Missing accessible labels on several form controls

- **Files:**
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/settings.tsx` (lines 218-223) -- Meilisearch checkbox has no label, only a sibling `<span>`
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/settings.tsx` (lines 256-260) -- RAG checkbox has no label
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx` (lines 217-232) -- Search input has no associated label or `aria-label`
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx` -- Inline editing inputs for `name`, `description`, `icon` in categories table rows lack labels
- **Rule:** Audit Checklist #18 (ARIA roles and semantic HTML), Best Practice "MUST DO: Every Form Field Needs A Visible Label", "MUST DO: Icon-Only Controls Require Accessible Names"
- **Fix:** Add `id` and `htmlFor` pairs for checkbox toggles. Add `aria-label` to the search input. Add `aria-label` attributes to inline edit inputs in table rows.

### HIGH-10: No large list virtualization for potentially unbounded lists

- **Files:**
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/categories.tsx` -- Full category list rendered
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/tags.tsx` -- Full tag list rendered
  - `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx` (line 33) -- Fetches up to 50 articles with no pagination
- **Rule:** Audit Checklist #15 (Large list virtualization)
- **Description:** Categories and tags lists render all items without pagination or virtualization. The category page fetches `perPage: 50` which is manageable but has no pagination for categories with more articles.
- **Fix:** Add pagination to the category page. For admin lists with potentially hundreds of items, consider adding pagination or virtualization via `@tanstack/react-virtual`.

### HIGH-11: Workflow steps use array index as `key` prop

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/workflows.tsx`
- **Lines:** 248, 333
- **Rule:** Audit Checklist #6 (Stable unique keys), Known Issue "Using array index as key prop"
- **Description:** `form.steps.map((step, idx) => <div key={idx}>...)` and `w.steps.map((step, idx) => <span key={idx}>...)` use array index as key. Since steps can be reordered, added, or removed, this causes React to incorrectly reuse DOM nodes, potentially corrupting input values in the step builder.
- **Fix:** Add a unique `id` field to each `WorkflowStep` (e.g., `crypto.randomUUID()`) and use that as the key.

### HIGH-12: `renderTipTapNodes` uses array index as `key` for all rendered elements

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`
- **Lines:** 55-79, 95-123
- **Rule:** Audit Checklist #6 (Stable unique keys)
- **Description:** Every node in `renderTipTapNodes` and `renderInlineContent` uses the array index as key: `<p key={i}>`, `<ul key={i}>`, etc. For a TipTap document renderer where content is static and doesn't reorder, this is acceptable -- but the pattern propagates a bad habit.
- **Fix:** Low priority for static content rendering, but consider generating stable keys from content hashes if content can change during viewing (e.g., real-time collaboration).

---

## Medium Issues

### MED-1: Admin KB Settings form uses 13 separate useState calls instead of a form object

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/settings.tsx`
- **Lines:** 37-57
- **Rule:** Best Practice (Code Style)
- **Description:** The settings form uses 13 individual `useState` calls for each field. This makes the form hard to maintain, easy to miss a field when syncing, and produces excessive re-renders. A single `useReducer` or object state would be cleaner.
- **Fix:** Consolidate into a single form state object with `useReducer` or use TanStack Form (which is in the project's tech stack but not used here).

### MED-2: Ticket analytics page has inconsistent `as Record<string, number>` casts

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/analytics.tsx`
- **Lines:** 79, 111, 131-132, 179-189
- **Rule:** Audit Checklist #17 (TypeScript strict typing)
- **Description:** Multiple `as Record<string, number>` casts scattered throughout the component to access `stats.counts`, `stats.priorityCounts`, and `rateLimitStats` properties. The `stats` query result should have a proper type.
- **Fix:** Define a `TicketStats` interface matching the Convex query return type and use it consistently.

### MED-3: Non-null assertion on `art!.status` after null check

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx`
- **Line:** 175
- **Rule:** TypeScript best practices
- **Description:** `const isPublished = art!.status === "published"` uses non-null assertion. At this point in the code, `article` has been checked for null/undefined, but `art` (which is `article as KBArticle | null | undefined`) could still theoretically be null. The `!` hides this.
- **Fix:** Use optional chaining: `const isPublished = art?.status === "published"` or assert after the null check section.

### MED-4: Context value not memoized in widget state

- **File:** `ConvexPress-Website/apps/web/src/components/support/hooks/useWidgetState.ts`
- **Rule:** Known Issue "Context causing unnecessary re-renders"
- **Description:** The `useWidgetState` hook returns a spread of `state` plus callback functions on every render. If this were passed through Context, all consumers would re-render on every state change. Currently it's used directly in `SupportWidget`, so the impact is contained, but if extracted to a Context provider later, this becomes a perf issue.
- **Fix:** Low priority while used directly. If extracted to Context, memoize the return value with `useMemo`.

### MED-5: `useEffect` in WidgetPanel depends on `onClose` callback -- potential infinite loop

- **File:** `ConvexPress-Website/apps/web/src/components/support/widget/WidgetPanel.tsx`
- **Line:** 32-37
- **Rule:** Known Issue "Infinite re-render loops from object/array dependencies"
- **Description:** `useEffect` depends on `[isOpen, onClose]`. If `onClose` is not memoized by the parent (it IS memoized via `useCallback` in `useWidgetState`), this would cause the effect to re-run and re-attach the keydown listener on every render. Currently safe because `close` is memoized, but fragile.
- **Fix:** Add a comment noting the memoization requirement, or use `useEffectEvent` (React 19.2+) for the escape handler.

### MED-6: Search input in ticket list table updates URL on every keystroke

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx`
- **Lines:** 222-230
- **Rule:** Best Practice "MUST DO: Disable or Debounce Mutating Actions"
- **Description:** The search input's `onChange` immediately navigates (updating the URL search params) on every keystroke. This triggers a new Convex query for each character typed, creating unnecessary load. Should be debounced.
- **Fix:** Use a debounced callback (e.g., `useDebouncedCallback` or `setTimeout`/`clearTimeout` pattern) to only update the URL after the user stops typing for 300ms.

### MED-7: KB article editor has no unsaved changes warning on navigation

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx`
- **Rule:** Best Practice (UX)
- **Description:** The `isDirty` state is tracked but there's no `beforeunload` event listener or TanStack Router navigation guard to warn the user when they navigate away with unsaved changes. The "Unsaved changes" text indicator is shown but doesn't prevent accidental data loss.
- **Fix:** Add a `useEffect` with `beforeunload` listener when `isDirty` is true. Use TanStack Router's `useBlocker` or `beforeLoad` guard.

### MED-8: Article content renderer doesn't validate TipTap node types against allowlist

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`
- **Lines:** 29-80
- **Rule:** Audit Checklist #1 (dangerouslySetInnerHTML without sanitization), Known Issue "dangerouslySetInnerHTML XSS"
- **Description:** While the renderer does NOT use `dangerouslySetInnerHTML` (good!), it does render arbitrary TipTap JSON content into React elements. The `sanitizeLinkHref` function (line 82-86) properly blocks `javascript:` and `data:` URLs, which is correct. However, there is no validation that the TipTap node types are from an expected allowlist. A malicious article could include unexpected node types that render as `<div>` containers with potentially harmful nested content.
- **Fix:** Add an allowlist check at the top of `renderTipTapNodes` to only process known TipTap node types and skip/ignore any unrecognized ones.

### MED-9: `handleFeedback` in AIAnswerView uses `setTimeout` without cleanup

- **File:** `ConvexPress-Website/apps/web/src/components/support/views/AIAnswerView.tsx`
- **Line:** 102
- **Rule:** Known Issue "Memory leaks from missing useEffect cleanup"
- **Description:** `setTimeout(onHelpful, 1000)` is called in an event handler but never cleared. If the component unmounts before the timeout fires (e.g., user closes widget), it will call `onHelpful` on an unmounted component.
- **Fix:** Store the timeout ID in a ref and clear it on unmount via a `useEffect` cleanup.

### MED-10: `generateAnswerRef` pattern duplicated across two components

- **Files:**
  - `ConvexPress-Website/apps/web/src/components/support/views/AIAnswerView.tsx` (lines 53-54)
  - `ConvexPress-Website/apps/web/src/components/support/views/SearchResultsView.tsx` (lines 52-53)
- **Rule:** Claude Mistake "Check existing codebase patterns before writing new code"
- **Description:** Both components independently implement the same ref-wrapping pattern for `useAction`. This should be a shared hook like `useLatestRef` or `useStableAction`.
- **Fix:** Extract a `useLatestRef` utility hook and use it in both components.

### MED-11: `useSuspenseQuery` with computed query options may cause issues

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx`
- **Lines:** 47-55
- **Rule:** Correctness
- **Description:** When `hasQuery` is false, the code passes `{ queryKey: ["kb-search-empty"], queryFn: () => ({ results: [], total: 0 }) }` to `useSuspenseQuery`. This is mixing Convex query options with raw React Query options in a potentially incompatible way. The `convexQuery` helper likely returns a specific format, and manually providing `queryKey`/`queryFn` may not match that expected interface.
- **Fix:** Use a conditional `enabled: false` pattern or handle the empty state before the query call with early return.

### MED-12: Missing `aria-label` on color swatch buttons

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/tags.tsx`
- **Lines:** 152-156
- **Rule:** Audit Checklist #18 (ARIA roles), Best Practice "MUST DO: Icon-Only Controls Require Accessible Names"
- **Description:** Color swatch buttons in the tag creation form have no `aria-label`. Screen reader users cannot determine which color they're selecting.
- **Fix:** Add `aria-label={`Select color ${c}`}` to each color swatch button.

### MED-13: Ticket detail message thread has no auto-scroll to bottom

- **Files:**
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx`
  - `ConvexPress-Website/apps/web/src/components/support/views/TicketDetailView.tsx`
- **Rule:** UX best practice
- **Description:** After sending a reply, the message thread does not scroll to the newest message. Users have to manually scroll down to see their sent reply or new messages. The widget's TicketDetailView has an `overflow-y-auto` container but no scroll-to-bottom behavior.
- **Fix:** Add a `useEffect` with a ref to scroll to the bottom when `messages.length` changes.

### MED-14: `handleSubmit` in support/new.tsx doesn't wrap with `void`

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx`
- **Line:** 91
- **Rule:** Best Practice
- **Description:** `<form onSubmit={handleSubmit}>` passes the async function directly. Should be `onSubmit={(e) => void handleSubmit(e)}` to properly handle the Promise return.
- **Fix:** Change to `onSubmit={(e) => void handleSubmit(e)}`.

### MED-15: Dead import -- `useNavigate` imported but not used effectively in tickets list

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx`
- **Line:** 13
- **Rule:** Code cleanliness
- **Description:** `useNavigate` is imported twice -- once from `@tanstack/react-router` on line 9 (via `createFileRoute`) context, and again explicitly on line 13. While it is used, the double import path is redundant since `Route.useNavigate()` could be used instead.
- **Fix:** Minor -- consolidate to one import pattern.

### MED-16: Category page queries articles before category data is confirmed

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx`
- **Lines:** 30-37
- **Rule:** Correctness
- **Description:** `useSuspenseQuery` for articles uses `(category as any)?._id` as the `categoryId` parameter. If `category` is null (not found), this still fires a query with `undefined` as the categoryId, which may return all uncategorized articles or error out. The null check on line 39 happens AFTER the query.
- **Fix:** Handle the category-not-found case before querying articles, or use a conditional query.

---

## Low Issues

### LOW-1: Hardcoded string `"bg-success"` color in KB analytics progress bar

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/analytics.tsx`
- **Line:** 111
- **Rule:** UI Rules -- No Hardcoded Colors
- **Description:** `className="bg-success h-full transition-all"` -- while `bg-success` is likely a CSS variable, verify it's defined in the theme.
- **Fix:** Verify `bg-success` is a CSS variable, not a hardcoded Tailwind color.

### LOW-2: TipTap node type rendering falls through to generic `<div>` wrapper

- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`
- **Line:** 76
- **Rule:** Correctness
- **Description:** The `default` case in `renderTipTapNodes` renders unknown node types as `<div>` containers. This silently renders content that may not be intended for display.
- **Fix:** Log a warning for unknown node types in development. In production, skip unknown nodes.

### LOW-3: `useMemo` for date range computation is unnecessary

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/support/analytics.tsx`
- **Line:** 42-49
- **Rule:** Performance (over-optimization)
- **Description:** `useMemo` is used to compute two date strings from `days`. The computation is trivial (two `Date` operations and `toISOString` calls). The `useMemo` adds complexity without meaningful performance benefit.
- **Fix:** Low priority. With React Compiler this will be auto-handled. Leave as-is or simplify.

### LOW-4: `formatTimeAgo` utility duplicated across three files

- **Files:**
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx` (lines 111-120)
  - `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/index.tsx` (lines 31-39)
  - `ConvexPress-Website/apps/web/src/components/support/views/TicketListView.tsx` (lines 171-181)
- **Rule:** Claude Mistake "Check existing codebase patterns before writing new code"
- **Description:** Nearly identical `formatTimeAgo` / `formatRelativeTime` utility functions are defined in three separate files. Should be a shared utility.
- **Fix:** Extract to a shared `utils/formatTime.ts` file and import from there.

### LOW-5: `formatDuration` utility duplicated in two admin ticket files

- **Files:**
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/analytics.tsx` (lines 23-29)
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx` (lines 35-44)
- **Rule:** Code duplication
- **Description:** Identical `formatDuration` function in two files.
- **Fix:** Extract to shared utility.

### LOW-6: `StatCard` component duplicated between KB analytics and Ticket analytics

- **Files:**
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/analytics.tsx` (lines 20-41)
  - `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/analytics.tsx` (lines 33-58)
- **Rule:** Code duplication
- **Description:** Nearly identical `StatCard` components defined in two analytics pages.
- **Fix:** Extract to a shared `components/admin/StatCard.tsx` component.

### LOW-7: Widget button unread count not wired

- **File:** `ConvexPress-Website/apps/web/src/components/support/widget/SupportWidget.tsx`
- **Line:** 49
- **Rule:** Claude Mistake "Stop at scaffolding and call it done"
- **Description:** `<WidgetButton>` supports an `unreadCount` prop (defined in `WidgetButton.tsx` line 16) but `SupportWidget` never passes it. The unread badge will never appear.
- **Fix:** Wire the `unreadCount` prop to a Convex query that returns the count of unread ticket updates.

### LOW-8: Unused `cn` import inconsistency

- **Files:** Several admin route files use string concatenation/joining for class names while `cn` utility exists in the project. Widget components consistently use `cn`.
- **Rule:** Code cleanliness
- **Fix:** Standardize on `cn()` for conditional class names across all files.

---

## Checklist Coverage

| # | Check | Result |
|---|-------|--------|
| 1 | dangerouslySetInnerHTML without sanitization | PASS -- not used anywhere |
| 2 | javascript: protocol injection | PASS -- `sanitizeLinkHref` in article reader blocks it |
| 3 | Secrets/API keys in client code | PASS -- no hardcoded secrets found. API keys in settings are password-type inputs |
| 4 | eval() / Function() usage | PASS -- not found |
| 5 | useEffect cleanup functions | FAIL -- CRIT-2 (trackView), MED-9 (setTimeout) |
| 6 | Stable unique keys | FAIL -- HIGH-11 (workflow steps), HIGH-12 (TipTap nodes) |
| 7 | Hooks rules compliance | FAIL -- CRIT-1 (suppressed exhaustive-deps) |
| 8 | Error Boundaries | FAIL -- HIGH-4 (none found in any route) |
| 9 | forwardRef deprecation | PASS -- no `forwardRef` usage found |
| 10 | defaultProps deprecated | PASS -- no `defaultProps` usage found |
| 11 | React 19 new hooks adoption | INFO -- `useReducer` used in widget state (good). No `useActionState` or `useOptimistic` adoption yet |
| 12 | StrictMode enabled | N/A -- controlled at app root, not per-system |
| 13 | Bundle splitting / lazy loading | N/A -- handled by TanStack Router code splitting |
| 14 | Unnecessary re-renders | WARN -- MED-1 (13 useState in settings), MED-6 (URL update per keystroke) |
| 15 | Large list virtualization | WARN -- HIGH-10 (no virtualization on unbounded lists) |
| 16 | Dependency versions | N/A -- not audited per-file |
| 17 | TypeScript strict typing | FAIL -- HIGH-1 through HIGH-6 (pervasive `any` and type assertions) |
| 18 | ARIA roles and semantic HTML | FAIL -- HIGH-9 (missing labels), MED-12 (color swatches) |
| 19 | Keyboard navigation | PASS -- WidgetPanel has Escape handler, buttons are accessible |
| 20 | Image alt text | N/A -- no images rendered in these components |

---

## Claude Mistake Pattern Checks

| Pattern | Found? |
|---------|--------|
| Writing code without checking existing patterns | YES -- `formatTimeAgo` duplicated 3x (LOW-4), `StatCard` duplicated 2x (LOW-6) |
| Using mock data instead of real data | PASS -- all components use `useQuery`/`useMutation` |
| Missing loading and error states | PASS -- all data-fetching components handle loading (most handle error/empty too) |
| Saving to wrong path | N/A |
| Stopping at scaffolding | PARTIAL -- `KBArticleListTable.tsx` is explicitly marked as "placeholder" (line 12); widget unreadCount not wired (LOW-7) |
| Deleting code to work around problems | N/A |
| Missing toast notifications | PASS -- all mutations have toast feedback |
| Missing form validation | PASS -- forms validate required fields before submission |
| Missing aria-labels | YES -- HIGH-9, MED-12 |
