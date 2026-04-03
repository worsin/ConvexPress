# Code Maxing: Fix Every Issue — Complete Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 174 production audit issues across KB, Tickets, and Support Bridge — bringing every file to production quality.

**Architecture:** 9 phases, 27 tasks. Phases 1-3 are sequential (critical path). Phases 4-9 can be parallelized. Each task touches a focused set of files with no cross-task conflicts.

**Tech Stack:** Convex (with `paginationOptsValidator` for proper pagination), TanStack Router, TanStack Start, Base UI, Tailwind CSS v4

**Key Context7 Findings (latest docs):**
- Pagination: Use `paginationOptsValidator` + `.paginate()` + `usePaginatedQuery` on client
- Internal functions: `internalMutation` for server-only, call via `internal.module.function`
- Router navigation: Use `to: '/tickets/$ticketId'` with `params: { ticketId }`, never `/_authenticated/_admin/`
- SSR: Use `loader` for prefetch, `ssr: 'data-only'` for server data + client render
- Cron pattern: `crons.daily("name", { hourUTC, minuteUTC }, internal.module.function, {})`

---

## Phase 1: Critical Fixes (must do first, sequential)

### Task 1: Fix infinite loops in widget views

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/SearchResultsView.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/AIAnswerView.tsx`

**Problem:** `useAction` from Convex returns a new reference every render. Including it in `useEffect` deps causes infinite API calls.

- [ ] **Step 1:** In `SearchResultsView.tsx`, find the `useEffect` that calls `generateAnswer`. Remove `generateAnswer` from the dependency array. Use a ref pattern:
```typescript
const generateAnswerRef = useRef(generateAnswer);
generateAnswerRef.current = generateAnswer;

useEffect(() => {
  // ... use generateAnswerRef.current(...) instead of generateAnswer(...)
}, [query, sessionId]); // generateAnswer removed from deps
```

- [ ] **Step 2:** Apply the same ref pattern in `AIAnswerView.tsx`.

- [ ] **Step 3:** In `AIAnswerView.tsx`, accept pre-fetched result as an optional prop instead of always re-fetching. Only call `generateAnswer` if no pre-fetched result is provided.

- [ ] **Step 4:** Update `useWidgetState.ts` to store the AI result in state when transitioning from `searchResults` to `aiAnswer`, and pass it through to `AIAnswerView`.

- [ ] **Step 5:** Commit: `fix(widget): prevent infinite loops in SearchResults and AIAnswer views`

---

### Task 2: Fix broken import + critical frontend errors

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/settings.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/kb/KBArticleListTable.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/collections.tsx`

- [ ] **Step 1:** In `tickets/settings.tsx`, fix the import from `@convexpress-admin/backend/generated/api` to `@backend/convex/_generated/api`.

- [ ] **Step 2:** In `KBArticleListTable.tsx`, replace ALL `[var(--color-*)]` patterns with Tailwind semantic tokens (`border-border`, `text-muted-foreground`, `bg-card`, `bg-primary`, `text-primary`, `text-primary-foreground`). Replace `text-white` with `text-primary-foreground`. Replace `bg-green-500/10 text-green-600` with `bg-success/10 text-success`. Replace `bg-yellow-500/10 text-yellow-600` with `bg-warning/10 text-warning`. Replace `bg-blue-500/10 text-blue-600` with `bg-primary/10 text-primary`. Replace `bg-black/5` with `bg-foreground/5`.

- [ ] **Step 3:** Fix the "All" tab active state bug: change `(search.status ?? "all") === (tab === "all" ? undefined : tab)` to a proper check.

- [ ] **Step 4:** In `kb/collections.tsx`, replace the placeholder with a functional collections management page. Model after `kb/categories.tsx` or `kb/tags.tsx` — list with CRUD form, wired to `api.kb.collections.*`.

- [ ] **Step 5:** Commit: `fix(admin): fix broken import, hardcoded colors, placeholder page`

---

### Task 3: Fix SSR hydration issues

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/hooks/useSessionId.ts`

- [ ] **Step 1:** In the article reader, replace the `useRef` sessionStorage pattern with a proper client-only hook using `useEffect`:
```typescript
const [sessionId, setSessionId] = useState<string | undefined>(undefined);
useEffect(() => {
  let id = sessionStorage.getItem("kb_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("kb_session_id", id);
  }
  setSessionId(id);
}, []);
```
Guard all queries/mutations that use sessionId with `sessionId ? { ... } : "skip"`.

- [ ] **Step 2:** In `useSessionId.ts`, replace the two-state pattern with a single state that initializes as `undefined` and gets set in `useEffect`. Return `undefined` while loading so consumers can skip queries:
```typescript
const [sessionId, setSessionId] = useState<string | undefined>(undefined);
useEffect(() => {
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed.expiresAt > Date.now()) {
      setSessionId(parsed.id);
      return;
    }
  }
  const newId = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: newId, expiresAt: Date.now() + TTL }));
  setSessionId(newId);
}, []);
return { sessionId, isReady: sessionId !== undefined };
```

- [ ] **Step 3:** Update all widget views that consume `sessionId` to handle `undefined` (skip queries when not ready).

- [ ] **Step 4:** Commit: `fix(website): resolve SSR hydration issues in session handling`

---

## Phase 2: Performance (can run in parallel batches)

### Task 4: Convert KB queries to Convex pagination

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/queries.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/validators.ts`

Replace ALL `.collect()` + `.slice()` pagination with Convex-native `.paginate()`:

- [ ] **Step 1:** In `validators.ts`, add pagination imports and args:
```typescript
import { paginationOptsValidator } from "convex/server";
export const paginatedArticleArgs = {
  paginationOpts: paginationOptsValidator,
  status: v.optional(kbArticleStatusValidator),
  categoryId: v.optional(v.id("kb_categories")),
  authorId: v.optional(v.id("users")),
  search: v.optional(v.string()),
};
```

- [ ] **Step 2:** In `queries.ts`, convert `list` to use `.paginate()`:
```typescript
export const list = query({
  args: paginatedArticleArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new ConvexError({ code: "UNAUTHORIZED", message: "Auth required" });
    
    let q = ctx.db.query("kb_articles");
    if (args.status) {
      q = q.withIndex("by_status", (q) => q.eq("status", args.status));
    }
    // For search, use searchIndex separately
    if (args.search) {
      return ctx.db.query("kb_articles")
        .withSearchIndex("search_articles", (q) => q.search("contentPlainText", args.search))
        .paginate(args.paginationOpts);
    }
    return await q.order("desc").paginate(args.paginationOpts);
  },
});
```

- [ ] **Step 3:** Convert `listPublished` to use `.paginate()` with `by_status` index:
```typescript
let q = ctx.db.query("kb_articles")
  .withIndex("by_status", (q) => q.eq("status", "published"));
if (args.categoryId) {
  // Post-filter by category since we can't use two indexes
  // But paginate first for efficiency
}
return await q.order("desc").paginate(args.paginationOpts);
```

- [ ] **Step 4:** Fix `getPopular` and `getRecent` to use `by_status` index filtered to published, then sort in-memory with `.take(limit)` pattern:
```typescript
const published = await ctx.db.query("kb_articles")
  .withIndex("by_status", (q) => q.eq("status", "published"))
  .collect();
return published
  .sort((a, b) => b.viewCount - a.viewCount)
  .slice(0, limit);
```
Note: For small-medium KBs this is fine. For large KBs, a denormalized "popular articles" cache would be needed.

- [ ] **Step 5:** Commit: `perf(kb): convert queries to Convex-native pagination`

---

### Task 5: Convert Ticket queries to Convex pagination

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/queries.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/validators.ts`

- [ ] **Step 1:** Add `paginationOptsValidator` to ticket query args in `validators.ts`.

- [ ] **Step 2:** Convert `getMyTickets` to use `.paginate()`.

- [ ] **Step 3:** Convert `getQueue` to use `.paginate()` with the best available index.

- [ ] **Step 4:** Fix `getStats` to use indexed queries with date ranges instead of loading all tickets. Use `by_status` index to count per-status, and `by_created` with date range for 30-day metrics.

- [ ] **Step 5:** Fix `getAwaitingFirstResponse` to use `by_status` index + filter for null `firstResponseAt`.

- [ ] **Step 6:** Commit: `perf(tickets): convert queries to Convex-native pagination`

---

### Task 6: Fix analytics full-table scans

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/analytics.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/support/analytics.ts`

- [ ] **Step 1:** In KB `analytics.ts`, fix `getDashboardStats` to use `by_date` index with date range:
```typescript
const views = await ctx.db.query("kb_pageViews")
  .withIndex("by_date", (q) => q.gte("createdAt", startDate).lte("createdAt", endDate))
  .collect();
```

- [ ] **Step 2:** Fix `getSearchAnalytics` same pattern.

- [ ] **Step 3:** In support `analytics.ts`, fix all three queries (`getDeflectionStats`, `getTopDeflectingArticles`, `getCommonUnanswered`) to use `by_date` index with range bounds.

- [ ] **Step 4:** Commit: `perf(analytics): use indexed date ranges instead of full table scans`

---

### Task 7: Remove placeholder internals + fix cleanup functions

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/internals.ts`

- [ ] **Step 1:** Remove the placeholder `syncToMeilisearch` internal mutation that falsely marks articles as synced. The real sync is in `meilisearch.ts`.

- [ ] **Step 2:** Remove the placeholder `syncToRag` internal mutation. The real sync is in `rag.ts`.

- [ ] **Step 3:** Verify `cleanupPageViews` uses the index properly (already fixed in round 3, confirm).

- [ ] **Step 4:** Commit: `fix(kb): remove placeholder sync internals that falsely mark articles synced`

---

## Phase 3: Security Hardening

### Task 8: Fix auth gaps in backend mutations

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/sessions.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/support/deflection.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/analytics.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/meilisearch.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/rag.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/rateLimit.ts`

- [ ] **Step 1:** In `sessions.ts::associateUser`, add auth check:
```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new ConvexError({ code: "UNAUTHORIZED", message: "Auth required" });
// Verify the caller IS the user being associated
const user = await ctx.db.query("users").withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject)).first();
if (!user || user._id !== args.userId) throw new ConvexError({ code: "FORBIDDEN", message: "Cannot associate another user" });
```

- [ ] **Step 2:** In `sessions.ts::create`, validate sessionId format (UUID pattern, max 64 chars).

- [ ] **Step 3:** In `deflection.ts::logInteraction`, add sessionId validation (check it exists in `ticket_sessions`) and max-length validation on query/aiResponse fields.

- [ ] **Step 4:** In `kb/analytics.ts`, the input validation was added in round 3 — verify it's complete.

- [ ] **Step 5:** In `meilisearch.ts::searchMeilisearch`, sanitize `categorySlug` to prevent Meilisearch filter injection. Escape quotes and special characters.

- [ ] **Step 6:** In `rag.ts::searchRag`, add auth check (at minimum `ctx.auth.getUserIdentity()`).

- [ ] **Step 7:** In `rateLimit.ts::getStatus`, add session ownership validation.

- [ ] **Step 8:** Commit: `security: fix auth gaps in sessions, deflection, analytics, search`

---

### Task 9: Input validation sweep

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/mutations.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/feedback.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/progress.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/comments.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/mutations.ts`

- [ ] **Step 1:** In KB `mutations.ts::create`, add empty title check: `if (!title) throw ConvexError(...)`.

- [ ] **Step 2:** Add `MAX_KB_CONTENT_LENGTH` constant (5MB) and validate in `create` and `update`.

- [ ] **Step 3:** In `feedback.ts`, add article existence check in `submitHelpful` and `submitRating`. Add `MAX_KB_FEEDBACK_COMMENT_LENGTH` (1000) validation.

- [ ] **Step 4:** In `progress.ts`, validate `progressPercent` (0-100), `scrollPosition` (>= 0), `readTime` (>= 0).

- [ ] **Step 5:** In `comments.ts::vote`, check comment is approved and not deleted before allowing vote.

- [ ] **Step 6:** In ticket `mutations.ts`, fix tag sanitization: trim, lowercase, strip HTML. Fix `userNameSnapshot` operator precedence issue.

- [ ] **Step 7:** Commit: `security: comprehensive input validation across KB and tickets`

---

### Task 10: API key security

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/settings.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/support/settings.ts`

- [ ] **Step 1:** In both settings query functions, mask API keys in the response:
```typescript
if (search?.meilisearchApiKey) {
  search.meilisearchApiKey = search.meilisearchApiKey.slice(0, 4) + "..." + search.meilisearchApiKey.slice(-4);
}
```

- [ ] **Step 2:** In the action files that USE the API keys (`meilisearch.ts`, `rag.ts`, `deflection.ts`), always read the FULL key from the settings table directly (via internal query), never from the masked client-facing query.

- [ ] **Step 3:** Commit: `security: mask API keys in settings query responses`

---

## Phase 4: Data Integrity

### Task 11: Fix denormalization and race conditions

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/workflows.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/categories.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/feedback.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/kb/mutations.ts`

- [ ] **Step 1:** In `workflows.ts::approveStep`, add duplicate approval guard (already done in round 3 — verify). Add check that article isn't archived/deleted before publishing. Add `updatedAt` to category patch.

- [ ] **Step 2:** In `categories.ts::update`, check for circular parenting by walking the parent chain.

- [ ] **Step 3:** In `categories.ts::remove`, reset `meilisearchSynced`/`ragSynced` flags when clearing article categoryId.

- [ ] **Step 4:** In `feedback.ts::submitRating`, emit `KB_EVENTS.FEEDBACK_SUBMITTED` event (currently only `submitHelpful` emits it).

- [ ] **Step 5:** In `mutations.ts::publish`, clear `scheduledAt` field for immediate publishes.

- [ ] **Step 6:** In `workflows.ts::rejectStep`, store the rejection reason on the articleWorkflow record (add `rejectionReason: v.optional(v.string())` to schema if needed, or store in the approvals array).

- [ ] **Step 7:** Commit: `fix: data integrity improvements across KB backend`

---

### Task 12: Fix message count drift + event gaps

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/messages.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/tickets/mutations.ts`

- [ ] **Step 1:** In `messages.ts::remove`, do NOT decrement `messageCount` (the message still exists as soft-deleted).

- [ ] **Step 2:** In `internals.ts::autoCloseResolved`, increment `messageCount` when inserting system message. Also emit `TICKET_EVENTS.CLOSED` event.

- [ ] **Step 3:** In `mutations.ts::unassign`, add `TICKET_EVENTS.UNASSIGNED` event code (or rename the event emission to clearly indicate unassignment in the payload).

- [ ] **Step 4:** In `mutations.ts::addTags`/`removeTags`, change capability from `ticket.updateStatus` to `ticket.respond` (more appropriate).

- [ ] **Step 5:** Commit: `fix(tickets): fix message count drift, add missing events, fix capabilities`

---

## Phase 5: Admin Frontend Quality

### Task 13: Purge all `as any` casts from admin routes

**Files:** ALL admin route files in `kb/` and `tickets/`

- [ ] **Step 1:** Create a shared type file `ConvexPress-Admin/apps/web/src/types/kb.ts` with TypeScript types matching the Convex return shapes:
```typescript
import type { Id } from "@backend/convex/_generated/dataModel";
export type KBArticle = { _id: Id<"kb_articles">; title: string; slug: string; ... };
export type KBCategory = { _id: Id<"kb_categories">; name: string; ... };
// etc.
```

- [ ] **Step 2:** Create `types/tickets.ts` with ticket types.

- [ ] **Step 3:** Replace every `as any` cast in KB admin routes with proper types. Key files: `new.tsx`, `$articleId/edit.tsx`, `categories.tsx`, `tags.tsx`, `templates.tsx`, `workflows.tsx`, `analytics.tsx`, `settings.tsx`.

- [ ] **Step 4:** Replace every `as any` cast in Ticket admin routes: `index.tsx`, `$ticketId.tsx`, `analytics.tsx`, `settings.tsx`.

- [ ] **Step 5:** Commit: `fix(admin): replace all as-any casts with proper TypeScript types`

---

### Task 14: Fix admin navigation + missing features

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`

- [ ] **Step 1:** Fix navigation paths: change `"/_authenticated/_admin/tickets/$ticketId"` to proper TanStack Router form: `navigate({ to: '/tickets/$ticketId', params: { ticketId } })`.

- [ ] **Step 2:** Fix all `navigate({ to: "/_authenticated/_admin/..." })` patterns across all admin files.

- [ ] **Step 3:** In KB article editor, remove "(TipTap editor coming soon)" placeholder text.

- [ ] **Step 4:** In KB article editor, add tag selector (multi-select wired to `api.kb.tags.list` and `api.kb.tags.addToArticle`/`removeFromArticle`).

- [ ] **Step 5:** In `KBArticleListTable.tsx`, add search input, pagination controls, and fix the "All" tab active state bug.

- [ ] **Step 6:** In `nav-config.ts`, change KB section capability from `edit_posts` to `kb.view`. Change Tickets section capability from `edit_posts` to `ticket.view`.

- [ ] **Step 7:** Commit: `fix(admin): fix navigation, remove placeholders, add missing features`

---

### Task 15: Add missing loading/error states + accessibility

**Files:** ALL admin route files

- [ ] **Step 1:** Add loading skeletons to all pages that use `useQuery` (match the form layout).

- [ ] **Step 2:** Add empty states ("No articles yet", "No tickets found", etc.) to all list views.

- [ ] **Step 3:** Add error toasts (via Sonner) for all failed mutations.

- [ ] **Step 4:** Add `aria-label` to all icon-only buttons (edit, delete, close, etc.).

- [ ] **Step 5:** Add confirmation dialogs for all delete operations.

- [ ] **Step 6:** Commit: `fix(admin): add loading states, empty states, error handling, accessibility`

---

## Phase 6: Website Quality

### Task 16: Fix article URLs + SEO

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/help/collections/$slug.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx`

- [ ] **Step 1:** Fix all page titles — use resolved names instead of raw slugs. In `head()`, format slugs to title case as fallback: `slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())`.

- [ ] **Step 2:** Fix search page to not fire empty queries. Use `"skip"` pattern when no query.

- [ ] **Step 3:** In article reader, fix conditional query pattern from `("skip" as any)` to proper Convex skip: `useQuery(api.kb.feedback.getUserFeedback, sessionId && art?._id ? { articleId: art._id, sessionId } : "skip")`.

- [ ] **Step 4:** In article reader, fix related article links to use `related.categorySlug` instead of current page's `categorySlug`.

- [ ] **Step 5:** Add `loader` for `listPublished` in `$categorySlug.tsx` (two-step: load category first, then articles).

- [ ] **Step 6:** Commit: `fix(website): fix URLs, SEO titles, query patterns, SSR preloading`

---

### Task 17: Fix article content rendering + security

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`

- [ ] **Step 1:** In the TipTap renderer's link handling, sanitize `href` — reject `javascript:` and `data:` URLs:
```typescript
const safeHref = mark.attrs?.href;
if (safeHref && !/^(https?:|mailto:|tel:|\/)/i.test(safeHref)) {
  return <span key={i}>{text}</span>; // render as plain text
}
```

- [ ] **Step 2:** Add `target="_blank"` and `rel="noopener noreferrer"` to external links (those starting with `http`).

- [ ] **Step 3:** Fix duplicate React `key` props in `renderInlineContent` — use `${i}-${markIndex}` for nested marks.

- [ ] **Step 4:** Note: `@tailwindcss/typography` (`prose` class) may or may not be installed. Check if the website app has it. If not, either install it or remove the `prose` class and style content elements directly.

- [ ] **Step 5:** Commit: `fix(website): secure content renderer, fix keys, handle prose styling`

---

### Task 18: Fix website ticket routes

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/index.tsx`

- [ ] **Step 1:** In ticket detail, fix the reply box + reopen section overlap for "resolved" tickets. Only show reply box for open/awaitingResponse/inProgress.

- [ ] **Step 2:** In ticket creation form, add proper `id`/`htmlFor` linking for all form fields (subject, description, category). Add `aria-label` to the reply textarea.

- [ ] **Step 3:** In ticket list, fix "All" tab active state to use explicit `!search.status` check.

- [ ] **Step 4:** Add `aria-label` to star rating buttons: `aria-label={\`Rate ${star} out of 5\`}`.

- [ ] **Step 5:** Commit: `fix(website): fix ticket UX, accessibility, form labels`

---

## Phase 7: Widget Quality

### Task 19: Fix widget article URLs

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/components/support/widget/SupportWidget.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/AIAnswerView.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/SearchResultsView.tsx`

- [ ] **Step 1:** In `SupportWidget.tsx`, fix `onSelectArticle` to include `categorySlug`:
```typescript
onSelectArticle={(slug, categorySlug) => window.open(`/help/${categorySlug}/${slug}`, "_blank")}
```

- [ ] **Step 2:** In `AIAnswerView.tsx`, fix source article links to use full path with categorySlug.

- [ ] **Step 3:** In `SearchResultsView.tsx`, ensure article results include `categorySlug` and links use it.

- [ ] **Step 4:** Commit: `fix(widget): fix article URLs to include categorySlug`

---

### Task 20: Add auth gates + fix widget flows

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/HomeView.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/TicketListView.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/TicketFormView.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/TicketDetailView.tsx`

- [ ] **Step 1:** In `HomeView.tsx`, conditionally show "My Tickets" button only when user is authenticated. Use Clerk's `useUser()` or similar.

- [ ] **Step 2:** In `TicketListView.tsx`, check auth state. If not authenticated, show "Please sign in to view your tickets" with a sign-in link.

- [ ] **Step 3:** In `TicketFormView.tsx`, check auth state. If not authenticated, show "Please sign in to create a ticket" message. Wire `sessionId` prop to the create mutation call.

- [ ] **Step 4:** In `TicketDetailView.tsx`, handle null messages with a not-found state instead of crashing.

- [ ] **Step 5:** Commit: `fix(widget): add auth gates, fix null handling, wire sessionId`

---

### Task 21: Widget accessibility + cleanup

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/components/support/widget/WidgetPanel.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/views/TicketDetailView.tsx`
- Modify: `ConvexPress-Website/apps/web/src/components/support/hooks/useWidgetState.ts`

- [ ] **Step 1:** In `WidgetPanel.tsx`, add focus trap when panel is open. Add `aria-modal="true"`. Add Escape key handler to close.

- [ ] **Step 2:** Add `aria-label` to reply input and send button in `TicketDetailView.tsx`.

- [ ] **Step 3:** In `useWidgetState.ts`, remove dead `"search"` view state and unused `showResults` action.

- [ ] **Step 4:** Remove unused `onBack` prop from `TicketDetailView.tsx`.

- [ ] **Step 5:** Commit: `fix(widget): accessibility, focus trap, dead code cleanup`

---

## Phase 8: Integration

### Task 22: Register email templates

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/emails/templateDefaults.ts` (or wherever templates are defined)

- [ ] **Step 1:** Add 8 email template definitions with subjects, HTML bodies, and variables:
  - `ticket_reply_notification` — "New reply on your support ticket"
  - `ticket_user_reply` — "Customer replied to ticket {{ticketNumber}}"
  - `ticket_assigned` — "Ticket {{ticketNumber}} assigned to you"
  - `ticket_resolved` — "Your support ticket has been resolved"
  - `kb_workflow_step_ready` — "Article ready for your review"
  - `kb_workflow_approved` — "Your article has been approved"
  - `kb_workflow_rejected` — "Your article needs revisions"
  - `kb_comment_notification` — "New comment on your article"

- [ ] **Step 2:** Commit: `feat: register 8 email templates for KB and Ticket systems`

---

### Task 23: Add audit logging to all mutations

**Files:**
- Modify: ALL mutation files in `convex/kb/` and `convex/tickets/`

- [ ] **Step 1:** Determine the audit logging pattern. Check how existing systems log audits (look at `convex/posts/mutations.ts` or similar for the pattern — likely via `emitEvent` which the audit system listens to, or a direct `logAudit` call).

- [ ] **Step 2:** If audit logging is event-driven (audit system subscribes to events), then the existing `emitEvent` calls should be sufficient — but verify the audit event listener handles KB/Ticket event codes. If it doesn't, register them.

- [ ] **Step 3:** If audit logging requires explicit calls, add `logAudit()` to all KB mutations (create, update, publish, archive, delete article; create/update/delete category, tag, collection, template, workflow) and all Ticket mutations (create, reply, assign, statusChange, priorityChange, close, reopen).

- [ ] **Step 4:** Commit: `feat: add audit logging across KB and Ticket mutations`

---

### Task 24: Add CSS variables + fix remaining colors

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/index.css` (or equivalent theme file)
- Modify: Any remaining files with hardcoded colors

- [ ] **Step 1:** Add `--warning` and `--success` CSS custom properties to both `:root` and `.dark` themes:
```css
:root {
  --warning: 45 93% 47%; /* amber-500 equivalent */
  --success: 142 76% 36%; /* green-600 equivalent */
}
.dark {
  --warning: 45 93% 57%;
  --success: 142 76% 46%;
}
```

- [ ] **Step 2:** Register in Tailwind's `@theme inline` block:
```css
@theme inline {
  --color-warning: oklch(var(--warning));
  --color-success: oklch(var(--success));
}
```

- [ ] **Step 3:** Verify ALL files across both apps have no remaining hardcoded Tailwind colors. Grep for: `text-blue-`, `bg-blue-`, `text-green-`, `bg-green-`, `text-red-`, `bg-red-`, `text-amber-`, `bg-amber-`, `text-yellow-`, `bg-yellow-`, `text-purple-`, `bg-purple-`, `text-orange-`, `bg-orange-`, `text-white`, `bg-white`, `text-black`, `bg-black`, `divide-black`, `border-black`.

- [ ] **Step 4:** Commit: `fix: add warning/success CSS variables, verify no remaining hardcoded colors`

---

### Task 25: Fix route permissions + capability gating

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/bootstrap/` (or wherever role defaults are seeded)
- Modify: `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`

- [ ] **Step 1:** Find the role seed/bootstrap file. Add KB, Ticket, and Support routes to `pageAccess` arrays:
  - Administrator: `/admin/kb`, `/admin/kb/*`, `/admin/tickets`, `/admin/tickets/*`, `/admin/support`, `/admin/support/*`
  - Editor: `/admin/kb`, `/admin/kb/*`, `/admin/tickets`, `/admin/tickets/*`
  - Author: `/admin/kb` (view only)
  - Contributor: (none)
  - Subscriber: (none)

- [ ] **Step 2:** Verify nav-config uses proper capabilities (already fixed in Task 14).

- [ ] **Step 3:** Commit: `fix: add KB/Ticket/Support routes to role pageAccess defaults`

---

## Phase 9: Cleanup

### Task 26: Remove dead code + fix inconsistencies

**Files:** Various

- [ ] **Step 1:** In `kb/helpers/auth.ts`, either delete the file (if nothing uses `requireKbCan`) or refactor KB mutations to consistently use it. Choose one approach.

- [ ] **Step 2:** Remove duplicate `logSearch` from `kb/search.ts` (keep `trackSearch` in `analytics.ts`).

- [ ] **Step 3:** Consolidate widget defaults — import from one source in all three files that define them.

- [ ] **Step 4:** Fix all event emissions using string literals to use constants (e.g., `"settings.updated"` → `SETTINGS_EVENTS.UPDATED`).

- [ ] **Step 5:** Remove unused schema indexes: `by_ticket_time`, `by_sender`, `by_last_message` (from tickets), `by_ticket` (from support). Or document planned future use.

- [ ] **Step 6:** Remove dead `"search"` view and `showResults` from widget state machine.

- [ ] **Step 7:** Fix `canned_responses.ts` — remove increment from `applyTemplate` (only `incrementUsage` should count).

- [ ] **Step 8:** Update all stale comments (event counts in constants.ts, integration.ts docs).

- [ ] **Step 9:** Commit: `chore: remove dead code, consolidate defaults, fix inconsistencies`

---

### Task 27: Final integration fixes

**Files:** Various

- [ ] **Step 1:** In `support/deflection.ts::generateAnswer`, compute and return `responseLatencyMs: Date.now() - startTime`. Remove unused `sessionId` arg or use it for logging.

- [ ] **Step 2:** Update Anthropic model default from `claude-haiku-20240307` to current model.

- [ ] **Step 3:** In `support/internals.ts`, fix `searchKbRag` to clearly label as keyword fallback (rename or add prominent comment).

- [ ] **Step 4:** In `integration.ts` files, update all stale documentation (settings naming, function references, cron args, event counts).

- [ ] **Step 5:** In `ticket/mutations.ts::create`, restrict "urgent" priority to staff only. Default user tickets to configured default priority.

- [ ] **Step 6:** In `ticket/messages.ts::getCount`, only return `internalCount` to users with `ticket.viewInternalNotes`.

- [ ] **Step 7:** Commit: `fix: final integration improvements and documentation updates`

---

## Execution Strategy

**Tasks 1-3:** Sequential (critical path, each depends on the previous)
**Tasks 4-7:** Parallel batch (all performance, different files)
**Tasks 8-10:** Parallel batch (all security, different files)
**Tasks 11-12:** Parallel batch (data integrity, different systems)
**Tasks 13-15:** Parallel batch (admin frontend, grouped by concern)
**Tasks 16-18:** Parallel batch (website, grouped by page)
**Tasks 19-21:** Parallel batch (widget, grouped by concern)
**Tasks 22-25:** Parallel batch (integration, different systems)
**Tasks 26-27:** Sequential (cleanup, touches many files)

**Estimated: 27 tasks, ~54 agent dispatches (implement + review), ~8 parallel batches**
