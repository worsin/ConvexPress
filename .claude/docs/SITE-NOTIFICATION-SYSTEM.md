# Site Notification System - Expert Knowledge Document

**System:** Site Notification System
**Status:** Complete (100%)
**Priority:** P1 - High
**WordPress Equivalent:** No direct equivalent. Inspired by BuddyPress Notifications + WooCommerce Admin Inbox + modern SaaS notification patterns (bell icon, dropdown, notification center, per-type preferences).
**Last Analyzed:** 2026-02-13
**PRD:** `specs/ConvexPress/systems/site-notification-system/PRD.md`
**Airtable System Record:** `recblHHHRmSWHVImA`

---

## Quick Reference

### What This System Does

The Site Notification System delivers real-time, in-app notifications to ConvexPress users via Convex reactive subscriptions. It is the on-site counterpart to the Email Notification System. Every significant CMS event (post published, comment replied, role changed, failed login, etc.) can generate a site notification that appears instantly in the user's notification bell, as a Sonner toast, or both. WordPress has no true equivalent -- its `admin_notices` hook provides only transient, non-persistent, globally-scoped flash messages. ConvexPress replaces this with a full persistent, per-user, real-time notification center.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Notification Type** | One of 4 visual types: `info` (blue), `success` (green), `warning` (amber), `error` (red) |
| **Notification Key** | Snake_case identifier for a notification kind (e.g., `post_published`, `comment_reply`). 30 defined keys. |
| **Recipient Type** | Who receives the notification: `admin` (all admins), `employee` (specific user like post author), `customer` (affected user like comment author) |
| **Group Key** | Optional key for merging rapid-fire notifications of the same type (e.g., `comment.created:{postId}`) |
| **Persistent** | Non-persistent notifications auto-expire after 30 days. Persistent ones require explicit dismissal. |
| **Toast** | Sonner toast popup shown instantly when a notification arrives (controlled by user preference) |
| **Bell** | Header bell icon with unread count badge and dropdown list |
| **Notification Center** | Full-page `/dashboard/notifications` with filtering, pagination, preferences |
| **Notification Preferences** | Per-user, per-notification-key toggles for site delivery and toast delivery |

### ConvexPress vs WordPress

| Aspect | WordPress Admin Notices | ConvexPress Site Notifications |
|--------|------------------------|-------------------------------|
| **Persistence** | Session-scoped (lost on refresh) | Database-persisted until read/dismissed/expired |
| **Targeting** | Global (all admins see same) | Per-user (each user has own feed) |
| **Real-time** | No (server-rendered on page load) | Yes (Convex subscriptions, < 100ms) |
| **Types** | 4 CSS classes | 4 types with semantic behavior + configurable toast/persistence |
| **History** | None (fire-and-forget) | Full history with read/unread tracking |
| **Preferences** | None | Per-user, per-type toggles for site + toast |
| **Toast** | None | Sonner integration with auto-dismiss |
| **Bell icon** | None | Unread count badge in header |
| **Notification center** | None | Dedicated page with filtering, search, bulk actions |
| **API** | `add_action('admin_notices', callback)` | Event Dispatcher listener registration |
| **Grouping** | None | By event code + time window (prevents spam) |

---

## Architecture Overview

### Data Flow

```
1. Source system performs action (e.g., publish post)
2. Source system emits event via Event Dispatcher (e.g., "post.published")
3. Event Dispatcher invokes registered site notification listener
4. Listener handler (e.g., onPostPublished) resolves recipient and builds notification
5. Handler calls internal.siteNotifications.send mutation
6. send mutation checks user preferences -> if siteEnabled, inserts into siteNotifications table
7. Convex detects table change -> re-evaluates active subscriptions for that userId
8. All connected clients with useQuery(unreadCount) and useQuery(list) receive updated data
9. React re-renders bell badge, dropdown, notification center
10. If toastEnabled, client-side hook triggers Sonner toast
```

### Integration Architecture

```
Event Dispatcher (events.emit)
  -> Event Listener: "Site Notification - [Event Name]"
    -> notifications/siteHandlers.[handler]
      -> Check user notification preferences
      -> Insert into `siteNotifications` table
      -> Convex subscription triggers real-time update on all connected clients
      -> Client shows Sonner toast (if notification type is configured for toast)
      -> Bell icon badge count increments
```

### Real-Time Behavior

Convex reactive subscriptions are the core value proposition. Key subscriptions:

1. **`unreadCount` query** -- Subscribed on every authenticated page (powers bell badge). Updates instantly when notifications are created, read, or dismissed.
2. **`list` query** -- Subscribed in the bell dropdown and notification center page. New notifications appear at top instantly.
3. **Tab synchronization** -- Marking a notification as read in one tab updates all other tabs instantly via Convex subscription propagation. No custom sync logic needed.
4. **Offline reconnection** -- When an offline user reconnects, Convex re-evaluates subscriptions and delivers all accumulated notifications. No special handling needed.

### Authentication & Authorization

- **auth identity** is required for all notification operations.
- All user-facing mutations verify `notification.userId === authenticatedUser.externalAuthId` (ownership check).
- `notification.send` is an internal mutation called by event handlers -- never exposed to users directly.
- Administrators can additionally access `/admin/settings/notifications` for system-wide configuration.
- There is no capability for reading or managing another user's notifications (even admins cannot see other users' notifications through the notification UI).

---

## Database Schema

### `siteNotifications` Table

Stores every site notification delivered to a user. Each row is one notification for one recipient.

```typescript
// convex/schema.ts (additions)

const notificationType = v.union(
  v.literal("info"),       // Blue - Informational
  v.literal("success"),    // Green - Positive outcome
  v.literal("warning"),    // Amber - Caution
  v.literal("error"),      // Red - Failure/threat
);

siteNotifications: defineTable({
  // --- Identity ---
  userId: v.string(),                             // user identifier - the recipient
  notificationKey: v.string(),                    // Notification type key (e.g., "post_published")
  eventCode: v.string(),                          // Source event code (e.g., "post.published")
  eventId: v.optional(v.id("events")),            // Reference to the triggering event

  // --- Content ---
  type: notificationType,                         // Visual type: info, success, warning, error
  title: v.string(),                              // Short title (max 200 chars, no HTML)
  message: v.string(),                            // Full message (max 1000 chars, templates resolved at creation)
  icon: v.optional(v.string()),                   // Lucide icon name (e.g., "FileText", "Shield")

  // --- Navigation ---
  actionUrl: v.optional(v.string()),              // URL to navigate to when clicked (max 500 chars)
  actionLabel: v.optional(v.string()),            // Button/link label (max 50 chars, default "View")

  // --- State ---
  readAt: v.optional(v.number()),                 // Timestamp when marked as read (undefined = unread)
  dismissedAt: v.optional(v.number()),            // Timestamp when dismissed (hidden from feed)

  // --- Grouping ---
  groupKey: v.optional(v.string()),               // Grouping key (e.g., "comment.created:post_123"), max 200 chars
  groupCount: v.optional(v.number()),             // Count of grouped notifications (e.g., "3 new comments")

  // --- Metadata ---
  actorId: v.optional(v.string()),                // user identifier of the person who triggered this
  actorName: v.optional(v.string()),              // Display name of the actor (denormalized, max 100 chars)
  actorAvatarUrl: v.optional(v.string()),         // Avatar URL of the actor (denormalized, max 500 chars)
  metadata: v.optional(v.string()),               // JSON-serialized additional data (max 10KB)

  // --- Lifecycle ---
  persistent: v.boolean(),                        // If true, does not auto-expire
  expiresAt: v.optional(v.number()),              // Auto-delete timestamp (30 days for non-persistent)

  // --- Timestamps ---
  createdAt: v.number(),                          // When the notification was created (immutable)
})
  .index("by_user", ["userId", "createdAt"])                           // User's notification feed (chronological)
  .index("by_user_unread", ["userId", "readAt"])                       // Unread notifications for badge count
  .index("by_user_type", ["userId", "type", "createdAt"])              // Filter by notification type
  .index("by_user_key", ["userId", "notificationKey", "createdAt"])    // Filter by notification key
  .index("by_group", ["userId", "groupKey", "createdAt"])              // Notification grouping
  .index("by_expires", ["expiresAt"]),                                 // Retention cleanup
```

### `notificationPreferences` Table

Per-user, per-notification-key toggle controlling site and toast delivery channels.

```typescript
notificationPreferences: defineTable({
  // --- Identity ---
  userId: v.string(),                             // user identifier
  notificationKey: v.string(),                    // Notification type key (e.g., "post_published")

  // --- Channels ---
  siteEnabled: v.boolean(),                       // Show in notification bell/center
  toastEnabled: v.boolean(),                      // Show as Sonner toast

  // --- Timestamps ---
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])                                        // All preferences for a user
  .index("by_user_key", ["userId", "notificationKey"]),                // Specific preference lookup
```

### Indexes

| Index | Table | Fields | Purpose |
|-------|-------|--------|---------|
| `by_user` | siteNotifications | `[userId, createdAt]` | User's chronological notification feed |
| `by_user_unread` | siteNotifications | `[userId, readAt]` | Fast unread count for bell badge (most critical query) |
| `by_user_type` | siteNotifications | `[userId, type, createdAt]` | Filter by notification type (info/success/warning/error) |
| `by_user_key` | siteNotifications | `[userId, notificationKey, createdAt]` | Filter by notification kind |
| `by_group` | siteNotifications | `[userId, groupKey, createdAt]` | Find existing notification to merge with during grouping |
| `by_expires` | siteNotifications | `[expiresAt]` | Daily cron cleanup of expired notifications |
| `by_user` | notificationPreferences | `[userId]` | Load all preferences for a user |
| `by_user_key` | notificationPreferences | `[userId, notificationKey]` | Lookup specific preference |

### Relationships

| This Table | Field | References | Notes |
|------------|-------|------------|-------|
| `siteNotifications.userId` | `v.string()` | user identifier | Not a Convex foreign key -- resolved via Convex Auth |
| `siteNotifications.eventId` | `v.optional(v.id("events"))` | `events` table | Link to Event Dispatcher event record |
| `siteNotifications.actorId` | `v.string()` | user identifier | The user who caused the event |
| `notificationPreferences.userId` | `v.string()` | user identifier | Preference owner |

---

## Actions & Functions

### Mutations

#### `notification.send` - Send Notification

- **Airtable Record:** `recZlHxLjYq5flqqu`
- **Convex Function:** `mutations/siteNotifications.send`
- **Type:** Mutation (internal -- called by event listeners, never by users)
- **Auth:** System-level (no user auth check -- called internally)
- **Capabilities:** Administrator (system-level, called by Event Dispatcher)
- **Args:**
  ```typescript
  {
    userId: v.string(),
    notificationKey: v.string(),
    eventCode: v.string(),
    eventId: v.optional(v.id("events")),
    type: notificationType, // "info" | "success" | "warning" | "error"
    title: v.string(),
    message: v.string(),
    icon: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    actionLabel: v.optional(v.string()),
    actorId: v.optional(v.string()),
    actorName: v.optional(v.string()),
    actorAvatarUrl: v.optional(v.string()),
    metadata: v.optional(v.string()),
    persistent: v.optional(v.boolean()),
    groupKey: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"siteNotifications">` (the created or updated notification ID)
- **Behavior:**
  1. Validate `notificationKey` is a known key in `NOTIFICATION_TYPES`.
  2. Validate `userId` is a valid user identifier.
  3. Validate `title` <= 200 chars, `message` <= 1000 chars.
  4. If `metadata` is provided, validate it is valid JSON and <= 10KB.
  5. Check user's notification preferences (`notificationPreferences` by `by_user_key` index).
  6. If no preference record exists, use defaults from `NOTIFICATION_TYPES[notificationKey]`.
  7. If `siteEnabled` is `false`, return early -- skip notification creation.
  8. If `groupKey` is provided, query for existing unread notification with same `groupKey` created within last 5 minutes:
     - If found: increment `groupCount`, update `message`, update `createdAt` to now. Return existing ID.
     - If not found: create new with `groupCount: 1`.
  9. Calculate `expiresAt`: if `persistent === true`, set `undefined`; otherwise `Date.now() + 30 days`.
  10. Insert notification record into `siteNotifications`.
  11. Emit `notification.site_sent` event via Event Dispatcher.
  12. Return the new notification ID.
- **Events:** `notification.site_sent` (`reczTii8GoZ8U5WDD`)
- **Errors:**
  - `VALIDATION_ERROR`: Unknown notification key
  - `VALIDATION_ERROR`: Title exceeds 200 chars
  - `VALIDATION_ERROR`: Message exceeds 1000 chars
  - `VALIDATION_ERROR`: Invalid metadata JSON

#### `notification.mark_read` - Mark Notification as Read

- **Airtable Record:** `recnofBi7EFb3WEjk`
- **Convex Function:** `mutations/siteNotifications.markRead`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** All authenticated users (own notifications only)
- **Args:**
  ```typescript
  {
    notificationId: v.id("siteNotifications"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Fetch notification record by ID.
  3. Verify `notification.userId === authenticatedUser.externalAuthId` (ownership).
  4. If `readAt` is already set, return early (idempotent).
  5. Update: `readAt = Date.now()`.
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: Not authenticated
  - `NOT_FOUND`: Notification ID does not exist
  - `FORBIDDEN`: Notification belongs to different user

#### `notification.mark_all_read` - Mark All Notifications as Read

- **Airtable Record:** `recxWC0Nd6aK6dNyf`
- **Convex Function:** `mutations/siteNotifications.markAllRead`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** All authenticated users (own notifications only)
- **Args:**
  ```typescript
  {
    beforeTimestamp: v.optional(v.number()),
  }
  ```
- **Returns:** `{ count: number }` -- number of notifications marked as read
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Query all unread notifications for this user (`readAt === undefined`).
  3. If `beforeTimestamp` is provided, filter to `createdAt <= beforeTimestamp`.
  4. Batch-update all matching: `readAt = Date.now()`.
  5. Process in batches of 100 to avoid Convex mutation size limits.
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: Not authenticated

#### `notification.delete` - Dismiss Notification

- **Airtable Record:** `recu6UxvpEVGyrtAy`
- **Convex Function:** `mutations/siteNotifications.dismiss`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** All authenticated users (own notifications only)
- **Note:** Named "Delete" in Airtable but implemented as soft-dismiss (`dismissedAt` timestamp). Hard deletion is reserved for the retention cleanup cron to preserve audit trail.
- **Args:**
  ```typescript
  {
    notificationId: v.id("siteNotifications"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Fetch notification record.
  3. Verify ownership.
  4. If `dismissedAt` is already set, return early (idempotent).
  5. Update: `dismissedAt = Date.now()`.
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: Not authenticated
  - `NOT_FOUND`: Notification does not exist
  - `FORBIDDEN`: Not the owner

#### `notification.update_preferences` - Update Notification Preferences

- **Airtable Record:** `reczP8b1jgcExAVNQ`
- **Convex Function:** `mutations/siteNotifications.updatePreferences`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** All authenticated users (own preferences only)
- **Args:**
  ```typescript
  {
    preferences: v.array(v.object({
      notificationKey: v.string(),
      siteEnabled: v.boolean(),
      toastEnabled: v.boolean(),
    })),
  }
  ```
- **Returns:** `{ count: number }` -- number of preferences updated
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Validate array length <= 50 (prevent bulk abuse).
  3. For each preference:
     a. Validate `notificationKey` is a known key.
     b. Query existing preference by `by_user_key` index.
     c. If exists: update `siteEnabled`, `toastEnabled`, `updatedAt`.
     d. If not exists: insert new preference record.
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: Not authenticated
  - `VALIDATION_ERROR`: Unknown notification key
  - `VALIDATION_ERROR`: Array exceeds 50 items

### Queries

#### `siteNotifications.list` - List User's Notifications

- **Convex Function:** `queries/siteNotifications.list`
- **Type:** Query (reactive subscription)
- **Auth:** Required (auth identity)
- **Args:**
  ```typescript
  {
    userId: v.string(),
    type: v.optional(notificationType),
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()), // Default: 20, max: 100
    cursor: v.optional(v.number()), // Pagination cursor (createdAt timestamp)
  }
  ```
- **Returns:**
  ```typescript
  {
    notifications: SiteNotification[];
    nextCursor?: number;
    hasMore: boolean;
  }
  ```
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Verify `args.userId` matches authenticated user (or user is Administrator for admin views).
  3. Query `siteNotifications` using appropriate index:
     - Default: `by_user` index
     - If `type` provided: `by_user_type` index
     - Exclude dismissed (`dismissedAt === undefined`)
     - If `unreadOnly`: filter `readAt === undefined`
     - If `cursor`: filter `createdAt < cursor`
  4. Limit results and compute `hasMore`.
- **Pagination:** Cursor-based using `createdAt` timestamp
- **Filters:** type, unreadOnly
- **Real-Time:** This is a Convex reactive query. Clients receive live updates when notifications change.

#### `siteNotifications.unreadCount` - Get Unread Count

- **Convex Function:** `queries/siteNotifications.unreadCount`
- **Type:** Query (reactive subscription)
- **Auth:** Required (auth identity)
- **Args:**
  ```typescript
  {
    userId: v.string(),
  }
  ```
- **Returns:** `{ count: number }`
- **Behavior:**
  1. Authenticate user.
  2. Verify ownership.
  3. Query `siteNotifications` using `by_user_unread` index where `userId` matches and `readAt === undefined` and `dismissedAt === undefined`.
  4. Cap count at 100 (display as "99+" for > 99).
- **Performance:** Most frequently subscribed query. Index-optimized. Convex caches identical subscriptions.

#### `siteNotifications.getPreferences` - Get User Preferences

- **Convex Function:** `queries/siteNotifications.getPreferences`
- **Type:** Query
- **Auth:** Required (auth identity)
- **Args:**
  ```typescript
  {
    userId: v.string(),
  }
  ```
- **Returns:**
  ```typescript
  Array<{
    notificationKey: string;
    notificationName: string;
    category: string;
    siteEnabled: boolean;
    toastEnabled: boolean;
  }>
  ```
- **Behavior:**
  1. Authenticate user.
  2. Query all preferences for user from `notificationPreferences`.
  3. Merge with `NOTIFICATION_TYPES` constant to produce complete list -- types without explicit preferences use defaults.
  4. Group by category for UI rendering.

### Internal Functions

#### `internal.siteNotifications.onEvent` - Generic Event Handler

- **Convex Function:** `internals/siteNotifications.onEvent`
- **Type:** Internal mutation (called by Event Dispatcher)
- **Args:**
  ```typescript
  {
    event: v.object({
      _id: v.id("events"),
      code: v.string(),
      payload: v.string(), // JSON string
      actorId: v.optional(v.string()),
    }),
  }
  ```
- **Behavior:**
  1. Parse event payload JSON.
  2. Look up notification type config from `NOTIFICATION_TYPES` using `event.code`.
  3. Determine recipient(s) based on `recipientType`:
     - `employee`: resolve specific user from payload (e.g., post author)
     - `admin`: query all users with Administrator role
     - `customer`: resolve specific affected user from payload
  4. Resolve actor info (name, avatar) from the auth system if `actorId` present.
  5. Build notification message by interpolating template variables.
  6. For each recipient, call `notification.send` mutation.

#### `internal.siteNotifications.cleanup` - Retention Cleanup

- **Convex Function:** `crons/siteNotifications.cleanup`
- **Type:** Cron function (runs daily)
- **Behavior:**
  1. Query `siteNotifications` where `expiresAt < Date.now()` using `by_expires` index.
  2. Delete expired notifications in batches of 100.
  3. Log count of cleaned-up notifications.

---

## Events

### `notification.site_sent`

- **Airtable Record:** `reczTii8GoZ8U5WDD`
- **Type:** Notification
- **Triggered By:** `notification.send` action (every time a site notification is created)
- **Payload:**
  ```typescript
  {
    userId: string;         // Recipient user ID
    type: string;           // Notification type (info, success, warning, error)
    message: string;        // Notification message text
  }
  ```
- **Subscribers:**
  - Audit Log: Yes (records notification delivery for audit trail)
  - Email: No
  - Site: No (circuit breaker prevents `notification.*` events from triggering notification listeners -- this would create infinite loops)
  - Side Effects: None

---

## Admin Routes & UI

### Notification Settings (`/admin/settings/notifications`)

- **Airtable Record:** `recw6KtndGLWazmE6`
- **Purpose:** Global notification settings page for administrators.
- **WordPress Equivalent:** No direct equivalent (WordPress has no notification settings page).
- **Layout:** Admin `_admin` layout with left sidebar.
- **Auth Required:** Yes
- **Roles:** Administrator only
- **Key Components:**
  - System-wide enable/disable toggle per notification type
  - Default preference presets ("Essential Only", "All Notifications", "Custom")
  - Notification retention period setting (default: 30 days for non-persistent)
  - Test notification button (sends test notification to the admin)
- **Data Requirements:** `siteNotifications.getPreferences`, notification type constants
- **User Interactions:** Toggle notification types on/off system-wide, set default presets, test notification delivery
- **Real-Time:** Test notification delivery appears instantly in bell

### Notification Bell (Global Header Component)

- **Component:** `<NotificationBell />`
- **Location:** Admin header bar AND website dashboard header
- **Purpose:** Always-visible bell icon with unread count badge and dropdown popover
- **Behavior:**
  1. Shows bell icon (Lucide `Bell`) when user is authenticated
  2. Red badge with unread count (> 99 shows "99+")
  3. Click opens dropdown popover (not a new page)
  4. Dropdown shows 10 most recent notifications
  5. Footer link: "View all notifications" -> `/dashboard/notifications`
  6. "Mark all as read" link in dropdown header
  7. New notifications slide in at top while dropdown is open (real-time)
- **Data Requirements:** `unreadCount` query, `list` query (limit: 10)
- **Real-Time:** Badge count and dropdown list update instantly via Convex subscriptions

---

## Website Routes

### My Notifications (`/dashboard/notifications`)

- **Airtable Record:** `recNRE76YKtk4auzO`
- **Purpose:** Full notification center page for users
- **Layout:** Website `_dashboard` layout
- **Auth Required:** Yes
- **Roles:** All authenticated users
- **Key Components:**
  - **Header:** Page title "Notifications", "Mark all as read" button, filter tabs (All | Unread | Info | Success | Warning | Error)
  - **Notification List:** Reverse-chronological, each card shows actor avatar or type icon, title + message, relative timestamp, action button, dismiss button. Unread indicator (blue dot or left border). Grouped notifications show count badge. Infinite scroll (20 per page).
  - **Empty State:** Illustration + "No notifications yet" / "You're all caught up!"
  - **Preferences Tab:** Tabbed/accordion by category, per-notification-type toggles for site + toast, save button with Sonner confirmation
- **Data Requirements:** `list` query, `unreadCount` query, `getPreferences` query
- **SEO:** None (authenticated page, no indexing)
- **Caching:** None (real-time subscription, no caching needed)

---

## Sonner Toast Integration

### `<NotificationToastProvider />` Component

- Wraps app root (both admin and website apps)
- Subscribes to user's notification feed via Convex reactive query
- When new notification arrives (detected by comparing latest notification ID):
  1. Check user preferences for this `notificationKey`
  2. If `toastEnabled` (or no preference, default `true`): show Sonner toast
  3. Toast auto-dismisses based on type duration
  4. Clicking toast navigates to `actionUrl` if present

### Toast Type Mapping

| Notification Type | Sonner Function | Duration |
|-------------------|----------------|----------|
| `info` | `toast.info()` | 5 seconds |
| `success` | `toast.success()` | 4 seconds |
| `warning` | `toast.warning()` | 8 seconds |
| `error` | `toast.error()` | 10 seconds |

### Toast Position

- Admin app: top-right (avoids sidebar interference)
- Website dashboard: bottom-right (standard SaaS position)

---

## Notifications

### Site Notifications (30 Types)

| Key | Name | Event | Type | Persistent | Recipient | Icon | Group Key |
|-----|------|-------|------|-----------|-----------|------|-----------|
| `post_published` | Post Published | `post.published` | Success | No | Employee | `FileText` | None |
| `post_scheduled` | Post Scheduled | `post.scheduled` | Info | Yes | Employee | `Clock` | None |
| `post_trashed` | Post Trashed | `post.trashed` | Warning | No | Employee | `Trash2` | None |
| `post_restored` | Post Restored | `post.restored` | Success | No | Employee | `RotateCcw` | None |
| `revision_created` | Revision Created | `revision.created` | Info | No | Employee | `History` | `revision.created:{postId}` |
| `revision_restored` | Revision Restored | `revision.restored` | Warning | Yes | Employee | `History` | None |
| `new_comment` | New Comment | `comment.created` | Info | Yes | Employee | `MessageSquare` | `comment.created:{postId}` |
| `pending_comments` | Pending Comments | `comment.created` | Info | Yes | Admin | `MessageSquareDashed` | `comment.pending:global` |
| `comment_approved` | Comment Approved | `comment.approved` | Success | No | Customer | `CheckCircle` | None |
| `comment_rejected` | Comment Rejected | `comment.rejected` | Warning | No | Customer | `XCircle` | None |
| `comment_reply` | Comment Reply | `comment.replied` | Info | Yes | Customer | `Reply` | `comment.replied:{parentCommentId}` |
| `comment_flagged` | Comment Flagged | `comment.flagged` | Warning | Yes | Admin | `Flag` | `comment.flagged:global` |
| `media_uploaded` | Media Uploaded | `media.uploaded` | Success | No | Employee | `Upload` | `media.uploaded:{userId}` |
| `media_deleted` | Media Deleted | `media.deleted` | Info | No | Employee | `Trash2` | `media.deleted:{userId}` |
| `new_user_registered` | New User Registered | `registration.user_registered` | Info | No | Admin | `UserPlus` | `registration.user_registered:global` |
| `user_invited` | User Invited | `registration.user_invited` | Success | No | Admin | `Mail` | None |
| `login_new_location` | Login from New Location | `auth.logged_in` | Warning | Yes | Customer | `MapPin` | None |
| `failed_login_alert` | Failed Login Alert | `auth.login_failed` | Error | Yes | Customer | `ShieldAlert` | `auth.login_failed:{email}` |
| `password_changed` | Password Changed | `password.changed` | Success | No | Customer | `KeyRound` | None |
| `profile_updated` | Profile Updated | `profile.updated` | Success | No | Customer | `User` | None |
| `avatar_changed` | Avatar Changed | `profile.avatar_changed` | Success | No | Customer | `Image` | None |
| `role_changed` | Role Changed | `role.assigned` | Info | Yes | Customer | `Shield` | None |
| `menu_updated` | Menu Updated | `menu.updated` | Success | No | Admin | `Menu` | `menu.updated:{menuId}` |
| `menu_location_assigned` | Menu Location Assigned | `menu.location_assigned` | Info | No | Admin | `MapPin` | None |
| `settings_updated` | Settings Updated | `settings.updated` | Info | No | Admin | `Settings` | `settings.updated:global` |
| `permalink_changed` | Permalink Changed | `settings.permalinks_changed` | Warning | Yes | Admin | `Link` | None |
| `seo_updated` | SEO Updated | `seo.updated` | Info | No | Employee | `Search` | `seo.updated:{postId}` |
| `sitemap_regenerated` | Sitemap Regenerated | `seo.sitemap_generated` | Success | No | Admin | `Globe` | None |
| `api_key_created` | API Key Created | `api.key_created` | Info | Yes | Admin | `Key` | None |
| `webhook_failed` | Webhook Failed | `api.webhook_triggered` | Error | Yes | Admin | `AlertTriangle` | `api.webhook_triggered:{endpointId}` |

### Default Preferences by Category

| Category | Default `siteEnabled` | Default `toastEnabled` |
|----------|:---------------------:|:---------------------:|
| Content (post, revision) | true | true |
| Comments | true | true |
| Media | true | false |
| Auth/Security | true | true |
| Profile/Account | true | false |
| Admin/System | true | true |

### Notification Categories (UI Order)

1. Content
2. Comments
3. Media
4. Users
5. Security
6. Account
7. System
8. Discovery
9. Developer

### Cross-Reference with Email Notification System

Events that trigger BOTH site and email notifications:

| Event | Site Notification | Email Notification |
|-------|:-----------------:|:------------------:|
| `post.published` | post_published (Success) | Post Published Author + Subscribers |
| `comment.created` | new_comment + pending_comments | New Comment + Pending Moderation |
| `comment.approved` | comment_approved (Success) | Comment Approved |
| `comment.replied` | comment_reply (Info) | Comment Reply |
| `auth.logged_in` | login_new_location (Warning) | Login from New Device |
| `auth.login_failed` | failed_login_alert (Error) | Failed Login Attempts |
| `password.changed` | password_changed (Success) | Password Changed Confirmation |
| `role.assigned` | role_changed (Info) | Role Changed |
| `revision.restored` | revision_restored (Warning) | Revision Restored Alert |
| `settings.updated` | settings_updated (Info) | Settings Changed Alert |
| `seo.sitemap_generated` | sitemap_regenerated (Success) | Sitemap Generated |
| `api.webhook_triggered` | webhook_failed (Error) | Webhook Failure Alert |
| `registration.user_registered` | new_user_registered (Info) | Welcome + Verification + Admin |
| `registration.user_invited` | user_invited (Success) | User Invitation |

Events with site notification ONLY (no email): `post.scheduled`, `post.trashed`, `post.restored`, `comment.rejected`, `comment.flagged`, `media.uploaded`, `media.deleted`, `revision.created`, `profile.updated`, `profile.avatar_changed`, `menu.updated`, `menu.location_assigned`, `settings.permalinks_changed`, `seo.updated`, `api.key_created`.

---

## Role & Capability Matrix

### Action Permissions

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:------------:|:------:|:------:|:-----------:|:----------:|
| `notification.send` | System | System | System | System | System |
| `notification.mark_read` | Own | Own | Own | Own | Own |
| `notification.mark_all_read` | Own | Own | Own | Own | Own |
| `notification.delete` | Own | Own | Own | Own | Own |
| `notification.update_preferences` | Own | Own | Own | Own | Own |

**Notes:**
- `notification.send` is "System" -- internal action called by Event Dispatcher listeners, never directly by users.
- All other actions are "Own" -- users can only interact with their own notifications.
- No capability exists for reading/managing another user's notifications.

### Route Access

| Route | Administrator | Editor | Author | Contributor | Subscriber |
|-------|:------------:|:------:|:------:|:-----------:|:----------:|
| `/admin/settings/notifications` | Yes | No | No | No | No |
| `/dashboard/notifications` | Yes | Yes | Yes | Yes | Yes |
| Notification Bell (header) | Yes | Yes | Yes | Yes | Yes |

### Recipient Type Resolution

| Recipient Type | Resolution Logic | Example Notifications |
|---------------|-----------------|----------------------|
| **Admin** | All users with `Administrator` role | Pending comments, new registrations, webhook failures |
| **Employee** | Specific user resolved from event payload (post author, uploader) | Post published, new comment on post, media uploaded |
| **Customer** | Specific user resolved from event payload (comment author, profile owner) | Comment approved, role changed, password changed |

---

## Dependencies

### Depends On

| System | Dependency Type | What Is Needed |
|--------|:---------------:|----------------|
| **Event Dispatcher System** (`rec1fnG6PNl4CPS77`) | **Hard** | All notifications are triggered by events flowing through the Event Dispatcher. Without it, no notifications fire. The Event Dispatcher must support listener registration, event emission, and circuit-breaking (preventing `notification.*` events from triggering notification listeners). |

### Depended On By

| System | What They Need |
|--------|----------------|
| No systems depend on the Site Notification System directly | This is a leaf system -- it consumes events but does not provide APIs consumed by other systems. The `notification.site_sent` event is consumed only by the Audit Log System for record-keeping. |

### Systems That Produce Events Consumed

| System | Events Consumed | Notification Count |
|--------|----------------|:-----------------:|
| Post System | `post.published`, `post.scheduled`, `post.trashed`, `post.restored` | 4 |
| Comment System | `comment.created`, `comment.approved`, `comment.rejected`, `comment.replied`, `comment.flagged` | 6 |
| Media System | `media.uploaded`, `media.deleted` | 2 |
| Revision System | `revision.created`, `revision.restored` | 2 |
| Registration System | `registration.user_registered`, `registration.user_invited` | 2 |
| Auth System | `auth.logged_in`, `auth.login_failed` | 2 |
| Password Management System | `password.changed` | 1 |
| User Profile System | `profile.updated`, `profile.avatar_changed` | 2 |
| Role & Capability System | `role.assigned` | 1 |
| Menu System | `menu.updated`, `menu.location_assigned` | 2 |
| Settings System | `settings.updated`, `settings.permalinks_changed` | 2 |
| SEO System | `seo.updated`, `seo.sitemap_generated` | 2 |
| API System | `api.key_created`, `api.webhook_triggered` | 2 |
| **Total** | **21 unique event codes** | **30** |

### Sibling System

- **Email Notification System** (`recgEU3ehNLTNqWeU`): Both consume events from the Event Dispatcher independently. Site notifications write to Convex; email notifications send via Resend. User preferences control each channel independently per notification type.

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/convex/)

- [ ] `convex/schema.ts` -- Add `siteNotifications` and `notificationPreferences` tables (2 tables)
- [ ] `convex/siteNotifications/queries.ts` -- 3 queries: `list`, `unreadCount`, `getPreferences`
- [ ] `convex/siteNotifications/mutations.ts` -- 5 mutations: `send`, `markRead`, `markAllRead`, `dismiss`, `updatePreferences`
- [ ] `convex/siteNotifications/internals.ts` -- 1 internal mutation: `onEvent`
- [ ] `convex/siteNotifications/validators.ts` -- Shared argument validators (`notificationType`, etc.)
- [ ] `convex/notifications/siteHandlers.ts` -- 30 event handler functions
- [ ] `convex/lib/notificationTypes.ts` -- `NOTIFICATION_TYPES` constant (30 entries) + `NOTIFICATION_CATEGORIES`
- [ ] `convex/crons/siteNotificationCleanup.ts` -- Daily retention cleanup cron
- [ ] `convex/bootstrap/registerListeners.ts` -- Add 30 site notification listener registrations

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

- [ ] `components/notifications/notification-bell.tsx` -- Bell icon + badge + dropdown popover
- [ ] `components/notifications/notification-card.tsx` -- Single notification card (shared between dropdown and page)
- [ ] `components/notifications/notification-list.tsx` -- Scrollable notification list
- [ ] `components/notifications/notification-empty.tsx` -- Empty state illustration
- [ ] `components/notifications/notification-toast-provider.tsx` -- Sonner toast integration
- [ ] `routes/admin/settings/notifications.tsx` -- `/admin/settings/notifications` page
- [ ] `hooks/use-notification-toasts.ts` -- Custom hook for toast delivery via subscription
- [ ] `hooks/use-notifications.ts` -- Convenience hooks wrapping Convex queries
- [ ] `lib/notifications/types.ts` -- TypeScript types
- [ ] `lib/notifications/constants.ts` -- Client-side notification constants
- [ ] `components/layout/header.tsx` -- MODIFY: Add `<NotificationBell />` to header

### Website Frontend (ConvexPress-Website/app/)

- [ ] `components/notifications/notification-bell.tsx` -- Bell icon (website variant)
- [ ] `components/notifications/notification-card.tsx` -- Shared notification card
- [ ] `components/notifications/notification-toast-provider.tsx` -- Sonner toast integration
- [ ] `routes/dashboard/notifications.tsx` -- `/dashboard/notifications` page
- [ ] `hooks/use-notification-toasts.ts` -- Toast hook (same pattern as admin)
- [ ] `hooks/use-notifications.ts` -- Convenience hooks
- [ ] `components/layout/dashboard-header.tsx` -- MODIFY: Add `<NotificationBell />` to dashboard header

---

## Edge Cases & Gotchas

1. **Self-notifications:** When a user performs an action that triggers a notification to themselves (e.g., admin updates settings), optionally suppress self-notifications. Controlled by preference: "Don't notify me about my own actions" (default: `true` for success/info, `false` for warning/error).

2. **Deleted user as actor:** If the actor who triggered the event has been deleted, fall back to `actorName: "Deleted User"` and `actorAvatarUrl: undefined`.

3. **Bulk operations:** During bulk imports (100+ events), detect the `correlationId` on the event and create a single summary notification instead of 100 grouped ones.

4. **Offline users:** Notifications persist in the database. When offline users reconnect, Convex re-evaluates subscriptions and all accumulated notifications appear. No special handling needed.

5. **Tab synchronization:** Marking as read in one tab updates all tabs instantly. This is built into Convex's reactive model -- no custom sync logic needed.

6. **Notification for non-existent user:** If event payload references a `userId` that no longer exists in Convex Auth, log a warning and skip notification creation. Do not throw.

7. **Rate limiting:** If a single user receives > 50 notifications in a 5-minute window, subsequent notifications are grouped into a single "You have X new notifications" summary. Prevents abuse (e.g., comment spam).

8. **Preference not found:** If a notification type key is not found in `NOTIFICATION_TYPES` (e.g., new event type added but notification not defined), log a warning and skip. Never create notifications with unknown keys.

9. **Infinite loop prevention:** The Event Dispatcher's circuit-breaking logic MUST prevent `notification.*` events from triggering notification listeners. The `notification.site_sent` event must never generate another site notification.

10. **Grouping window:** The 5-minute grouping window is based on `createdAt`, not wall clock time. When a grouped notification is updated, its `createdAt` is bumped to now, resetting the window. This means rapid activity can keep a notification "alive" and grouping for extended periods.

11. **Mark all read batching:** The `markAllRead` mutation processes in batches of 100 to avoid exceeding Convex mutation size limits. For users with thousands of unread notifications, this is essential.

12. **Unread count cap:** The `unreadCount` query caps at 100 and returns "99+" for display. This prevents counting thousands of unread notifications for inactive users who haven't logged in for weeks.

13. **Message template resolution timing:** Templates are resolved at notification creation time, not read time. If a post title changes after notification creation, the notification retains the original title. This is intentional -- it reflects what happened at the time.

14. **Write amplification for admin notifications:** For admin-targeted notifications (e.g., "New User Registered"), the handler creates one notification per admin. If there are 5 admins, one event produces 5 records. Acceptable for small-to-medium sites. For 50+ admins, consider role-based targeting.

15. **Login new location filter:** The `login_new_location` listener has a `filterCondition: '{"newLocation":true}'`. Only fires when the event payload includes `newLocation: true`, not on every login.

16. **Webhook failed filter:** The `webhook_failed` listener has `filterCondition: '{"failed":true}'`. Only fires for failed webhook deliveries, not successful ones.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `add_action('admin_notices', callback)` | Event Dispatcher listener registration in `registerListeners.ts` | WordPress notices are global/transient; ConvexPress notifications are per-user/persistent |
| `wp_admin_notice($message, $args)` (WP 6.4+) | `internal.siteNotifications.send` mutation | WP function creates transient notice; ConvexPress creates persistent record |
| No equivalent | `siteNotifications.list` query | WordPress has no notification history |
| No equivalent | `siteNotifications.unreadCount` query | WordPress has no unread count tracking |
| No equivalent | `siteNotifications.markRead` mutation | WordPress notices auto-dismiss; no read tracking |
| No equivalent | `siteNotifications.markAllRead` mutation | No WordPress equivalent |
| No equivalent | `siteNotifications.dismiss` mutation | WordPress notices dismissed by removing action hook |
| No equivalent | `notificationPreferences` table | WordPress has no per-user notification preferences |
| `bp_notifications_add_notification()` (BuddyPress) | `internal.siteNotifications.send` | BuddyPress is the closest WP ecosystem equivalent |
| `bp_notifications_get_notifications_for_user()` (BuddyPress) | `siteNotifications.list` query | BuddyPress notifications are database-persisted like ConvexPress |
| `bp_notifications_mark_notifications_by_type()` (BuddyPress) | `siteNotifications.markAllRead` | BuddyPress supports marking by type |
| WooCommerce Admin Inbox | Notification center page `/dashboard/notifications` | WooCommerce Inbox is admin-only; ConvexPress is for all users |

---

## Notification Type Constants Reference

The `NOTIFICATION_TYPES` constant (`convex/lib/notificationTypes.ts`) defines all 30 notification types with their configuration:

```typescript
export interface NotificationTypeConfig {
  key: string;                    // Snake_case key (e.g., "post_published")
  name: string;                   // Human-readable name (e.g., "Post Published")
  category: string;               // UI grouping category
  eventCode: string;              // Source event code (e.g., "post.published")
  type: "info" | "success" | "warning" | "error";
  recipientType: "admin" | "employee" | "customer";
  persistent: boolean;
  defaultSiteEnabled: boolean;
  defaultToastEnabled: boolean;
  icon: string;                   // Lucide icon name
  messageTemplate: string;        // Template with {variable} placeholders
  actionUrlTemplate?: string;     // URL template with {variable} placeholders
  actionLabel?: string;           // Button label (e.g., "View Post")
  groupKeyTemplate?: string;      // Grouping key template (e.g., "comment.created:{postId}")
}
```

### Event Listener Registration

30 listeners are registered in `convex/bootstrap/registerListeners.ts`. Each listener maps one event code to one handler function with consistent configuration:
- `handlerModule: "notifications/siteHandlers"`
- `handlerType: "internal"`
- `priority: 10` (11 for `onCommentCreatedAdmin` to run after author notification)
- `system: "site-notification"`
- `maxRetries: 2`, `retryDelayMs: 1000`, `retryBackoff: "linear"`

Two listeners have `filterCondition`:
- `onLoginNewLocation`: `'{"newLocation":true}'`
- `onWebhookFailed`: `'{"failed":true}'`

---

## Performance Considerations

1. **Subscription fan-out:** ~2 active subscriptions per authenticated user (unreadCount + list). 100 concurrent users = 200 subscriptions -- well within Convex capabilities.

2. **Table size:** ~100 notifications/day with 30-day retention = ~3000 records. The `by_expires` index makes cleanup efficient.

3. **Write amplification:** Admin-targeted notifications create 1 record per admin (5 admins = 5 records per event). Acceptable for small-to-medium sites.

4. **Unread count query:** Index-optimized (`by_user_unread`). Convex caches identical subscriptions. Multiple tabs = single query evaluation.
