# Website User Dashboard UI - Expert Knowledge Document

**System:** Website User Dashboard UI
**Expert Type:** Website UI Expert
**Status:** Implementation Ready
**Priority:** P2 - High
**WordPress Equivalent:** Front-end user dashboard (no direct WP equivalent -- inspired by BuddyPress profile, WooCommerce My Account), `wp-admin/profile.php` (Your Profile), `wp-admin/options-general.php` (Account Settings)
**Airtable Expert Record:** `recrLu3gQkY0DelTg`
**Last Analyzed:** 2026-02-09

---

## IMPORTANT: Convex Auth

**The auth provider is Convex Auth, not Clerk.** This affects avatar sources, session management, and the password change flow.

Key specifics:
- **Auth Provider:** Convex Auth
- **Client Package:** `@auth/authkit-tanstack-react-start` for website app
- **Avatar Fallback Chain:** Custom upload (Convex Storage) > Convex Auth OAuth avatar (`authAvatarUrl`) > Generated initials
- **Password Change:** Convex Auth handles all password cryptography. The Account Settings page links to a Convex Auth-managed password change flow -- ConvexPress never stores or validates passwords.
- **SSR Auth:** TanStack Start uses `getAuth()` from `@auth/authkit-tanstack-react-start` for server-side auth checks in route loaders.

---

## Quick Reference

### What This Expert Does

The Website User Dashboard UI Expert owns all authenticated user-facing pages and components within the `/dashboard` area of the website app (`ConvexPress-Website/`). This includes the dashboard home (widget grid), edit profile page, account settings page, my comments page, my notifications page, and the dashboard sidebar navigation. It is responsible for:

1. **Dashboard home layout** -- Widget grid displaying My Content, My Comments, My Notifications, Content Performance, and Quick Links
2. **Edit Profile page** -- Avatar upload, display name selector, first/last name (read-only from the auth system), nickname, bio, website URL, social links
3. **Account Settings page** -- Email display (read-only), password change section, notification preferences, delete account flow
4. **My Comments page** -- List of the user's own comments with status, link to parent post, edit/delete actions
5. **My Notifications page** -- Notification feed with mark-as-read, mark-all-read, notification preference toggles
6. **Dashboard sidebar navigation** -- Persistent left-side navigation: Dashboard, Profile, Comments, Notifications, Settings
7. **User avatar component** -- Custom upload > Convex Auth OAuth > initials fallback, with upload and crop functionality
8. **Display name selector** -- WordPress-style dropdown of computed name options
9. **Social links form** -- Predefined set of social platform inputs (Twitter, GitHub, LinkedIn, Website, etc.)
10. **Delete account confirmation flow** -- Destructive action dialog requiring email confirmation

This expert does NOT:
- Define Convex queries or mutations (those belong to User Profile System, Dashboard System, Comment System, Site Notification System, Password Management System experts)
- Handle webhook processing or server-side token validation
- Manage Convex Auth configuration or API keys
- Own the admin-side user management UI (that belongs to Admin Editor Layout UI / Admin List Table UI experts)

### Key Concepts

| Concept | Description |
|---------|-------------|
| **DashboardLayout** | Shared layout wrapper for all `/dashboard/*` pages -- sidebar nav, header with user info, content area |
| **Widget Grid** | Static 2-column layout (v1, no drag-and-drop) displaying personalized dashboard widgets |
| **Avatar Resolution** | Custom upload (highest priority) > Convex Auth OAuth avatar > Generated initials fallback |
| **Display Name Selector** | Dropdown auto-generated from firstName, lastName, nickname, email username (mirrors WordPress "Display name publicly as") |
| **Notification Preferences** | Per-category toggles for site notifications and toast delivery |
| **Delete Account Flow** | Destructive action requiring the user to type their email to confirm. Content disposition: reassign to admin or delete. |
| **Convex Auth-Managed Fields** | Email, firstName, lastName are read-only in ConvexPress (synced via auth webhooks). Shown as disabled inputs with explanation text. |
| **SSR + Hydration** | All dashboard pages use TanStack Start SSR for initial load, then Convex subscriptions take over for real-time updates. |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| User dashboard URL | No front-end equivalent (admin only) | `/dashboard` (website, public-facing) |
| Profile edit URL | `/wp-admin/profile.php` | `/dashboard/profile` |
| Account settings | Part of profile page | `/dashboard/settings` (separate page) |
| My comments | No dedicated page | `/dashboard/comments` |
| Notifications | No front-end equivalent | `/dashboard/notifications` |
| Dashboard navigation | Admin left sidebar | Dedicated dashboard sidebar |
| Avatar | Gravatar (email hash) | Custom upload > Convex Auth OAuth > Initials |
| Display name | Dropdown on profile page | Same WordPress dropdown pattern |
| Password change | "New Password" field on profile | Convex Auth-managed password change |
| Delete account | Not available to users (admin only) | Self-service with email confirmation |
| Real-time updates | Page refresh required | Convex reactive subscriptions |
| Social links | Plugin territory (Yoast SEO, etc.) | Built-in social links form |
| SSR | PHP server-rendered | TanStack Start SSR + Convex hydration |

---

## Architecture Overview

### Dashboard Page Flow

```
User navigates to /dashboard (or any /dashboard/* page)
    |
    v
TanStack Start SSR loader calls getAuth()
    |
    +--> User is NOT authenticated -> redirect to "/login?returnTo=/dashboard"
    +--> User IS authenticated -> continue
              |
              v
         SSR renders initial page shell with layout
              |
              v
         Client hydrates, Convex subscriptions activate
              |
              v
         Dashboard data loads via useQuery():
           - getCurrentUser -> user profile data
           - getWebsiteDashboard -> widget data (my posts, comments, notifications)
           - getWidgetPreferences -> layout preferences (website surface)
              |
              v
         Widgets render with live data
         All data updates in real-time via Convex subscriptions
```

### Dashboard Navigation Flow

```
/dashboard (home)
    |
    +-- /dashboard/profile (edit profile)
    +-- /dashboard/comments (my comments)
    +-- /dashboard/notifications (my notifications)
    +-- /dashboard/settings (account settings)
```

All pages share the `DashboardLayout` wrapper which provides the sidebar navigation and header.

### Edit Profile Flow

```
User navigates to /dashboard/profile
    |
    v
Loader: getAuth() -> redirect if not authenticated
    |
    v
Client: useQuery(api.users.getCurrentUser)
    |
    v
Render profile form with current data:
  - Avatar (with upload/remove actions)
  - Display name selector (computed from name parts)
  - Nickname, website, bio, social links
    |
    v
User edits fields and clicks "Save Profile"
    |
    v
Client: useMutation(api.users.updateProfile)
    |
    v
Convex mutation validates and patches user record
    |
    v
Convex reactivity updates all subscribed components
    |
    v
Toast: "Profile updated successfully" (via Sonner)
```

### Avatar Upload Flow

```
User clicks "Change Photo" button on avatar
    |
    v
File picker opens (accept: image/*, max 5MB)
    |
    v
User selects image file
    |
    v
Crop dialog opens (square aspect ratio enforced)
    |
    v
User adjusts crop and confirms
    |
    v
Client calls generateUploadUrl() from Convex
    |
    v
Client uploads cropped image to Convex Storage URL
    |
    v
Client receives storageId from upload response
    |
    v
Client calls useMutation(api.users.uploadAvatar, { storageId })
    |
    v
Server: deletes old avatar if exists, resolves new URL, patches user
    |
    v
Convex reactivity updates avatar everywhere
    |
    v
Toast: "Profile avatar updated"
```

### Delete Account Flow

```
User clicks "Delete Account" in Account Settings
    |
    v
Confirmation dialog opens (destructive action dialog)
    |
    v
Dialog shows:
  - Warning: "This action is permanent and cannot be undone"
  - Content disposition: "Your content will be reassigned to the site administrator"
  - Requires typing email address to confirm
    |
    v
User types their email and clicks "Delete My Account"
    |
    v
Client calls useMutation(api.users.deleteUser, {
  userId: currentUser._id,
  contentAction: "reassign",
  reassignToUserId: adminUserId  // determined server-side or via query
})
    |
    v
Server: validates, handles content, deletes avatar, deletes Convex record,
        schedules Convex Auth user deletion
    |
    v
Client: redirect to "/" with "Account deleted" toast
    |
    v
auth session cleared
```

### Provider Stack (Website App)

```
<ConvexProvider client={convexClient}>
  <AuthKitProvider>       {/* @auth/authkit-tanstack-react-start/client */}
    <html>
      <body>
        <Header />        {/* uses useAuth() for sign-in/sign-out state */}
        <Outlet />        {/* Route components -- includes DashboardLayout for /dashboard/* */}
      </body>
    </html>
  </AuthKitProvider>
</ConvexProvider>
```

### Real-Time Behavior

- **Dashboard widgets:** All widgets use independent Convex `useQuery` subscriptions. When a new comment is posted on the user's content, the My Comments widget updates live. When a notification arrives, the My Notifications widget and unread count update instantly.
- **Profile data:** If a auth webhook syncs updated name/email data while the user is on the profile page, the read-only fields update in real-time.
- **Avatar propagation:** When a user uploads a new avatar, all instances of their avatar across the site (comments, author cards, dashboard) update for all connected clients.
- **Notification feed:** New notifications appear at the top of the feed in real-time. Marking as read syncs across all open tabs via Convex subscription propagation.
- **Cross-tab sync:** All dashboard state syncs across browser tabs automatically via Convex -- no custom sync logic needed.

### SSR Considerations

All dashboard pages use TanStack Start's SSR capabilities:

- **Loader auth checks:** Each dashboard page's `loader` calls `getAuth()` to check auth state server-side. Unauthenticated users are redirected before the page renders.
- **No SEO indexing:** Dashboard pages add `noindex` meta tags. They are behind auth and should not be crawled.
- **Hydration:** SSR renders the page shell (layout, sidebar, loading skeletons). Convex subscriptions activate after hydration and populate widget data.
- **Server actions:** Sensitive operations (like delete account) should use TanStack Start server functions where appropriate.

---

## TypeScript Types

### Dashboard Types

```typescript
// ConvexPress-Website/apps/web/src/lib/dashboard/types.ts

/** User profile data from getCurrentUser query */
export interface UserProfile {
  _id: string;                         // Convex document ID
  externalAuthId: string;                    // user identifier
  email: string;                       // Read-only (Convex Auth-managed)
  firstName: string | null;            // Read-only (Convex Auth-managed)
  lastName: string | null;             // Read-only (Convex Auth-managed)
  authAvatarUrl: string | null;      // Convex Auth/OAuth avatar
  nickname: string | null;             // User-editable
  displayName: string;                 // Selected from dropdown
  slug: string;                        // URL slug for author archive
  websiteUrl: string | null;           // Personal website
  bio: string | null;                  // Biography (max 500 chars)
  avatarUrl: string | null;            // Custom uploaded avatar
  avatarStorageId: string | null;      // Convex Storage ID for custom avatar
  socialLinks: SocialLinks | null;
  preferences: UserPreferences | null;
  roleId: string;                      // Reference to roles table
  status: "active" | "deactivated" | "pending";
  postCount: number | null;
  commentCount: number | null;
  lastLoginAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Social links object */
export interface SocialLinks {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  github?: string;
  youtube?: string;
}

/** User preferences object */
export interface UserPreferences {
  adminColorScheme?: string;
  showAdminBar?: boolean;
  editorMode?: "visual" | "code";
  emailDigest?: "immediate" | "daily" | "weekly" | "none";
  notifyOnComment?: boolean;
  notifyOnReply?: boolean;
  notifyOnMention?: boolean;
}

/** Display name option for the selector dropdown */
export interface DisplayNameOption {
  label: string;                       // The display name text
  value: string;                       // Same as label (used as the persisted value)
}

/** Website dashboard data from getWebsiteDashboard query */
export interface WebsiteDashboardData {
  myPosts: {
    counts: { published: number; draft: number; pending: number };
    recent: Array<{
      _id: string;
      title: string;
      status: string;
      date: number;
    }>;
  };
  myComments: Array<{
    _id: string;
    excerpt: string;
    postTitle: string;
    status: string;
    date: number;
  }>;
  unreadNotifications: {
    count: number;
    recent: Array<{
      _id: string;
      message: string;
      type: string;
      date: number;
      link: string | null;
    }>;
  };
  contentPerformance: Array<{
    _id: string;
    title: string;
    views: number;
  }> | null;                           // Author+ only, null for others
}

/** User's own comment for My Comments page */
export interface UserComment {
  _id: string;
  content: string;
  excerpt: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  status: "approved" | "pending" | "spam" | "trash";
  parentId: string | null;
  likeCount: number;
  createdAt: number;
  updatedAt: number;
  isEditable: boolean;                 // Within grace period
}

/** Notification item for My Notifications page */
export interface NotificationItem {
  _id: string;
  key: string;                         // e.g., "comment_reply", "post_published"
  message: string;
  type: "info" | "success" | "warning" | "error";
  link: string | null;                 // URL to navigate to on click
  isRead: boolean;
  isPersistent: boolean;
  createdAt: number;
  groupKey: string | null;
}

/** Notification preference for a specific notification key */
export interface NotificationPreference {
  key: string;
  label: string;
  description: string;
  siteEnabled: boolean;
  toastEnabled: boolean;
}

/** Profile form values (editable fields only) */
export interface ProfileFormValues {
  nickname: string;
  displayName: string;
  websiteUrl: string;
  bio: string;
  socialLinks: SocialLinks;
}

/** Account settings form values */
export interface AccountSettingsFormValues {
  emailDigest: "immediate" | "daily" | "weekly" | "none";
  notifyOnComment: boolean;
  notifyOnReply: boolean;
  notifyOnMention: boolean;
}
```

---

## Component Inventory

### Layout Components

#### `DashboardLayout`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/DashboardLayout.tsx`
**Purpose:** Shared layout wrapper for all `/dashboard/*` pages. Provides sidebar navigation, page header with user avatar and display name, and content area.

**Props:**
```typescript
interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;                       // Page heading (e.g., "Dashboard", "Edit Profile")
  description?: string;                // Subheading text below title
}
```

**Responsibilities:**
- Render a two-panel layout: left sidebar (navigation) + right content area
- Display the current user's avatar and display name in the sidebar header
- Highlight the active navigation item based on current route
- Responsive: sidebar collapses to a top navigation bar or hamburger menu on mobile
- Add `<meta name="robots" content="noindex">` via TanStack Start's `head` configuration

**UI Structure:**
```
+----------------------------------------------------------+
|  SITE HEADER / MAIN NAV                                   |
+----------------------------------------------------------+
| +----------+ +------------------------------------------+ |
| | SIDEBAR  | | CONTENT AREA                             | |
| |          | |                                          | |
| | [Avatar] | |  Title                                   | |
| | Jane Doe | |  Description                             | |
| |          | |                                          | |
| | Dashboard| |  {children}                              | |
| | Profile  | |                                          | |
| | Comments | |                                          | |
| | Notifs   | |                                          | |
| | Settings | |                                          | |
| |          | |                                          | |
| +----------+ +------------------------------------------+ |
+----------------------------------------------------------+
```

**Base UI Dependencies:** None directly (uses custom navigation items)
**Styling:**
- Sidebar: `bg-card` with `border-r border-border`
- Content area: `bg-background`
- Active nav item: `bg-muted text-foreground font-medium`
- Inactive nav item: `text-muted-foreground hover:bg-muted/50`
- All colors via CSS variables -- NEVER hardcoded

---

#### `DashboardSidebar`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/DashboardSidebar.tsx`
**Purpose:** Sidebar navigation for the dashboard area. Shows user info at top and navigation links.

**Props:**
```typescript
interface DashboardSidebarProps {
  user: UserProfile;
  currentPath: string;
}
```

**Responsibilities:**
- Display user avatar (resolved: custom > Convex Auth > initials) and display name at top
- Render navigation links:
  - Dashboard (`/dashboard`) -- icon: `LayoutDashboard`
  - Profile (`/dashboard/profile`) -- icon: `User`
  - Comments (`/dashboard/comments`) -- icon: `MessageSquare`
  - Notifications (`/dashboard/notifications`) -- icon: `Bell` with unread count badge
  - Settings (`/dashboard/settings`) -- icon: `Settings`
- Highlight active link based on `currentPath`
- Unread notification count badge from `useQuery(api.siteNotifications.unreadCount)`

**Navigation Items:**
```typescript
const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/dashboard/profile", label: "Profile", icon: User },
  { path: "/dashboard/comments", label: "Comments", icon: MessageSquare },
  { path: "/dashboard/notifications", label: "Notifications", icon: Bell, badge: true },
  { path: "/dashboard/settings", label: "Settings", icon: Settings },
];
```

**Styling:**
- Nav links: `flex items-center gap-2 px-3 py-2 text-xs rounded-none`
- Badge: `bg-destructive text-destructive-foreground text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center`

---

### Dashboard Home Components

#### `UserDashboard`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/UserDashboard.tsx`
**Purpose:** Main container for the `/dashboard` home page. Renders the widget grid with personalized content.

**Props:**
```typescript
interface UserDashboardProps {
  user: UserProfile;
  dashboardData: WebsiteDashboardData | undefined;
}
```

**Responsibilities:**
- Display "Welcome back, {displayName}!" heading
- Render a static 2-column widget grid (no drag-and-drop in v1)
- Left column: My Content, My Comments
- Right column: My Notifications, Quick Links
- Content Performance widget below (full-width, Author+ only)
- Show skeleton placeholders while data is loading
- Handle `undefined` state for `dashboardData` (loading)

**UI Layout:**
```
Welcome back, Jane!

+---------------------------+  +---------------------------+
| MY CONTENT                |  | MY NOTIFICATIONS          |
| 5 Published Posts         |  | 3 unread                  |
| 2 Drafts                  |  | Recent:                   |
| Recent:                   |  | - "John replied to..."    |
| - Post Title (Published)  |  | - "Your post was..."      |
| - Another Post (Draft)    |  | [View All Notifications]  |
| [View All Posts]           |  +---------------------------+
+---------------------------+
                               +---------------------------+
+---------------------------+  | QUICK LINKS               |
| MY COMMENTS               |  | - Edit Profile            |
| 12 total                  |  | - Account Settings        |
| Recent:                   |  | - Write a Post            |
| - "Great article..." on...|  | - View Site               |
| [View All Comments]        |  +---------------------------+
+---------------------------+

+-------------------------------------------------------+
| CONTENT PERFORMANCE (Author+ only)                     |
| Top posts by views:                                    |
| 1. "Post Title" - 1,234 views                         |
| 2. "Another Post" - 567 views                         |
+-------------------------------------------------------+
```

---

#### `MyContentWidget`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/widgets/MyContentWidget.tsx`
**Purpose:** Shows the user's own post counts and recent posts.

**Props:**
```typescript
interface MyContentWidgetProps {
  data: WebsiteDashboardData["myPosts"] | undefined;
}
```

**Responsibilities:**
- Display post counts by status (Published, Draft, Pending)
- List 3-5 recent posts with title, status badge, and date
- "View All Posts" link navigates to the user's post listing (if applicable, or to admin)
- Show "No posts yet" empty state for users with no content
- Contributor+ sees "Write a Post" quick action link

**Styling:**
- Count badges: `text-xs px-2 py-0.5` with status-appropriate colors via CSS variables
- Post list: Simple `div` stack with `border-b border-border` separators

---

#### `MyCommentsWidget`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/widgets/MyCommentsWidget.tsx`
**Purpose:** Shows the user's recent comments with status and link to the parent post.

**Props:**
```typescript
interface MyCommentsWidgetProps {
  data: WebsiteDashboardData["myComments"] | undefined;
}
```

**Responsibilities:**
- List 3-5 recent comments with excerpt, parent post title, status, and date
- Each comment links to the post where it was made
- Status indicator: approved (no badge), pending (yellow), spam/trash (red)
- "View All Comments" link navigates to `/dashboard/comments`
- Empty state: "You haven't commented yet"

---

#### `MyNotificationsWidget`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/widgets/MyNotificationsWidget.tsx`
**Purpose:** Shows unread notification count and recent notifications.

**Props:**
```typescript
interface MyNotificationsWidgetProps {
  data: WebsiteDashboardData["unreadNotifications"] | undefined;
}
```

**Responsibilities:**
- Display unread count prominently
- List 3-5 recent notifications with message, type icon, and time
- Click a notification to navigate to its `link` URL
- "View All Notifications" link navigates to `/dashboard/notifications`
- Empty state: "No new notifications"

---

#### `ContentPerformanceWidget`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/widgets/ContentPerformanceWidget.tsx`
**Purpose:** Shows the user's top-performing posts by view count. Author+ only.

**Props:**
```typescript
interface ContentPerformanceWidgetProps {
  data: WebsiteDashboardData["contentPerformance"] | null | undefined;
}
```

**Responsibilities:**
- If `data` is `null`: do not render (user lacks capability)
- If `data` is `undefined`: show loading skeleton
- If `data` is empty array: show "No view data available yet"
- Otherwise: list top 5 posts with title, view count, and bar chart indicator
- Each post title links to the post's public page

**Note:** Content Performance depends on view tracking in the Post System. If view tracking is not yet implemented, this widget renders a "Coming soon" placeholder.

---

#### `QuickLinksWidget`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/widgets/QuickLinksWidget.tsx`
**Purpose:** Action shortcut cards for common dashboard tasks.

**Props:**
```typescript
interface QuickLinksWidgetProps {
  user: UserProfile;
  userCapabilities?: string[];
}
```

**Responsibilities:**
- Render a grid of action cards:
  - "Edit Profile" -> `/dashboard/profile` (icon: `User`, all users)
  - "Account Settings" -> `/dashboard/settings` (icon: `Settings`, all users)
  - "Write a Post" -> `/admin/posts/new` or relevant URL (icon: `PenSquare`, Contributor+ only)
  - "View Site" -> `/` (icon: `ExternalLink`, all users)
- Each card: icon + label, hover effect
- Conditional: "Write a Post" only shown for users with `edit_posts` capability

**Styling:**
- Cards: `border border-border p-4 text-center hover:bg-muted/50 transition-colors`
- Icons: `text-muted-foreground` with `w-5 h-5`

---

### Profile Components

#### `ProfileForm`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/profile/ProfileForm.tsx`
**Purpose:** The main profile editing form for the website dashboard. Simpler than the admin version (no role section, no deactivate/delete buttons).

**Props:**
```typescript
interface ProfileFormProps {
  user: UserProfile;
}
```

**Responsibilities:**
- Avatar section with `AvatarUpload` component
- Read-only Convex Auth fields: email, first name, last name (disabled inputs with explanation text: "Managed by your authentication provider")
- Editable fields:
  - Display Name (dropdown selector via `DisplayNameSelector`)
  - Nickname (text input)
  - Website URL (URL input with validation)
  - Bio (textarea with character counter, max 500)
  - Social Links (via `SocialLinksForm`)
- "Save Profile" button
- Uses TanStack Form + Zod for validation
- On submit: calls `useMutation(api.users.updateProfile)` with changed fields only
- Success: Sonner toast "Profile updated successfully"
- Error: Sonner toast with error message

**Form Validation (Zod):**
```typescript
const profileSchema = z.object({
  nickname: z.string().max(50, "Nickname must be 50 characters or less").optional(),
  displayName: z.string().min(1, "Display name is required"),
  websiteUrl: z.string().url("Please enter a valid URL").or(z.literal("")).optional(),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
  socialLinks: z.object({
    twitter: z.string().optional(),
    facebook: z.string().url("Please enter a valid URL").or(z.literal("")).optional(),
    instagram: z.string().optional(),
    linkedin: z.string().url("Please enter a valid URL").or(z.literal("")).optional(),
    github: z.string().optional(),
    youtube: z.string().url("Please enter a valid URL").or(z.literal("")).optional(),
  }).optional(),
});
```

**Base UI Dependencies:** `@base-ui/react/button` (via Button), `@base-ui/react/input` (via Input), `@base-ui/react/select` (via Select for display name)

---

#### `AvatarUpload`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/profile/AvatarUpload.tsx`
**Purpose:** Avatar display with upload and remove functionality.

**Props:**
```typescript
interface AvatarUploadProps {
  user: UserProfile;
  size?: "sm" | "md" | "lg";         // Default: "lg"
  onUploaded?: () => void;            // Callback after successful upload
}
```

**Responsibilities:**
- Display current avatar using the resolution chain: `avatarUrl` > `authAvatarUrl` > initials
- "Change Photo" button below avatar
- "Remove" button (only shown when custom avatar exists)
- File input (hidden, triggered by "Change Photo" button):
  - Accept: `image/jpeg, image/png, image/webp, image/gif`
  - Max file size: 5MB (validated client-side)
- On file select: open crop dialog (square aspect ratio)
- On crop confirm: upload to Convex Storage, call `uploadAvatar` mutation
- On remove: call `removeAvatar` mutation
- Loading state during upload

**Avatar Size Classes:**
- `sm`: `w-10 h-10`
- `md`: `w-16 h-16`
- `lg`: `w-24 h-24`

**Styling:**
- Avatar container: circular clip with `rounded-full overflow-hidden`
- Initials fallback: `bg-muted text-muted-foreground font-medium` with appropriate text size
- Buttons: placed below the avatar, centered

---

#### `AvatarDisplay`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/profile/AvatarDisplay.tsx`
**Purpose:** Read-only avatar display component used throughout the dashboard (sidebar, widgets, etc.).

**Props:**
```typescript
interface AvatarDisplayProps {
  avatarUrl: string | null;
  authAvatarUrl: string | null;
  displayName: string;
  size?: "xs" | "sm" | "md" | "lg";  // Default: "md"
  className?: string;
}
```

**Responsibilities:**
- Resolve avatar: `avatarUrl ?? authAvatarUrl ?? null`
- If URL exists: render `<img>` with `object-cover`
- If no URL: render initials from `displayName` (1-2 characters)
- Apply size-appropriate dimensions

**Size Classes:**
- `xs`: `w-6 h-6 text-[10px]`
- `sm`: `w-8 h-8 text-xs`
- `md`: `w-10 h-10 text-sm`
- `lg`: `w-24 h-24 text-xl`

---

#### `DisplayNameSelector`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/profile/DisplayNameSelector.tsx`
**Purpose:** WordPress-style dropdown for selecting how the display name is composed from name components.

**Props:**
```typescript
interface DisplayNameSelectorProps {
  user: UserProfile;
  value: string;
  onChange: (value: string) => void;
}
```

**Responsibilities:**
- Generate display name options from available name parts:
  - Email username (always included as fallback)
  - First name (if available)
  - Last name (if available)
  - "First Last" (if both available)
  - "Last, First" (if both available)
  - Nickname (if available and different from above)
- Deduplicate options using a `Set`
- Render as a `<select>` dropdown (using Base UI Select component)
- Current value should match one of the generated options
- Label: "Display name publicly as"

---

#### `SocialLinksForm`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/profile/SocialLinksForm.tsx`
**Purpose:** Form section for editing social media links.

**Props:**
```typescript
interface SocialLinksFormProps {
  value: SocialLinks;
  onChange: (links: SocialLinks) => void;
  errors?: Record<string, string>;
}
```

**Responsibilities:**
- Render labeled inputs for each social platform:
  - Twitter/X (icon: custom X logo or Lucide `Twitter`)
  - Facebook (icon: `Facebook`)
  - Instagram (icon: `Instagram`)
  - LinkedIn (icon: `Linkedin`)
  - GitHub (icon: `Github`)
  - YouTube (icon: `Youtube`)
- Each input has a placeholder: "https://twitter.com/username" or "@username"
- Accept both full URLs and handles/usernames (store as-is)
- Show validation errors per field

**Styling:**
- Each input prefixed with the platform icon
- Stacked vertically with consistent spacing
- Icon: `text-muted-foreground w-4 h-4`

---

#### `BioEditor`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/profile/BioEditor.tsx`
**Purpose:** Textarea with character counter for the bio field.

**Props:**
```typescript
interface BioEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;                  // Default: 500
  error?: string;
}
```

**Responsibilities:**
- Render a `<textarea>` with 4-5 rows
- Display character count: `{current}/{max}` below the textarea
- Character count color: `text-muted-foreground` when under limit, `text-destructive` when at or over limit
- Prevent input beyond maxLength (or just show error)
- Label: "Biographical Info"
- Helper text: "Share a little biographical information. This may be shown publicly."

---

### Account Settings Components

#### `AccountSettingsForm`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/settings/AccountSettingsForm.tsx`
**Purpose:** Main form for the Account Settings page. Includes email display, password change, notification preferences, and danger zone.

**Props:**
```typescript
interface AccountSettingsFormProps {
  user: UserProfile;
}
```

**Responsibilities:**
- **Email Section:** Read-only email display with "Managed by your authentication provider" note
- **Password Section:** "Change Password" button that initiates the Convex Auth password change flow. Shows `lastPasswordChangedAt` if available ("Last changed: {date}")
- **Notification Preferences Section:** Toggle switches for:
  - Email digest frequency (select: Immediate, Daily, Weekly, None)
  - Notify on comment on your post (toggle)
  - Notify on reply to your comment (toggle)
  - Notify on mention (toggle)
- **Danger Zone Section:** "Delete Account" button (destructive, red outline)
- Save button for notification preferences
- Uses TanStack Form + Zod for notification preferences

---

#### `PasswordChangeSection`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/settings/PasswordChangeSection.tsx`
**Purpose:** Password management section within Account Settings. Links to the auth system password change flow.

**Props:**
```typescript
interface PasswordChangeSectionProps {
  user: UserProfile;
}
```

**Responsibilities:**
- Display section heading: "Password"
- Show "Last changed: {relative time}" if `lastPasswordChangedAt` is available
- "Change Password" button that either:
  - Opens the Convex Auth-hosted password change page (current implementation)
  - Or triggers a custom headless password change flow (future)
- For OAuth-only users (no password set): show "Add Password" instead of "Change Password"
- Explanation text: "Your password is managed securely by our authentication provider."

---

#### `NotificationPreferencesForm`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/settings/NotificationPreferencesForm.tsx`
**Purpose:** Toggles for email notification preferences.

**Props:**
```typescript
interface NotificationPreferencesFormProps {
  preferences: UserPreferences | null;
  onSave: (prefs: Partial<UserPreferences>) => void;
}
```

**Responsibilities:**
- Email digest frequency selector (Select component):
  - "Immediate" -- send emails as they happen
  - "Daily digest" -- batch into daily email
  - "Weekly digest" -- batch into weekly email
  - "None" -- no email notifications
- Toggle switches for specific notifications:
  - "Someone comments on your post" (`notifyOnComment`)
  - "Someone replies to your comment" (`notifyOnReply`)
  - "Someone mentions you" (`notifyOnMention`)
- Each toggle: label + description + switch
- "Save Preferences" button
- Success toast on save

**Base UI Dependencies:** `@base-ui/react/switch` (via Switch component), `@base-ui/react/select` (via Select)

---

#### `DeleteAccountDialog`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/settings/DeleteAccountDialog.tsx`
**Purpose:** Confirmation dialog for self-service account deletion. The ONLY acceptable popup in the dashboard (destructive action exception).

**Props:**
```typescript
interface DeleteAccountDialogProps {
  user: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Responsibilities:**
- Display warning: "This action is permanent and cannot be undone."
- Explain content disposition: "Your published content will be reassigned to the site administrator. Your draft content will be deleted."
- Require typing email to confirm (must match `user.email` exactly)
- "Delete My Account" button (destructive styling, disabled until email matches)
- "Cancel" button
- On confirm:
  1. Call `useMutation(api.users.deleteUser)` with `contentAction: "reassign"`
  2. On success: sign out via `signOut()` from the auth system, redirect to `/`
  3. On error: show error toast, keep dialog open
- Loading state on the confirm button during mutation

**Styling:**
- Dialog overlay: `bg-black/50`
- Dialog content: `bg-card border border-border p-6 max-w-md`
- Warning icon: Lucide `AlertTriangle` in `text-destructive`
- Confirm button: `bg-destructive text-destructive-foreground`
- Input border turns `border-destructive` when email does not match

---

### My Comments Page Components

#### `MyCommentsList`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/comments/MyCommentsList.tsx`
**Purpose:** Full list of the user's own comments with filtering and actions.

**Props:**
```typescript
interface MyCommentsListProps {
  userId: string;
}
```

**Responsibilities:**
- Subscribe to user's comments via `useQuery(api.comments.listByUser, { userId })`
- Display comments in a list with:
  - Comment excerpt (truncated to ~100 chars)
  - "On: {Post Title}" link to the post
  - Status badge (approved, pending, spam)
  - Date (relative time)
  - Actions: "View" (link to comment on post), "Edit" (inline or navigate, within grace period), "Delete" (confirmation)
- Filter tabs: All, Approved, Pending
- Empty state: "You haven't made any comments yet."
- Pagination or "Load more" for users with many comments

**Comment Row UI:**
```
+-------------------------------------------------------+
| "Great article about React..."                         |
| On: Getting Started with TanStack  |  Approved  |  2h  |
| [View] [Edit] [Delete]                                 |
+-------------------------------------------------------+
```

**Edit Behavior:**
- "Edit" button only shown for comments within the 5-minute grace period
- Edit opens inline textarea (not a new page, not a popup -- inline edit within the list row)
- On save: calls `useMutation(api.comments.edit, { commentId, content })`
- After grace period: "Edit" button disappears

**Delete Behavior:**
- "Delete" shows a small inline confirmation: "Are you sure? [Yes] [No]"
- On confirm: calls `useMutation(api.comments.trash, { commentId })`
- Toast: "Comment deleted"

---

### My Notifications Page Components

#### `NotificationCenter`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/notifications/NotificationCenter.tsx`
**Purpose:** Full notification management page with feed, mark-as-read, and preferences.

**Props:**
```typescript
interface NotificationCenterProps {
  userId: string;
}
```

**Responsibilities:**
- Subscribe to notifications via `useQuery(api.siteNotifications.list, { userId })`
- Header with "Mark All Read" button
- Notification list:
  - Each notification: type icon (colored by type), message, relative time, read/unread indicator
  - Click notification: mark as read + navigate to `link` URL (if present)
  - Unread notifications have a left border accent or bold text
- Filter tabs: All, Unread
- Empty state: "No notifications"
- Pagination or infinite scroll for long histories

**Notification Row UI:**
```
+-------------------------------------------------------+
| [i]  John Doe replied to your comment on "Post Title" |
|      2 hours ago                                [mark] |
+-------------------------------------------------------+
```

**Notification Type Icons (Lucide):**
- `info`: `Info` icon, `text-primary`
- `success`: `CheckCircle` icon, `text-primary` (or define a success CSS variable)
- `warning`: `AlertTriangle` icon, styled with `text-foreground` at reduced opacity
- `error`: `XCircle` icon, `text-destructive`

---

#### `NotificationPreferencesSection`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/notifications/NotificationPreferencesSection.tsx`
**Purpose:** Per-category notification preference toggles displayed at the bottom of the notifications page.

**Props:**
```typescript
interface NotificationPreferencesSectionProps {
  userId: string;
}
```

**Responsibilities:**
- Collapsible section: "Notification Preferences" with expand/collapse toggle
- List of notification categories with toggle switches:
  - Site Delivery (in-bell notifications): on/off per category
  - Toast Delivery (popup toasts): on/off per category
- Categories determined by the notification keys defined in the Site Notification System
- Save changes automatically on toggle (optimistic update + mutation)

---

### Utility Components

#### `DashboardCard`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/DashboardCard.tsx`
**Purpose:** Reusable card wrapper for dashboard widgets and form sections.

**Props:**
```typescript
interface DashboardCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;           // Optional action button in card header
  children: React.ReactNode;
  className?: string;
}
```

**Styling:** Uses existing `<Card>` component pattern from the UI library with `bg-card border border-border`.

---

#### `EmptyState`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/EmptyState.tsx`
**Purpose:** Consistent empty state component for widgets and lists with no data.

**Props:**
```typescript
interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;  // Lucide icon
  title: string;
  description?: string;
  action?: {
    label: string;
    href: string;
  };
}
```

**Styling:**
- Centered layout: `text-center py-8`
- Icon: `text-muted-foreground w-10 h-10 mx-auto mb-3`
- Title: `text-sm font-medium text-foreground`
- Description: `text-xs text-muted-foreground mt-1`
- Action link: `text-primary text-xs hover:underline mt-3`

---

#### `StatusBadge`

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/StatusBadge.tsx`
**Purpose:** Small badge component for showing content/comment status.

**Props:**
```typescript
interface StatusBadgeProps {
  status: string;
  variant?: "default" | "outline";
}
```

**Status Color Mapping (CSS variables only):**
- `published` / `approved`: `bg-primary/10 text-primary`
- `draft`: `bg-muted text-muted-foreground`
- `pending`: `bg-primary/20 text-primary` (or use a warning-style approach)
- `spam` / `trash`: `bg-destructive/10 text-destructive`

**Styling:** `text-[10px] px-1.5 py-0.5 rounded-none font-medium`

---

## Hooks

### `useCurrentUser`

**File:** `ConvexPress-Website/apps/web/src/hooks/useCurrentUser.ts`

```typescript
interface UseCurrentUserResult {
  user: UserProfile | null | undefined;  // undefined = loading, null = not found
  isLoading: boolean;
}

function useCurrentUser(): UseCurrentUserResult
```

**Behavior:**
- Calls `useQuery(api.users.getCurrentUser)`
- Returns loading state and user data
- If Convex returns `undefined`, the query is still loading
- If Convex returns `null`, the user has no profile record (webhook race condition)

---

### `useAvatarUrl`

**File:** `ConvexPress-Website/apps/web/src/hooks/useAvatarUrl.ts`

```typescript
function useAvatarUrl(user: UserProfile | null): string | null
```

**Behavior:**
- Resolves avatar following the priority chain: `avatarUrl` > `authAvatarUrl` > `null`
- Returns `null` when no avatar is available (caller should render initials)
- Pure computation, memoized with `useMemo`

---

### `useDisplayNameOptions`

**File:** `ConvexPress-Website/apps/web/src/hooks/useDisplayNameOptions.ts`

```typescript
function useDisplayNameOptions(user: UserProfile): DisplayNameOption[]
```

**Behavior:**
- Generates display name options from user's name parts (mirrors WordPress):
  1. Email username (portion before @)
  2. First name (if available)
  3. Last name (if available)
  4. "First Last" (if both available)
  5. "Last, First" (if both available)
  6. Nickname (if available and different from above)
- Deduplicates via `Set`
- Returns array of `{ label, value }` objects

---

### `useUserComments`

**File:** `ConvexPress-Website/apps/web/src/hooks/useUserComments.ts`

```typescript
interface UseUserCommentsResult {
  comments: UserComment[] | undefined;
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

function useUserComments(filter?: "all" | "approved" | "pending"): UseUserCommentsResult
```

**Behavior:**
- Calls `useQuery(api.comments.listByUser, { filter })` (or equivalent Comment System query)
- Provides pagination state and load-more function
- Reactive: new comments appear in real-time

---

### `useNotifications`

**File:** `ConvexPress-Website/apps/web/src/hooks/useNotifications.ts`

```typescript
interface UseNotificationsResult {
  notifications: NotificationItem[] | undefined;
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  hasMore: boolean;
  loadMore: () => void;
}

function useNotifications(filter?: "all" | "unread"): UseNotificationsResult
```

**Behavior:**
- Subscribes to `useQuery(api.siteNotifications.list, { filter })`
- Subscribes to `useQuery(api.siteNotifications.unreadCount)` for badge
- Provides `markAsRead` and `markAllAsRead` mutation wrappers
- Reactive: new notifications appear instantly, read status syncs across tabs

---

### `useProfileForm`

**File:** `ConvexPress-Website/apps/web/src/hooks/useProfileForm.ts`

```typescript
interface UseProfileFormResult {
  form: ReturnType<typeof useForm<ProfileFormValues>>;
  isSubmitting: boolean;
  handleSubmit: () => Promise<void>;
}

function useProfileForm(user: UserProfile): UseProfileFormResult
```

**Behavior:**
- Initializes TanStack Form with current user data
- Zod validation via `profileSchema`
- On submit: compares with original values, only sends changed fields
- Calls `useMutation(api.users.updateProfile)` with delta
- Success: Sonner toast "Profile updated successfully"
- Error: Sonner toast with error message
- Prevents re-submission while in progress

---

## Routes

### `/dashboard` - Dashboard Home

**File:** `ConvexPress-Website/apps/web/src/routes/dashboard/index.tsx`
**Auth:** Required (redirects unauthenticated users)
**SSR:** Yes -- loader calls `getAuth()` for server-side redirect
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: "/dashboard" } });
  }
  return {};
}
```

**Component Structure:**
```
<DashboardLayout title="Dashboard" description="Your personal overview.">
  <UserDashboard user={currentUser} dashboardData={dashboardData} />
</DashboardLayout>
```

---

### `/dashboard/profile` - Edit Profile

**File:** `ConvexPress-Website/apps/web/src/routes/dashboard/profile.tsx`
**Auth:** Required
**SSR:** Yes
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: "/dashboard/profile" } });
  }
  return {};
}
```

**Component Structure:**
```
<DashboardLayout title="Edit Profile" description="Update your public profile information.">
  <ProfileForm user={currentUser} />
</DashboardLayout>
```

---

### `/dashboard/settings` - Account Settings

**File:** `ConvexPress-Website/apps/web/src/routes/dashboard/settings.tsx`
**Auth:** Required
**SSR:** Yes
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: "/dashboard/settings" } });
  }
  return {};
}
```

**Component Structure:**
```
<DashboardLayout title="Account Settings" description="Manage your account preferences.">
  <AccountSettingsForm user={currentUser} />
</DashboardLayout>
```

---

### `/dashboard/comments` - My Comments

**File:** `ConvexPress-Website/apps/web/src/routes/dashboard/comments.tsx`
**Auth:** Required
**SSR:** Yes
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: "/dashboard/comments" } });
  }
  return {};
}
```

**Component Structure:**
```
<DashboardLayout title="My Comments" description="View and manage your comments.">
  <MyCommentsList userId={currentUser._id} />
</DashboardLayout>
```

---

### `/dashboard/notifications` - My Notifications

**File:** `ConvexPress-Website/apps/web/src/routes/dashboard/notifications.tsx`
**Auth:** Required
**SSR:** Yes
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: "/dashboard/notifications" } });
  }
  return {};
}
```

**Component Structure:**
```
<DashboardLayout title="Notifications" description="Your notification history and preferences.">
  <NotificationCenter userId={currentUser._id} />
  <NotificationPreferencesSection userId={currentUser._id} />
</DashboardLayout>
```

---

## Backend Integration

### Convex Queries Used (Read-Only -- Defined in Admin Backend)

| Query | Used By | Purpose |
|-------|---------|---------|
| `api.users.getCurrentUser` | All dashboard pages, DashboardSidebar, ProfileForm | Get current user profile |
| `api.dashboard.getWebsiteDashboard` | UserDashboard, widget components | Personal dashboard data (my posts, comments, notifications, performance) |
| `api.dashboard.getWidgetPreferences` | UserDashboard (website surface) | Widget layout preferences |
| `api.comments.listByUser` | MyCommentsList | User's own comments with filtering |
| `api.siteNotifications.list` | NotificationCenter | User's notification feed with filtering |
| `api.siteNotifications.unreadCount` | DashboardSidebar (badge), MyNotificationsWidget | Unread notification count |
| `api.settings.get` | DashboardLayout (site name for header) | Site settings |

### Convex Mutations Used (Defined in Admin Backend)

| Mutation | Used By | Purpose |
|----------|---------|---------|
| `api.users.updateProfile` | ProfileForm | Update user's editable profile fields |
| `api.users.uploadAvatar` | AvatarUpload | Upload custom avatar after crop |
| `api.users.removeAvatar` | AvatarUpload | Remove custom avatar (falls back to the auth system) |
| `api.users.deleteUser` | DeleteAccountDialog | Self-service account deletion |
| `api.comments.edit` | MyCommentsList (inline edit) | Edit own comment within grace period |
| `api.comments.trash` | MyCommentsList (delete) | Soft-delete own comment |
| `api.siteNotifications.markAsRead` | NotificationCenter | Mark single notification as read |
| `api.siteNotifications.markAllAsRead` | NotificationCenter | Mark all notifications as read |
| `api.dashboard.saveWidgetPreferences` | UserDashboard (website surface) | Save widget preferences |

### Server Actions (TanStack Start)

| Action | Used By | Purpose |
|--------|---------|---------|
| None currently | -- | Dashboard pages primarily use Convex client queries/mutations. Server actions may be added for sensitive operations like account deletion verification. |

### Convex Auth APIs Used

| API | Used By | Import From |
|-----|---------|-------------|
| `getAuth()` | SSR loaders for all dashboard routes | `@auth/authkit-tanstack-react-start` |
| `useAuth()` | DashboardLayout (sign-out), DeleteAccountDialog (sign-out after deletion) | `@auth/authkit-tanstack-react-start/client` |

---

## Accessibility

### Form Labels and Inputs

- Every `<Input>` and `<textarea>` MUST have an associated `<Label>` with matching `htmlFor`/`id` attributes
- Use `aria-describedby` to link inputs to their helper text and error messages
- Use `aria-invalid="true"` on inputs with validation errors
- Select dropdowns (Display Name Selector, Email Digest) must have proper `aria-label` or associated label
- Toggle switches must have `aria-label` describing what they control

### Error Announcements

- Form-level errors should be wrapped in `role="alert"` for screen reader announcement
- Field-level errors should use `aria-live="polite"` or `aria-describedby` linkage
- Toast notifications (Sonner) include `role="status"` automatically

### Focus Management

- On page load: focus the page heading or first interactive element
- On profile form save error: focus the first field with an error
- On delete account dialog open: focus the dialog heading (trap focus within dialog)
- On delete account dialog close: return focus to the "Delete Account" button
- After marking all notifications as read: announce "All notifications marked as read" via `aria-live`

### Keyboard Navigation

- All forms must be fully navigable via Tab/Shift+Tab
- Enter key submits forms
- Escape key closes the delete account dialog
- Toggle switches are activatable via Space
- Sidebar navigation links are standard `<a>` or `<Link>` elements
- Notification items are clickable and keyboard-activatable

### Color Contrast

- All text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)
- Status badges must be readable with sufficient contrast against their background
- Notification type colors must be distinguishable without color alone (icons always accompany colors)
- Unread notification indicator must be perceivable (bold text + accent border, not just color)

---

## Known Gaps & Decisions

### 1. Dashboard Widget Layout (Static vs Drag-and-Drop)

**Gap:** The admin dashboard supports drag-and-drop widget reordering. Should the website dashboard?

**Decision:** v1 uses a **static 2-column grid** for the website dashboard. No drag-and-drop. The `dashboardPreferences` table supports persisted widget order for the `"website"` surface, so drag-and-drop can be added later without schema changes.

**Recommendation:** Keep widget order fixed in v1. Revisit drag-and-drop for the website dashboard in a future release.

### 2. Content Performance Widget Dependency on View Tracking

**Gap:** The Content Performance widget depends on a view count field in the Post System that may not yet be implemented.

**Decision:** If `contentPerformance` data is `null` from the `getWebsiteDashboard` query, the widget renders a "Coming soon" placeholder with explanation text: "Post view tracking will be available in a future update."

**Recommendation:** Implement the Content Performance widget shell now with graceful fallback. It will automatically populate when view tracking is added to the Post System.

### 3. Notification Real-Time Updates (Convex Subscriptions vs Polling)

**Gap:** Should notifications use Convex reactive subscriptions or polling?

**Decision:** **Convex subscriptions** (the standard approach). The `useQuery(api.siteNotifications.list)` and `useQuery(api.siteNotifications.unreadCount)` hooks are inherently reactive. No polling needed. This is a core Convex advantage.

### 4. Delete Account Flow (Immediate vs Admin Approval)

**Gap:** Should account deletion be immediate or require admin approval?

**Decision:** **Immediate** for v1. When a user confirms deletion by typing their email, the account is deleted immediately:
- Content is reassigned to a site administrator
- Convex user record is deleted
- Convex Auth user is deleted asynchronously
- User is signed out and redirected to homepage

**Future consideration:** An "admin approval" mode could be added as a Settings option where the user's account is flagged for deletion and an admin must approve it. Not needed for v1.

### 5. Social Links Extensibility

**Gap:** The social links are a fixed set (Twitter, Facebook, Instagram, LinkedIn, GitHub, YouTube). What about custom links?

**Decision:** v1 uses the fixed predefined set. The `socialLinks` object in the schema has a fixed shape. Adding new platforms requires a schema migration.

**Future consideration:** A flexible array-of-objects pattern (`socialLinks: v.array(v.object({ platform: v.string(), url: v.string() }))`) would allow custom links. This is a schema change and should be planned as a feature enhancement.

### 6. Profile Cover/Banner Image

**Gap:** Should the profile page support a cover/banner image (like Twitter/LinkedIn profiles)?

**Decision:** Not in v1. The profile focuses on avatar, name, bio, and social links. A cover image feature could be added later via the Custom Field System or as a dedicated schema field.

### 7. My Posts Page (Should Users See/Manage Posts from Dashboard?)

**Gap:** Should there be a `/dashboard/posts` page where users can see and manage their own posts?

**Decision:** v1 does not include a dedicated My Posts page in the website dashboard. The My Content widget on the dashboard home shows recent posts with counts. For full post management, users go to the admin app. If a user's role does not grant admin access (Subscriber), they do not see the My Content widget.

**Future consideration:** A `/dashboard/posts` page could show the user's own posts with edit/delete actions. This would be useful for Author+ users who prefer the website interface over the admin.

### 8. Activity Log for Own Actions

**Gap:** Should users be able to see their own activity log (login history, profile changes)?

**Decision:** Not in v1. The Audit Log System records these events, but the audit log is currently admin-only. A user-facing "Activity" section could be added to Account Settings in a future release.

### 9. Password Management System Integration

**Important:** The Password Management System expert doc details the Convex Auth-managed password flow. For the Account Settings page:
- The "Change Password" action redirects to the auth system or uses the Convex Auth component
- ConvexPress never handles raw passwords
- Password change events are detected via Convex Auth `user.updated` webhook
- The `lastPasswordChangedAt` field on the user record is updated by the webhook handler

### 10. Dashboard Sidebar vs Header Navigation

**Gap:** Should dashboard navigation be a left sidebar or integrated into the site header?

**Decision:** **Left sidebar** for desktop, **collapsible menu** (hamburger) for mobile. The sidebar provides a clear separation between the main site navigation (header) and the dashboard-specific navigation. This mirrors the admin app's sidebar pattern.

---

## Implementation Checklist

### Phase 1: Layout & Navigation (Foundation)

**Components:**
- [ ] `src/components/dashboard/DashboardLayout.tsx` -- Shared layout with sidebar + content area
- [ ] `src/components/dashboard/DashboardSidebar.tsx` -- Sidebar navigation with user info and nav links
- [ ] `src/components/dashboard/DashboardCard.tsx` -- Reusable card wrapper for widgets and sections
- [ ] `src/components/dashboard/EmptyState.tsx` -- Consistent empty state component
- [ ] `src/components/dashboard/StatusBadge.tsx` -- Status badge component
- [ ] `src/components/dashboard/profile/AvatarDisplay.tsx` -- Read-only avatar display

**Routes:**
- [ ] `src/routes/dashboard/index.tsx` -- Dashboard home route with auth loader
- [ ] `src/routes/dashboard/profile.tsx` -- Edit Profile route
- [ ] `src/routes/dashboard/settings.tsx` -- Account Settings route
- [ ] `src/routes/dashboard/comments.tsx` -- My Comments route
- [ ] `src/routes/dashboard/notifications.tsx` -- My Notifications route

**Hooks:**
- [ ] `src/hooks/useCurrentUser.ts` -- Current user query wrapper
- [ ] `src/hooks/useAvatarUrl.ts` -- Avatar resolution hook

**Types:**
- [ ] `src/lib/dashboard/types.ts` -- TypeScript types for dashboard data

### Phase 2: Dashboard Home (Widgets)

**Components:**
- [ ] `src/components/dashboard/UserDashboard.tsx` -- Main dashboard container with widget grid
- [ ] `src/components/dashboard/widgets/MyContentWidget.tsx` -- My posts summary
- [ ] `src/components/dashboard/widgets/MyCommentsWidget.tsx` -- My recent comments
- [ ] `src/components/dashboard/widgets/MyNotificationsWidget.tsx` -- Notification summary
- [ ] `src/components/dashboard/widgets/ContentPerformanceWidget.tsx` -- Top posts by views (Author+)
- [ ] `src/components/dashboard/widgets/QuickLinksWidget.tsx` -- Action shortcut cards

### Phase 3: Edit Profile

**Components:**
- [ ] `src/components/dashboard/profile/ProfileForm.tsx` -- Full profile edit form
- [ ] `src/components/dashboard/profile/AvatarUpload.tsx` -- Avatar upload with crop
- [ ] `src/components/dashboard/profile/DisplayNameSelector.tsx` -- WordPress-style display name dropdown
- [ ] `src/components/dashboard/profile/SocialLinksForm.tsx` -- Social links inputs
- [ ] `src/components/dashboard/profile/BioEditor.tsx` -- Bio textarea with char counter

**Hooks:**
- [ ] `src/hooks/useDisplayNameOptions.ts` -- Generate display name options
- [ ] `src/hooks/useProfileForm.ts` -- Profile form state + submission

### Phase 4: Account Settings

**Components:**
- [ ] `src/components/dashboard/settings/AccountSettingsForm.tsx` -- Main settings form
- [ ] `src/components/dashboard/settings/PasswordChangeSection.tsx` -- Password management section
- [ ] `src/components/dashboard/settings/NotificationPreferencesForm.tsx` -- Notification toggles
- [ ] `src/components/dashboard/settings/DeleteAccountDialog.tsx` -- Delete account confirmation

### Phase 5: My Comments & My Notifications

**Components:**
- [ ] `src/components/dashboard/comments/MyCommentsList.tsx` -- Full comments list with actions
- [ ] `src/components/dashboard/notifications/NotificationCenter.tsx` -- Full notification feed
- [ ] `src/components/dashboard/notifications/NotificationPreferencesSection.tsx` -- Per-category toggles

**Hooks:**
- [ ] `src/hooks/useUserComments.ts` -- User's comments query with filtering
- [ ] `src/hooks/useNotifications.ts` -- Notifications query with read/unread management

---

## Edge Cases & Gotchas

1. **auth webhook race condition:** A newly authenticated user may not have a Convex user record yet (webhook has not fired). The dashboard should handle `getCurrentUser` returning `null` with a loading/retry state rather than showing an error. Display a "Setting up your account..." message and poll briefly.

2. **Avatar upload file size:** Client-side validation must reject files over 5MB before attempting upload. Show a clear error: "Image must be less than 5MB." Also validate file type client-side (JPEG, PNG, WebP, GIF only).

3. **Avatar crop dialog and mobile:** The crop dialog must work on mobile devices with touch gestures. Consider using a well-tested crop library (e.g., `react-image-crop` or `react-easy-crop`). Test on iOS Safari and Android Chrome.

4. **Display name options with no name data:** If a user has no firstName, no lastName, and no nickname (only email), the display name selector should show only the email username as an option. The dropdown should still render, but with a single option.

5. **Bio character count and Unicode:** Multi-byte Unicode characters (emoji, CJK) count as 1 character each for the 500-char limit. The character counter should use `string.length` (JavaScript's default), which counts code units. This matches WordPress behavior.

6. **Social links store as-is:** The system stores whatever the user enters -- full URLs, bare usernames, handles with @. No normalization is applied on save. Display-side formatting (adding https:// prefix, stripping @) should happen in the rendering component, not in the stored data.

7. **Delete account during active session:** After the `deleteUser` mutation succeeds, the auth session is still technically valid until it expires or is revoked. The client MUST call `signOut()` from Convex Auth immediately after deletion to clear the session cookie. Redirect to homepage only after signout completes.

8. **Notification mark-as-read on navigation:** When a user clicks a notification that has a `link` URL, the system should mark it as read AND navigate to the URL. These must happen in sequence: mark-as-read mutation first, then navigate. Use `await` on the mutation before calling `router.navigate()`.

9. **Comment edit grace period:** The 5-minute edit window is calculated from `comment.createdAt`. The "Edit" button should disappear when the grace period expires. If the user has the edit form open and the grace period expires, the save should fail gracefully with a toast: "Edit window has expired."

10. **Optimistic updates for notification read state:** When the user clicks "Mark as Read" or "Mark All Read," update the UI immediately (optimistic) and fire the mutation in the background. If the mutation fails, revert the UI and show an error toast.

11. **Dashboard layout on small screens:** The 2-column widget grid should collapse to a single column on screens below `md` breakpoint (768px). The sidebar should collapse to a top bar or hamburger menu. All content must be accessible on mobile.

12. **Concurrent profile edits across tabs:** If a user has the profile form open in two tabs, the Convex subscription ensures both tabs see the same data. However, submitting from one tab does not reset the form in the other tab. The second tab may have stale form state. This is acceptable for v1 -- the user will see the updated data in the form fields on next load.

13. **Delete account content reassignment target:** The `deleteUser` mutation requires a `reassignToUserId`. For self-service deletion, the client should query for the primary administrator user to use as the reassignment target. If no administrator is found (should never happen), show an error and prevent deletion.

14. **Loading skeletons must match widget dimensions:** Each dashboard widget should have a skeleton loader that closely matches the widget's rendered height. This prevents layout shift when data loads. Use fixed-height placeholders with `animate-pulse bg-muted` patterns.

15. **Subscriber role has limited dashboard:** Subscribers (Level 20) see the dashboard but with limited widgets: My Comments, My Notifications, Quick Links (Edit Profile and Account Settings only). They do not see My Content, Content Performance, or "Write a Post" quick link. The backend query handles this by returning `null` for capability-gated data.

---

## Dependencies

### Depends On

| System | Type | Details |
|--------|------|---------|
| **Dashboard System** | Hard | `getWebsiteDashboard` query provides all dashboard widget data (My Content, My Comments, My Notifications, Content Performance). `getWidgetPreferences` provides layout preferences for the website surface. `saveWidgetPreferences` persists layout changes. Dashboard home page cannot function without this system. |
| **User Profile System** | Hard | `getCurrentUser` query for user profile data on all pages. `updateProfile` mutation for profile editing. `uploadAvatar`/`removeAvatar` for avatar management. `deleteUser` for account deletion. Every dashboard page depends on user profile data. |
| **Password Management System** | Hard | Password change section in Account Settings links to the auth system password change. `lastPasswordChangedAt` field displayed on settings page. Password change behavior is entirely Convex Auth-managed but surfaced in the UI. |
| **Comment System** | Hard | `listByUser` query for My Comments page. `edit` and `trash` mutations for comment actions. My Comments widget and page depend on this system. |
| **Site Notification System** | Hard | `list` query for notification feed. `unreadCount` query for badge in sidebar and widget. `markAsRead`/`markAllAsRead` mutations. Notification center page and sidebar badge depend on this system. |
| **Post System** | Medium | My Content widget shows user's post data. Content Performance widget shows post view counts. Dashboard is partially degraded without this (widget shows empty state). |
| **Media System** | Soft | Avatar upload uses Convex Storage (managed by Media System infrastructure). `generateUploadUrl()` for file upload. Dashboard functions without this but avatar upload fails. |
| **Auth System** | Soft | auth session management underpins all dashboard pages. `getAuth()` in SSR loaders. `useAuth()` for sign-out after account deletion. Dashboard redirects to login without auth. |

### Depended On By

| System | Type | Details |
|--------|------|---------|
| None | -- | This is a **leaf consumer**. No other systems depend on the Website Dashboard UI. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex Auth** | Auth provider -- `getAuth()` for SSR loaders, `useAuth()` for client state and sign-out |
| **@auth/authkit-tanstack-react-start** | TanStack Start integration for Convex Auth (SSR loaders + client hooks) |
| **@base-ui/react** | UI primitives (Button, Input, Select, Switch, Dialog) used in dashboard forms |
| **TanStack Form** | Form state management with Zod validation for profile and settings forms |
| **Zod** | Schema validation for form inputs |
| **Convex** | Reactive queries and mutations for all dashboard data |
| **Lucide React** | Icons (LayoutDashboard, User, MessageSquare, Bell, Settings, PenSquare, ExternalLink, AlertTriangle, Info, CheckCircle, XCircle, etc.) |
| **Sonner** | Toast notifications (profile saved, avatar updated, comment deleted, errors) |
| **React Image Crop** (or similar) | Avatar crop dialog for square aspect ratio enforcement |

---

## Existing Code Reference

### Currently Implemented Files

| File | Status | Notes |
|------|--------|-------|
| `ConvexPress-Website/apps/web/src/routes/__root.tsx` | Complete | `AuthKitProvider` + `ConvexProvider` wrapping -- do not modify. |
| `ConvexPress-Website/apps/web/src/components/header.tsx` | Complete | Sign-in/sign-out buttons using `useAuth()` -- reference for auth state usage. |
| `ConvexPress-Website/apps/web/src/routes/api/auth/callback.tsx` | Complete | `handleCallbackRoute()` -- fully functional, do not modify. |

### UI Component Patterns (Match These)

All dashboard components should follow the patterns established in the existing UI components:

- **Button:** Uses `@base-ui/react/button` via `ButtonPrimitive`. Uses `cva` for variants. File: `src/components/ui/button.tsx`
- **Input:** Uses `@base-ui/react/input` via `InputPrimitive`. File: `src/components/ui/input.tsx`
- **Card:** Uses standard `div` elements with `data-slot` attributes. File: `src/components/ui/card.tsx`
- **Select:** Uses `@base-ui/react/select`. File: `src/components/ui/select.tsx`
- **Switch:** Uses `@base-ui/react/switch`. File: `src/components/ui/switch.tsx`
- **Dialog:** Uses `@base-ui/react/dialog` (for DeleteAccountDialog only). File: `src/components/ui/dialog.tsx`
- **All colors via CSS variables** -- `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`, `text-destructive`, `bg-primary`, `text-primary-foreground`, etc.
- **No rounded corners** -- `rounded-none` is the default across all components
- **Text size** -- Default is `text-xs` for body, `text-sm` for headings within cards
- **Utility function:** `cn()` from `@/lib/utils` for class merging (uses `clsx` + `tailwind-merge`)

### Package Dependencies (Already Installed)

These packages are already available in `ConvexPress-Website/apps/web/package.json`:
- `@base-ui/react` -- UI primitives
- `@auth/authkit-tanstack-react-start` -- Auth integration
- `@tanstack/react-form` -- Form management
- `class-variance-authority` -- Component variants
- `clsx` + `tailwind-merge` -- Class utilities
- `lucide-react` -- Icons
- `sonner` -- Toast notifications
- `zod` -- Validation
- `convex` -- Database client
