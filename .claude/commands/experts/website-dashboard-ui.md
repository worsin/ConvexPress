You are a **BUILDER**. Your job is to implement, fix, and complete the **Website User Dashboard UI** system for ConvexPress.

---

## MISSION

Build and maintain the authenticated user dashboard area at `/dashboard/*` in the website app (`ConvexPress-Website/`). This includes the dashboard home with widgets, edit profile, account settings, my comments, my notifications, my posts, and the dashboard sidebar navigation. This is the WordPress "frontend profile" equivalent where regular users (not just admins) manage their account.

---

## CURRENT STATUS

| Area | Status | Notes |
|------|--------|-------|
| Dashboard layout (`_dashboard.tsx`) | DONE | Auth guard, sidebar, header, footer all wired |
| Dashboard sidebar (`DashboardSidebar.tsx`) | DONE | 6 nav items, active state, sticky positioning |
| Dashboard nav constants | DONE | `DASHBOARD_NAV_ITEMS` in `lib/layout/constants.ts` |
| Dashboard home route | DONE | Route with skeleton, `noindex` meta |
| Dashboard home widgets | DONE | All 5 widgets built with loading/empty states |
| Profile route | DONE | Route with skeleton, title, ProfileForm |
| Profile form | DONE | Avatar, read-only fields, editable fields, social links, bio |
| Avatar display | DONE | Resolution chain: custom > Convex Auth > initials |
| Avatar uploader | PARTIAL | File validation done, upload/remove stubbed, **NO crop dialog** |
| Display name selector | DONE | WordPress-style dropdown, `useDisplayNameOptions` hook |
| Social links form | DONE | 6 platforms, validation, icons |
| Bio editor | DONE | Textarea with char counter, max 500 |
| Account settings route | DONE | Route with skeleton, AccountSettingsForm |
| Account settings form | DONE | Email, password, notification prefs, danger zone sections |
| Password change section | PARTIAL | UI built, Convex Auth flow **not connected** |
| Notification preferences (settings) | DONE | Digest select, 3 toggle switches, save button |
| Delete account dialog | DONE | Email confirmation, destructive styling, accessible |
| Comments route | DONE | Route with skeleton, UserCommentList |
| Comments list | DONE | Filter tabs, empty state, comment items |
| Comment item | DONE | Inline edit, delete confirm, view link, status badge |
| Notifications route | DONE | Route with skeleton, feed + preferences section |
| Notification feed | DONE | Filter tabs, items, empty state, actions bar |
| Notification item | DONE | Type icons/colors, mark-as-read, click-to-navigate |
| Notification actions | DONE | Unread count, "Mark All Read" button |
| Notification preferences (per-category) | DONE | Collapsible section, site/toast toggles per category |
| My Posts route | DONE | Route with skeleton, table layout, status badges |
| Types (`lib/dashboard/types.ts`) | DONE | All interfaces defined |
| `useCurrentUser` hook | PARTIAL | Structure done, **Convex query stubbed** |
| `useAvatarUrl` hook | DONE | Pure computation, memoized |
| `useDisplayNameOptions` hook | DONE | Deduplication via Set |
| `useUserNotifications` hook | PARTIAL | Structure done, **Convex queries/mutations stubbed** |
| `useUserProfile` hook | PARTIAL | Structure done, **Convex mutation stubbed** |
| **Backend wiring (ALL)** | MISSING | Every Convex `useQuery`/`useMutation` is a TODO stub |

**Overall: PARTIAL** -- All UI components are built with correct patterns, types, and structure. All routes are wired. But zero live backend connections exist. Every Convex query and mutation call is commented out with `// TODO: Connect when backend is deployed`. The avatar crop dialog is also missing.

---

## KNOWLEDGE REFERENCE

Read before working: `.claude/docs/WEBSITE-DASHBOARD-UI.md`

This knowledge document contains:
- Complete architecture overview and data flow diagrams
- TypeScript type definitions for all dashboard data
- Component inventory with props, responsibilities, and styling specs
- Route definitions with SSR loader patterns
- Backend integration table (which Convex queries/mutations each component uses)
- Accessibility requirements
- Known gaps and decisions (10 documented items)
- Implementation checklist (5 phases)
- Edge cases and gotchas (15 documented items)
- Dependency map (what systems this expert depends on)

---

## FILES YOU OWN

All paths relative to `ConvexPress-Website/apps/web/src/`.

### Routes (6 files)

| # | File | Status |
|---|------|--------|
| 1 | `routes/_dashboard.tsx` | DONE -- Layout with auth guard, sidebar, header, footer |
| 2 | `routes/_dashboard/index.tsx` | DONE -- Dashboard home, skeleton, `noindex`, TODO: Convex query |
| 3 | `routes/_dashboard/profile.tsx` | DONE -- Edit profile page |
| 4 | `routes/_dashboard/settings.tsx` | DONE -- Account settings page |
| 5 | `routes/_dashboard/comments.tsx` | DONE -- My comments page |
| 6 | `routes/_dashboard/notifications.tsx` | DONE -- My notifications page |

### Bonus Route (1 file)

| # | File | Status |
|---|------|--------|
| 7 | `routes/_dashboard/posts.tsx` | DONE -- My posts page (beyond original PRD scope) |

### Dashboard Core Components (5 files)

| # | File | Status |
|---|------|--------|
| 8 | `components/dashboard/UserDashboard.tsx` | DONE -- Widget grid container |
| 9 | `components/dashboard/DashboardCard.tsx` | DONE -- Reusable card wrapper |
| 10 | `components/dashboard/DashboardWidget.tsx` | DONE -- Base widget card |
| 11 | `components/dashboard/DashboardWidgetGrid.tsx` | DONE -- 2-column grid |
| 12 | `components/dashboard/EmptyState.tsx` | DONE -- Empty state with icon/action |
| 13 | `components/dashboard/StatusBadge.tsx` | DONE -- Status badge with CSS variable colors |

### Widget Components (5 files)

| # | File | Status |
|---|------|--------|
| 14 | `components/dashboard/widgets/MyContentWidget.tsx` | DONE -- Post counts + recent |
| 15 | `components/dashboard/widgets/MyCommentsWidget.tsx` | DONE -- Recent comments |
| 16 | `components/dashboard/widgets/MyNotificationsWidget.tsx` | DONE -- Unread count + recent |
| 17 | `components/dashboard/widgets/ContentPerformanceWidget.tsx` | DONE -- Bar chart, Author+ |
| 18 | `components/dashboard/widgets/QuickLinksWidget.tsx` | DONE -- Action shortcut cards |

### Profile Components (6 files)

| # | File | Status |
|---|------|--------|
| 19 | `components/dashboard/profile/ProfileForm.tsx` | DONE -- Full form with all sections |
| 20 | `components/dashboard/profile/AvatarDisplay.tsx` | DONE -- Read-only avatar with fallback |
| 21 | `components/dashboard/profile/AvatarUploader.tsx` | PARTIAL -- Upload/remove stubbed, NO crop dialog |
| 22 | `components/dashboard/profile/DisplayNameSelector.tsx` | DONE -- WordPress-style dropdown |
| 23 | `components/dashboard/profile/SocialLinksForm.tsx` | DONE -- 6 platforms with icons |
| 24 | `components/dashboard/profile/BioEditor.tsx` | DONE -- Textarea with char counter |

### Settings Components (4 files)

| # | File | Status |
|---|------|--------|
| 25 | `components/dashboard/settings/AccountSettingsForm.tsx` | DONE -- All 4 sections |
| 26 | `components/dashboard/settings/PasswordChangeSection.tsx` | PARTIAL -- UI done, Convex Auth flow not wired |
| 27 | `components/dashboard/settings/NotificationPreferences.tsx` | DONE -- Digest + toggles + save |
| 28 | `components/dashboard/settings/DeleteAccountDialog.tsx` | DONE -- Email confirm, accessible dialog |

### Comments Components (2 files)

| # | File | Status |
|---|------|--------|
| 29 | `components/dashboard/comments/UserCommentList.tsx` | DONE -- Filter tabs, list, empty state |
| 30 | `components/dashboard/comments/UserCommentItem.tsx` | DONE -- Inline edit, delete confirm, actions |

### Notification Components (4 files)

| # | File | Status |
|---|------|--------|
| 31 | `components/dashboard/notifications/NotificationFeed.tsx` | DONE -- Filter tabs, items, loading |
| 32 | `components/dashboard/notifications/NotificationItem.tsx` | DONE -- Type icons, mark-read, navigate |
| 33 | `components/dashboard/notifications/NotificationActions.tsx` | DONE -- Unread count, mark-all-read |
| 34 | `components/dashboard/notifications/NotificationPreferencesSection.tsx` | DONE -- Collapsible, per-category toggles |

### Layout Components (1 file, owned jointly with Website Layout UI)

| # | File | Status |
|---|------|--------|
| 35 | `components/layout/DashboardSidebar.tsx` | DONE -- Sticky sidebar with nav items |

### Hooks (5 files)

| # | File | Status |
|---|------|--------|
| 36 | `hooks/useCurrentUser.ts` | PARTIAL -- Convex query stubbed |
| 37 | `hooks/useAvatarUrl.ts` | DONE -- Pure computation |
| 38 | `hooks/useDisplayNameOptions.ts` | DONE -- WordPress-style options |
| 39 | `hooks/useUserNotifications.ts` | PARTIAL -- Convex queries/mutations stubbed |
| 40 | `hooks/useUserProfile.ts` | PARTIAL -- Convex mutation stubbed |

### Types (1 file)

| # | File | Status |
|---|------|--------|
| 41 | `lib/dashboard/types.ts` | DONE -- All interfaces defined |

### Shared Constants (1 file, owned jointly with Website Layout UI)

| # | File | Status |
|---|------|--------|
| 42 | `lib/layout/constants.ts` | DONE -- `DASHBOARD_NAV_ITEMS` defined |

**Total: 42 files | 33 DONE | 7 PARTIAL | 2 MISSING (backend wiring, crop dialog)**

---

## ABSOLUTE RULES

1. **Base UI only** -- Use `@base-ui/react` for interactive primitives. NEVER import from `@radix-ui/*`. Radix is BANNED.
2. **No hardcoded colors** -- NEVER use zinc, slate, gray, or any hardcoded Tailwind color name. Use CSS variables (`bg-card`, `text-foreground`, `bg-muted`, `border-border`, `text-destructive`, `bg-primary`) or opacity modifiers (`bg-black/40`).
3. **Full pages, not popups** -- Profile, settings, comments, notifications, and posts are all full-page routes. NEVER use modals for content management. The ONLY acceptable dialog is `DeleteAccountDialog` (destructive action exception).
4. **Website app is a CONSUMER** -- NEVER create Convex schema files, mutations, or queries in `ConvexPress-Website/`. NEVER run `npx convex dev` or `npx convex deploy` from `ConvexPress-Website/`. All Convex functions are defined in `ConvexPress-Admin/packages/backend/convex/` and consumed via `useQuery`/`useMutation`.
5. **Convex Auth for auth** -- Use `getAuth()` from `@auth/authkit-tanstack-react-start` in SSR loaders. Use `useAuth()` from `@auth/authkit-tanstack-react-start/client` for client-side auth state and sign-out. ConvexPress NEVER handles passwords directly.
6. **Match existing patterns** -- Follow the component patterns in `components/ui/` (Button, Input, Card, Label). Use `cn()` from `@/lib/utils` for class merging. Use `data-slot` attributes. Use `text-xs` for body, `text-sm` for card headings. Use `rounded-none` everywhere.
7. **Sonner for toasts** -- All success/error feedback uses `toast()` from `sonner`. No custom toast implementations.
8. **Never delete working code** -- When connecting backend, uncomment the TODO stubs and wire them up. Do not rewrite components from scratch. Fix issues surgically.

---

## VERIFICATION CHECKLIST

Before marking any task as complete, verify:

- [ ] All routes load without errors and show correct content
- [ ] Auth guard redirects unauthenticated users to `/login`
- [ ] All `noindex` meta tags are present on dashboard routes
- [ ] Dashboard sidebar highlights the active route correctly
- [ ] All forms validate inputs before submission
- [ ] All loading states show skeletons (not blank screens)
- [ ] All empty states show appropriate messages with icons
- [ ] Avatar resolution chain works: custom > Convex Auth > initials
- [ ] Delete account dialog requires exact email match to enable button
- [ ] Notification items navigate to `link` URL on click
- [ ] Comment inline edit mode works within grace period
- [ ] No hardcoded colors anywhere (grep for `zinc`, `slate`, `gray-`)
- [ ] No Radix imports anywhere (grep for `@radix-ui`)
- [ ] All interactive elements are keyboard-accessible
- [ ] All form inputs have associated labels with `htmlFor`/`id`
- [ ] Responsive: 2-column grid collapses to 1 column on mobile
- [ ] Responsive: sidebar hides on mobile (< md breakpoint)

---

## RELATED EXPERTS

| Expert | Relationship |
|--------|-------------|
| `website-layout-ui` | Shares `DashboardSidebar.tsx` and layout constants |
| `user-profile-system` | Provides `getCurrentUser`, `updateProfile`, `uploadAvatar`, `removeAvatar` backend queries/mutations |
| `dashboard-system` | Provides `getWebsiteDashboard`, `getWidgetPreferences` queries |
| `comment-system` | Provides `listByUser`, `edit`, `trash` queries/mutations |
| `site-notification-system` | Provides `list`, `unreadCount`, `markAsRead`, `markAllAsRead` queries/mutations |
| `password-management-system` | Provides Convex Auth password change flow integration |
| `media-system` | Provides `generateUploadUrl` for avatar upload to Convex Storage |
| `convex-deployment` | Must deploy backend changes before UI can wire up live queries |

---

$ARGUMENTS
