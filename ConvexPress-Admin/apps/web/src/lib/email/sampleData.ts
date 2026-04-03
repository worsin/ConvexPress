/**
 * Email Template Preview - Sample Variable Data
 *
 * Provides realistic sample values for each template's variables,
 * used by the EmailTemplatePreview component to render a visual
 * preview of what the email will look like.
 *
 * IMPORTANT: Variable names use snake_case to match the backend
 * template syntax ({variable_name}). camelCase will NOT be replaced.
 */

import { EMAIL_TEMPLATES } from "./constants";

/**
 * Global variables injected into every email template.
 * These match the backend injectGlobalVariables() output.
 */
export const GLOBAL_SAMPLE_VARIABLES: Record<string, string> = {
  site_name: "ConvexPress",
  site_url: "https://example.com",
  current_year: new Date().getFullYear().toString(),
  logo_url: "https://example.com/logo.png",
  footer_text: "ConvexPress - Empowering content creators.",
  unsubscribe_url: "https://example.com/unsubscribe?token=sample-token",
  recipient_name: "Jane Smith",
};

/**
 * Per-template sample variables keyed by template slug.
 * All keys use snake_case to match backend {variable} placeholders.
 */
export const TEMPLATE_SAMPLE_VARIABLES: Record<string, Record<string, string>> =
  {
    // Registration
    [EMAIL_TEMPLATES.WELCOME]: {
      user_name: "Jane Smith",
      user_email: "jane@example.com",
      login_url: "https://example.com/login",
      profile_url: "https://example.com/profile",
    },
    [EMAIL_TEMPLATES.VERIFICATION]: {
      user_name: "Jane Smith",
      verification_url:
        "https://example.com/verify?token=example-token",
      expires_in: "24 hours",
    },
    [EMAIL_TEMPLATES.NEW_USER_ADMIN]: {
      new_user_name: "John Doe",
      new_user_email: "john@example.com",
      new_user_role: "Subscriber",
      registered_at: new Date().toLocaleString(),
      admin_users_url: "https://example.com/admin/users",
      user_name: "John Doe",
      user_email: "john@example.com",
    },
    [EMAIL_TEMPLATES.INVITATION]: {
      inviter_name: "Admin User",
      invitee_email: "invitee@example.com",
      role: "Author",
      invite_url:
        "https://example.com/invite/accept?token=inv-abc123",
      expires_at: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toLocaleDateString(),
    },

    // Security
    [EMAIL_TEMPLATES.LOGIN_NEW_DEVICE]: {
      user_name: "Jane Smith",
      device: "Chrome on Windows 11",
      device_info: "Chrome on Windows 11",
      ip_address: "192.168.1.100",
      login_time: new Date().toLocaleString(),
      location: "San Francisco, CA",
      security_url: "https://example.com/security",
    },
    [EMAIL_TEMPLATES.FAILED_LOGIN]: {
      user_name: "Jane Smith",
      target_email: "jane@example.com",
      attempt_count: "5",
      time_window: "15 minutes",
      ip_address: "203.0.113.42",
      security_url: "https://example.com/security",
    },
    [EMAIL_TEMPLATES.PASSWORD_RESET]: {
      user_name: "Jane Smith",
      reset_url:
        "https://example.com/reset-password?token=rst-abc123",
      expires_in: "1 hour",
      expiry_hours: "24",
    },
    [EMAIL_TEMPLATES.PASSWORD_CHANGED]: {
      user_name: "Jane Smith",
      changed_at: new Date().toLocaleString(),
      ip_address: "192.168.1.100",
      security_url: "https://example.com/security",
    },

    // Content
    [EMAIL_TEMPLATES.POST_PUBLISHED_AUTHOR]: {
      author_name: "Jane Smith",
      title: "Getting Started with ConvexPress",
      post_title: "Getting Started with ConvexPress",
      post_url: "https://example.com/blog/getting-started",
      published_at: new Date().toLocaleString(),
    },
    [EMAIL_TEMPLATES.POST_PUBLISHED_SUBSCRIBERS]: {
      title: "Getting Started with ConvexPress",
      post_title: "Getting Started with ConvexPress",
      excerpt:
        "Learn how to set up and customize your new ConvexPress installation with this comprehensive guide...",
      post_excerpt:
        "Learn how to set up and customize your new ConvexPress installation with this comprehensive guide...",
      post_url: "https://example.com/blog/getting-started",
      author_name: "Jane Smith",
    },
    [EMAIL_TEMPLATES.POST_SCHEDULED]: {
      author_name: "Jane Smith",
      title: "Upcoming Feature Announcement",
      post_title: "Upcoming Feature Announcement",
      date: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toLocaleString(),
      scheduled_date: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toLocaleString(),
      edit_url: "https://example.com/admin/posts/123/edit",
    },

    // Comments
    [EMAIL_TEMPLATES.NEW_COMMENT_AUTHOR]: {
      author_name: "Jane Smith",
      commenter_name: "Alex Reader",
      comment_excerpt:
        "This is a really helpful article! I especially liked the section about...",
      post_title: "Getting Started with ConvexPress",
      post_url: "https://example.com/blog/getting-started",
      comment_url:
        "https://example.com/blog/getting-started#comment-42",
    },
    [EMAIL_TEMPLATES.COMMENT_MODERATION]: {
      commenter_name: "New User",
      comment_excerpt:
        "I have a question about the installation process. Can you clarify...",
      post_title: "Getting Started with ConvexPress",
      moderation_url: "https://example.com/admin/comments?pending",
    },
    [EMAIL_TEMPLATES.COMMENT_APPROVED]: {
      commenter_name: "Alex Reader",
      comment_excerpt: "This is a really helpful article!",
      post_title: "Getting Started with ConvexPress",
      comment_url:
        "https://example.com/blog/getting-started#comment-42",
    },
    [EMAIL_TEMPLATES.COMMENT_REPLY]: {
      original_commenter_name: "Alex Reader",
      replier_name: "Jane Smith",
      reply_excerpt: "Thanks for the kind words! Glad you found it helpful.",
      post_title: "Getting Started with ConvexPress",
      comment_url:
        "https://example.com/blog/getting-started#comment-43",
    },
    [EMAIL_TEMPLATES.COMMENT_DIGEST]: {
      user_name: "Jane Smith",
      comment_count: "12",
      post_count: "3",
      digest_period: "This Week",
      digest_url: "https://example.com/admin/comments",
      comment_summary: "You have 12 new comments on 3 of your posts this week.",
    },

    // Role & Account
    [EMAIL_TEMPLATES.ROLE_CHANGED]: {
      user_name: "Jane Smith",
      old_role: "Contributor",
      role: "Author",
      previous_role: "Contributor",
      new_role: "Author",
      changed_by: "Admin User",
    },
    [EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED]: {
      user_name: "Jane Smith",
      deactivated_at: new Date().toLocaleString(),
      reason: "Account deactivated by administrator.",
      support_email: "support@example.com",
    },
    [EMAIL_TEMPLATES.USER_DELETION]: {
      user_name: "Jane Smith",
      confirm_url:
        "https://example.com/confirm-deletion?token=del-abc123",
      deletion_date: new Date().toISOString(),
      data_retention_days: "30",
      expires_in: "48 hours",
    },

    // System
    [EMAIL_TEMPLATES.REVISION_RESTORED]: {
      editor_name: "Jane Smith",
      user: "Jane Smith",
      post_title: "Getting Started with ConvexPress",
      revision_date: new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toLocaleString(),
      edit_url: "https://example.com/admin/posts/123/edit",
    },
    [EMAIL_TEMPLATES.MEDIA_STORAGE]: {
      current_usage: "4.2 GB",
      max_storage: "5 GB",
      usage_percent: "84",
      percent_used: "84%",
      used_space: "4.2 GB",
      total_space: "5 GB",
      manage_url: "https://example.com/admin/media",
    },
    [EMAIL_TEMPLATES.SETTINGS_CHANGED]: {
      section: "General",
      changed_by: "Admin User",
      changed_at: new Date().toLocaleString(),
      settings_url: "https://example.com/admin/settings/general",
    },
    [EMAIL_TEMPLATES.SITEMAP_GENERATED]: {
      generated_at: new Date().toLocaleString(),
      page_count: "47",
      url_count: "47",
      sitemap_url: "https://example.com/sitemap.xml",
    },
    [EMAIL_TEMPLATES.WEBHOOK_FAILURE]: {
      endpoint: "https://api.external-service.com/webhook",
      webhook_url: "https://api.external-service.com/webhook",
      error: "Connection timeout after 30 seconds",
      error_message: "Connection timeout after 30 seconds",
      status_code: "504",
      failure_count: "3",
      last_attempt: new Date().toLocaleString(),
    },

    // Digest
    [EMAIL_TEMPLATES.WEEKLY_DIGEST]: {
      user_name: "Jane Smith",
      week_start: new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toLocaleDateString(),
      week_end: new Date().toLocaleDateString(),
      new_posts: "5",
      new_comments: "23",
      post_count: "5",
      top_post: "Getting Started with ConvexPress",
      dashboard_url: "https://example.com/admin/dashboard",
    },
  };

/**
 * Get merged sample variables for a template (global + template-specific).
 */
export function getSampleVariables(
  templateSlug: string,
): Record<string, string> {
  return {
    ...GLOBAL_SAMPLE_VARIABLES,
    ...(TEMPLATE_SAMPLE_VARIABLES[templateSlug] ?? {}),
  };
}
