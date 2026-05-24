You are a **BUILDER**. Your job is to implement the Comment System for ConvexPress -- not advise, not plan, not discuss. **Build it.**

---

## MISSION

Implement the complete Comment System: threaded comments with moderation pipeline, like/flag engagement, admin list table with status tabs and bulk actions, full-page edit form, website threaded display with real-time updates, and My Comments dashboard page.

---

## CURRENT STATUS

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `convex/schema/comments.ts` | DONE | 4 tables, 17 indexes, all validators. Imported into hub schema.ts. |
| 2 | `convex/comments/validators.ts` | DONE | All arg shapes, constants, discussion defaults. |
| 3 | `convex/comments/mutations.ts` | DONE | 15 mutations: create, update, approve, reject, spam, trash, restore, permanentDelete, reply, flag, like, bulkApprove, bulkSpam, bulkTrash, bulkDelete. |
| 4 | `convex/comments/queries.ts` | DONE | 6 queries: list, forPost, get, counts, pendingCount, recent. |
| 5 | `convex/comments/internals.ts` | DONE | purgeOldTrash, updatePostCommentCount, updateUserCommentCount. |
| 6 | `convex/helpers/comment.ts` | DONE | sanitizeCommentContent, getDiscussionSettings, resolveCommentDepth, canEditComment, resolveCommentAuthor, runModerationPipeline, checkFloodProtection, buildCommentTree. |
| 7 | `admin routes/comments/index.tsx` | DONE | Route file with search schema, renders CommentListTable. |
| 8 | `admin components/CommentListTable.tsx` | PARTIAL | Full UI structure with columns, status tabs, bulk actions, row actions, pagination, search -- but uses **mock data** and toast-only handlers. Not wired to Convex queries/mutations. |
| 9 | `admin routes/comments/pending.tsx` | MISSING | Convenience route pre-filtered to Pending tab. |
| 10 | `admin routes/comments/$commentId/edit.tsx` | MISSING | Full-page edit comment form. |
| 11 | `admin components/CommentStatusTabs.tsx` | MISSING | Uses shared StatusTabs -- may not need dedicated component if shared works. |
| 12 | `admin components/CommentBulkActions.tsx` | MISSING | Uses shared BulkActions -- may not need dedicated component if shared works. |
| 13 | `admin components/CommentInlineReply.tsx` | MISSING | Inline reply form below comment row. |
| 14 | `admin components/CommentQuickEdit.tsx` | MISSING | Inline quick-edit textarea + status dropdown. |
| 15 | `admin components/CommentSearchBox.tsx` | MISSING | Uses shared SearchBox -- may not need dedicated component. |
| 16 | `admin components/CommentEditForm.tsx` | MISSING | Full edit form for the edit page. |
| 17 | `admin components/CommentAuthorInfo.tsx` | MISSING | Read-only author display on edit page. |
| 18 | `admin components/CommentFlagsList.tsx` | MISSING | Flags list with dismiss on edit page. |
| 19 | `admin components/dashboard/RecentCommentsWidget.tsx` | MISSING | Dashboard widget showing recent 5 comments. |
| 20 | `website components/CommentSection.tsx` | PARTIAL | Full UI shell with loading skeleton, empty state, pagination, threading -- but **not wired to Convex**. Uses undefined comments placeholder. |
| 21 | `website components/CommentThread.tsx` | PARTIAL | Recursive threaded display. UI complete, relies on CommentData type from blog types. Not connected to real data. |
| 22 | `website components/CommentItem.tsx` | PARTIAL | Avatar, meta, content, like/flag/reply buttons. Like uses local state, not Convex. Flag is a no-op. |
| 23 | `website components/CommentForm.tsx` | PARTIAL | Form with name/email for guests, textarea, submit button. Uses setTimeout simulation, not Convex mutation. Also includes guest fields (name/email) which contradicts ConvexPress's "all auth required" model. |
| 24 | `website components/CommentPagination.tsx` | DONE | Newer/Older buttons with page display. Purely presentational. |
| 25 | `website components/CommentLikeButton.tsx` | MISSING | Dedicated like toggle with optimistic update. |
| 26 | `website components/CommentFlagDialog.tsx` | MISSING | Flag reason selection dialog (confirmation dialog is the only acceptable popup). |
| 27 | `website components/CommentReplyForm.tsx` | MISSING | Dedicated inline reply form (currently handled inside CommentSection). |
| 28 | `website routes/dashboard/comments.tsx` | MISSING | My Comments page in user dashboard. |

**Summary:** Backend is DONE. Admin frontend has the list page shell but needs Convex wiring + edit page + inline reply/quick-edit. Website frontend has UI shells but needs Convex wiring + missing components.

---

## PRD REFERENCE

No dedicated PRD file exists at `specs/ConvexPress/systems/comment-system/PRD.md`. The knowledge document serves as the comprehensive specification.

## KNOWLEDGE REFERENCE

Read and internalize fully before building: `.claude/docs/COMMENT-SYSTEM.md`

This 1300-line document contains:
- Complete schema with all 4 tables and 17 indexes
- All 13+ mutations with detailed behavior specifications
- All 6 queries with visibility rules and pagination
- 7 event definitions with payloads and subscriber lists
- Admin UI layout (columns, row actions, bulk actions, status tabs)
- Website UI layout (threaded display, inline reply, like/flag)
- Moderation pipeline (7-step, strict priority order)
- Discussion Settings reference (16 settings with defaults)
- Role/capability matrix
- 15 edge cases and gotchas
- Implementation patterns (tree builder, optimistic like)

---

## FILES YOU OWN

All paths relative to `F:\Websites\Hybrid5Studio\websites\ConvexPress\`.

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 1 | `schema/comments.ts` | DONE | 4 tables: comments, commentMeta, commentLikes, commentFlags. Already in hub schema.ts. |
| 2 | `comments/validators.ts` | DONE | All arg validators, constants, discussion defaults. |
| 3 | `comments/mutations.ts` | DONE | 15 mutations covering full lifecycle. All have auth, capability checks, event emission, denormalized count management. |
| 4 | `comments/queries.ts` | DONE | 6 queries: list (admin paginated), forPost (website threaded), get (single), counts (status tabs), pendingCount (sidebar badge), recent (dashboard widget). |
| 5 | `comments/internals.ts` | DONE | purgeOldTrash (scheduled), updatePostCommentCount, updateUserCommentCount. |
| 6 | `helpers/comment.ts` | DONE | sanitizeCommentContent, getDiscussionSettings, resolveCommentDepth, canEditComment, resolveCommentAuthor, runModerationPipeline, checkFloodProtection, buildCommentTree. |

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 7 | `routes/_authenticated/_admin/comments/index.tsx` | DONE | Route with search params validation, renders CommentListTable. |
| 8 | `components/comments/CommentListTable.tsx` | PARTIAL | **Wire to Convex**: replace mock data with `useQuery(api.comments.list)` and `useQuery(api.comments.counts)`. Replace toast handlers with `useMutation` calls for approve/reject/spam/trash/restore/permanentDelete/bulk ops. Add inline reply form. Add quick-edit form. |
| 9 | `routes/_authenticated/_admin/comments/pending.tsx` | MISSING | Route pre-filtered to `status=pending`. Same as index but with default search param. |
| 10 | `routes/_authenticated/_admin/comments/$commentId/edit.tsx` | MISSING | Full-page comment edit form. Loads comment via `useQuery(api.comments.get)`. Shows author info (read-only), "In Response To" with post title link, content textarea with character count, status dropdown, moderation info, flags list. Update button calls `useMutation(api.comments.update)`. Trash button calls trash mutation. Back link to comments list. |
| 11 | `components/comments/CommentInlineReply.tsx` | MISSING | Textarea + Reply/Cancel buttons. Appears below a comment row when Reply is clicked. Calls `useMutation(api.comments.reply)`. Auto-approved for moderators. |
| 12 | `components/comments/CommentQuickEdit.tsx` | MISSING | Inline textarea + status dropdown below comment row. Calls `useMutation(api.comments.update)` for content and `approve`/`reject`/`spam` for status. |
| 13 | `components/comments/CommentEditForm.tsx` | MISSING | Full form for the edit page: content textarea (max 5000 chars), status dropdown (Approved/Pending/Spam), moderation info display, character count. |
| 14 | `components/comments/CommentAuthorInfo.tsx` | MISSING | Read-only: avatar (64px), name, email, role badge, submission date. Used on edit page. |
| 15 | `components/comments/CommentFlagsList.tsx` | MISSING | List of flags on a comment. Each shows user, reason, details, date. Dismiss button (future, when moderation action resolves flags). |
| 16 | `components/dashboard/RecentCommentsWidget.tsx` | MISSING | Dashboard widget: recent 5 comments. Each shows avatar, author name, excerpt (50 chars), post title link, time ago, quick actions (Approve/Spam/Trash). Uses `useQuery(api.comments.recent)`. |

### Website Frontend (`ConvexPress-Website/apps/web/src/`)

| # | File | Status | What It Must Do |
|---|------|--------|-----------------|
| 17 | `components/comments/CommentSection.tsx` | PARTIAL | **Wire to Convex**: replace undefined comments with `useQuery(api.comments.forPost, { postId })`. Remove guest fields logic (all users must be authenticated in ConvexPress). Show "Log in to comment" for unauthenticated. Show "Comments are closed" when commentStatus is closed. |
| 18 | `components/comments/CommentThread.tsx` | PARTIAL | UI is complete. Needs to receive real CommentTreeNode data from Convex query. May need type alignment between CommentData and CommentTreeNode. |
| 19 | `components/comments/CommentItem.tsx` | PARTIAL | **Wire to Convex**: replace local state like with `useMutation(api.comments.like)` with optimistic update. Wire flag button to CommentFlagDialog. Add "edited" indicator. Add "awaiting moderation" notice for own pending comments. Add role badge for Editor+ authors. |
| 20 | `components/comments/CommentForm.tsx` | PARTIAL | **Wire to Convex**: replace setTimeout with `useMutation(api.comments.create)`. Remove guest name/email fields (ConvexPress requires auth). Show user avatar. Handle parentId for replies. Show "awaiting moderation" status after submit if pending. |
| 21 | `components/comments/CommentPagination.tsx` | DONE | Presentational. No changes needed. |
| 22 | `components/comments/CommentLikeButton.tsx` | MISSING | Extracted like button with optimistic update via Convex. Heart icon + count. Toggle behavior. |
| 23 | `components/comments/CommentFlagDialog.tsx` | MISSING | Confirmation dialog (the ONE acceptable popup type). Reason select (spam, harassment, off-topic, misinformation, other). Details textarea when "other" selected. Calls `useMutation(api.comments.flag)`. |
| 24 | `components/comments/CommentReplyForm.tsx` | MISSING | Inline reply form. Simplified: just textarea + Reply/Cancel. Calls `useMutation(api.comments.reply)`. |
| 25 | `routes/dashboard/comments.tsx` | MISSING | My Comments page. Table with: comment excerpt + "on [Post Title]" link, status badge, date, actions (View, Edit if grace period, Delete). Uses `useQuery(api.comments.list, { authorId: currentUser })`. Filters: status (All/Approved/Pending), sort (Newest/Oldest). Empty state message. |

---

## ABSOLUTE RULES

1. **NEVER use Radix.** No `@radix-ui/*` imports. Use `@base-ui/react` for all interactive components.
2. **NEVER use hardcoded colors.** No zinc, slate, gray. Use CSS variables (`bg-card`, `bg-muted`, `text-foreground`, etc.) and opacity modifiers (`bg-black/40`).
3. **NEVER use modals/dialogs for content management.** Edit comment = full page at `/comments/$commentId/edit`. The ONLY acceptable popup is a confirmation dialog for destructive actions (permanent delete, empty trash).
4. **NEVER run `npx convex dev` or `npx convex deploy`.** You write code only. The Convex Deployment Expert deploys.
5. **NEVER skip building the UI.** Every route must render a complete, functional page. No placeholder "Coming soon" or empty components.
6. **NEVER leave TODOs in finished files.** If a file is marked DONE, it must be fully implemented. Replace all TODO comments with working code.
7. **ALWAYS create proper TanStack Router routes.** Every admin page uses `createFileRoute` with the `/_authenticated/_admin/` path prefix. Every website page uses proper TanStack Start routing.
8. **ALWAYS verify your work compiles.** After writing code, check imports resolve, types match, and there are no obvious errors.

---

## VERIFICATION CHECKLIST

After building, verify each of these:

- [ ] `CommentListTable` fetches real data from `useQuery(api.comments.list)` and `useQuery(api.comments.counts)` -- no mock data
- [ ] All row actions (approve, unapprove, reply, quick-edit, edit, spam, trash, restore, delete permanently) call real Convex mutations
- [ ] Bulk actions call real Convex bulk mutations with selection state
- [ ] Status tabs show real counts from `comments.counts` query
- [ ] Pending count badge updates via `comments.pendingCount` subscription
- [ ] Edit comment page loads comment via `comments.get`, shows author info, content editor, status dropdown, update/trash buttons
- [ ] Inline reply form calls `comments.reply` mutation
- [ ] Website CommentSection uses `useQuery(api.comments.forPost)` for real-time threaded display
- [ ] Website CommentForm calls `comments.create` mutation (no guest fields -- auth required)
- [ ] Website CommentItem like button uses `useMutation(api.comments.like)` with optimistic update
- [ ] Website CommentItem flag button opens CommentFlagDialog which calls `comments.flag`
- [ ] "Awaiting moderation" notice shows for own pending comments
- [ ] "Comments are closed" shows when `commentStatus === "closed"`
- [ ] "Log in to comment" shows for unauthenticated users
- [ ] My Comments dashboard page shows current user's comments with filters
- [ ] RecentCommentsWidget shows latest 5 comments with quick moderation actions
- [ ] No hardcoded colors anywhere
- [ ] No Radix imports anywhere
- [ ] No modals for content management (edit = full page)
- [ ] All files import from correct paths (backend API, shared components, hooks)

---

## RELATED EXPERTS

| Expert | When to Consult |
|--------|----------------|
| `admin-list-table-ui` | For list table patterns, shared components (ListTable, StatusTabs, BulkActions, Pagination) |
| `admin-editor-ui` | For the edit comment page layout pattern (metabox-style sections) |
| `admin-shell-ui` | For sidebar menu integration (Comments item with pending count badge) |
| `post-system` | For `posts.commentCount` denormalization and `commentStatus` field |
| `event-dispatcher-system` | For `emitEvent` calls and event constants |
| `settings-system` | For Discussion Settings integration |
| `website-blog-ui` | For comment section integration on single post pages |
| `website-dashboard-ui` | For My Comments page layout within user dashboard |
| `role-capability-system` | For capability checks (create_comments, moderate_comments, etc.) |

---

$ARGUMENTS
