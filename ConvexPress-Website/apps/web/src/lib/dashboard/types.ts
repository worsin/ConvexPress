/**
 * Dashboard types for the SmithHarper website user dashboard.
 * These types mirror the Convex schema shapes for UI consumption.
 */

/** User profile data from getCurrentUser query */
export interface UserProfile {
  _id: string;
  /** External auth provider user ID (legacy name from WorkOS migration, now stores Clerk user ID) */
  workosId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** OAuth provider avatar URL (legacy name from WorkOS migration) */
  workosAvatarUrl: string | null;
  nickname: string | null;
  displayName: string;
  slug: string;
  websiteUrl: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarStorageId: string | null;
  socialLinks: SocialLinks | null;
  preferences: UserPreferences | null;
  roleId: string;
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
  label: string;
  value: string;
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
  }> | null;
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
  isEditable: boolean;
}

/** Notification item for My Notifications page (matches Convex siteNotifications schema) */
export interface NotificationItem {
  _id: string;
  userId: string;
  notificationKey: string;
  eventCode: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  readAt?: number;
  groupKey?: string;
  groupCount?: number;
  actorId?: string;
  actorName?: string;
  actorAvatarUrl?: string;
  persistent: boolean;
  createdAt: number;
}

/** Notification preference for a specific notification key (matches Convex getPreferences query) */
export interface NotificationPreference {
  notificationKey: string;
  notificationName: string;
  category: string;
  type: string;
  icon: string;
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
