/**
 * Email Notification System - Default Template Definitions
 *
 * All 25 pre-defined email templates with their default content.
 * Used by bootstrapTemplates to seed the emailTemplates table.
 *
 * Each template defines:
 *   - Identity: slug, name, description
 *   - Content: subjectTemplate, bodyHtml, preheaderText
 *   - Variables: availableVariables array
 *   - Config: priority, recipientType, category, eventCode
 */

// ─── Shared HTML Wrapper ─────────────────────────────────────────────────────

/**
 * Wraps email content in a consistent HTML email structure.
 * Uses inline styles for email client compatibility.
 */
function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ConvexPress</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:32px 40px;background-color:#18181b;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">{site_name}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                This email was sent by {site_name}.
                <a href="{unsubscribe_url}" style="color:#6b7280;text-decoration:underline;">Manage email preferences</a>
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
                &copy; {current_year} {site_name}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Template Type ───────────────────────────────────────────────────────────

interface TemplateDefinition {
  slug: string;
  name: string;
  description: string;
  subjectTemplate: string;
  bodyHtml: string;
  preheaderText?: string;
  availableVariables: Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
  }>;
  priority: "immediate" | "batched" | "digest";
  recipientType: "customer" | "employee" | "admin" | "custom";
  category: string;
  eventCode?: string;
}

// ─── Default Templates (25) ──────────────────────────────────────────────────

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  // ═══ Registration ════════════════════════════════════════════════════════════

  {
    slug: "welcome-email",
    name: "Welcome Email",
    description: "Sent to new users upon registration",
    subjectTemplate: "Welcome to {site_name}!",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Welcome, {recipient_name}!</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        We're thrilled to have you join {site_name}. Your account has been created successfully.
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        Get started by exploring our latest content or updating your profile.
      </p>
      <a href="{site_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Visit {site_name}</a>
    `),
    preheaderText: "Your account has been created successfully",
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false, defaultValue: "there" },
      { name: "user_name", description: "Username", required: false },
      { name: "user_email", description: "User's email address", required: false },
      { name: "site_name", description: "Site name", required: false, defaultValue: "ConvexPress" },
      { name: "site_url", description: "Site URL", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "registration",
    eventCode: "registration.user_registered",
  },

  {
    slug: "email-verification",
    name: "Email Verification",
    description: "Sent to verify user's email address after registration",
    subjectTemplate: "Verify your email for {site_name}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Verify Your Email</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, please verify your email address to complete your registration.
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        Click the button below to verify:
      </p>
      <a href="{verification_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Verify Email</a>
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">If you didn't create this account, you can safely ignore this email.</p>
    `),
    preheaderText: "Please verify your email address",
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false },
      { name: "verification_url", description: "Email verification URL", required: true },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "registration",
    eventCode: "registration.user_registered",
  },

  {
    slug: "new-user-admin",
    name: "New User Admin Notification",
    description: "Sent to administrators when a new user registers",
    subjectTemplate: "New user registered: {user_email}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New User Registration</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        A new user has registered on {site_name}:
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Name:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{user_name}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Email:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{user_email}</td></tr>
      </table>
    `),
    availableVariables: [
      { name: "user_name", description: "New user's name", required: false },
      { name: "user_email", description: "New user's email", required: true },
    ],
    priority: "batched",
    recipientType: "admin",
    category: "registration",
    eventCode: "registration.user_registered",
  },

  {
    slug: "user-invitation",
    name: "User Invitation",
    description: "Sent when an admin invites someone to join the site",
    subjectTemplate: "You've been invited to {site_name}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">You're Invited!</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        {inviter_name} has invited you to join {site_name} as a {role}.
      </p>
      <a href="{invite_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Accept Invitation</a>
    `),
    preheaderText: "You've been invited to join us",
    availableVariables: [
      { name: "inviter_name", description: "Name of person who sent the invite", required: false },
      { name: "invite_url", description: "Invitation acceptance URL", required: true },
      { name: "role", description: "Role being assigned", required: false, defaultValue: "member" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "registration",
    eventCode: "registration.user_invited",
  },

  // ═══ Security ════════════════════════════════════════════════════════════════

  {
    slug: "login-new-device",
    name: "New Device Login Alert",
    description: "Sent when a user logs in from an unrecognized device",
    subjectTemplate: "New login detected from {device}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New Login Detected</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, a new login to your {site_name} account was detected:
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Device:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{device}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">IP Address:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{ip_address}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Location:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{location}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Time:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{login_time}</td></tr>
      </table>
      <p style="margin:0;font-size:14px;color:#6b7280;">If this wasn't you, please change your password immediately.</p>
    `),
    preheaderText: "A new login was detected on your account",
    availableVariables: [
      { name: "device", description: "Device name/type", required: false, defaultValue: "Unknown device" },
      { name: "ip_address", description: "IP address of login", required: false },
      { name: "location", description: "Geographic location", required: false },
      { name: "login_time", description: "Time of login", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "security",
    eventCode: "auth.login_failed",
  },

  {
    slug: "failed-login-attempts",
    name: "Failed Login Attempts Alert",
    description: "Sent to admins when multiple failed login attempts are detected",
    subjectTemplate: "Multiple failed login attempts detected",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#dc2626;">Security Alert</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Multiple failed login attempts have been detected for the account: <strong>{target_email}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Attempts:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{attempt_count}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">IP Address:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{ip_address}</td></tr>
      </table>
      <p style="margin:0;font-size:14px;color:#6b7280;">Please review this activity in the admin panel.</p>
    `),
    preheaderText: "Security alert: multiple failed login attempts",
    availableVariables: [
      { name: "target_email", description: "Email being targeted", required: true },
      { name: "attempt_count", description: "Number of failed attempts", required: true },
      { name: "ip_address", description: "Source IP address", required: false },
    ],
    priority: "immediate",
    recipientType: "admin",
    category: "security",
    eventCode: "auth.login",
  },

  {
    slug: "password-reset-request",
    name: "Password Reset Request",
    description: "Sent when a user requests a password reset",
    subjectTemplate: "Reset your password for {site_name}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Password Reset</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, we received a request to reset your password. Click the button below to set a new password:
      </p>
      <a href="{reset_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Reset Password</a>
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">This link expires in {expiry_hours} hours. If you didn't request this, you can safely ignore this email.</p>
    `),
    preheaderText: "Reset your password",
    availableVariables: [
      { name: "reset_url", description: "Password reset URL", required: true },
      { name: "expiry_hours", description: "Hours until link expires", required: false, defaultValue: "24" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "security",
    eventCode: "password.reset_requested",
  },

  {
    slug: "password-changed",
    name: "Password Changed Confirmation",
    description: "Sent to confirm a password change",
    subjectTemplate: "Your password was changed",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Password Changed</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your password for {site_name} was successfully changed.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">IP Address:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{ip_address}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Time:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{changed_at}</td></tr>
      </table>
      <p style="margin:0;font-size:14px;color:#dc2626;">If you did not make this change, please contact support immediately.</p>
    `),
    preheaderText: "Your password has been changed",
    availableVariables: [
      { name: "ip_address", description: "IP address where change was made", required: false },
      { name: "changed_at", description: "Timestamp of change", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "security",
    eventCode: "password.changed",
  },

  // ═══ Content ═════════════════════════════════════════════════════════════════

  {
    slug: "post-published-author",
    name: "Post Published (Author)",
    description: "Sent to the author when their post is published",
    subjectTemplate: 'Your post "{title}" is now live!',
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Your Post is Live!</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Congratulations {recipient_name}! Your post "<strong>{title}</strong>" has been published on {site_name}.
      </p>
      <a href="{post_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Post</a>
    `),
    preheaderText: "Your post has been published",
    availableVariables: [
      { name: "title", description: "Post title", required: true },
      { name: "post_url", description: "URL to the published post", required: true },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "content",
    eventCode: "post.published",
  },

  {
    slug: "post-published-subscribers",
    name: "Post Published (Subscribers)",
    description: "Sent to subscribers when new content is published",
    subjectTemplate: "New post: {title}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New Post on {site_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        <strong>{author_name}</strong> published a new post:
      </p>
      <h3 style="margin:0 0 8px;font-size:18px;color:#18181b;">{title}</h3>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">{excerpt}</p>
      <a href="{post_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Read More</a>
    `),
    preheaderText: "New content has been published",
    availableVariables: [
      { name: "title", description: "Post title", required: true },
      { name: "excerpt", description: "Post excerpt", required: false },
      { name: "post_url", description: "URL to the post", required: true },
      { name: "author_name", description: "Author's display name", required: false },
    ],
    priority: "batched",
    recipientType: "customer",
    category: "content",
    eventCode: "post.published",
  },

  {
    slug: "post-scheduled-reminder",
    name: "Post Scheduled Reminder",
    description: "Sent to the author when their post is scheduled",
    subjectTemplate: 'Your post "{title}" publishes on {date}',
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Post Scheduled</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your post "<strong>{title}</strong>" has been scheduled for publication on <strong>{date}</strong>.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">You'll receive a notification when it goes live.</p>
    `),
    availableVariables: [
      { name: "title", description: "Post title", required: true },
      { name: "date", description: "Scheduled publication date", required: true },
    ],
    priority: "batched",
    recipientType: "employee",
    category: "content",
    eventCode: "post.scheduled",
  },

  // ═══ Comments ════════════════════════════════════════════════════════════════

  {
    slug: "new-comment-author",
    name: "New Comment (Post Author)",
    description: "Sent to the post author when someone comments on their post",
    subjectTemplate: 'New comment on "{post_title}"',
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New Comment</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        <strong>{commenter_name}</strong> left a comment on your post "<strong>{post_title}</strong>":
      </p>
      <blockquote style="margin:0 0 24px;padding:16px;background-color:#f9fafb;border-left:4px solid #18181b;border-radius:0 4px 4px 0;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{comment_excerpt}</p>
      </blockquote>
      <a href="{post_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Comment</a>
    `),
    availableVariables: [
      { name: "post_title", description: "Title of the commented post", required: true },
      { name: "commenter_name", description: "Name of the commenter", required: false },
      { name: "comment_excerpt", description: "Excerpt of the comment", required: false },
      { name: "post_url", description: "URL to the post", required: false },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "comment",
    eventCode: "comment.created",
  },

  {
    slug: "comment-pending-moderation",
    name: "Comment Pending Moderation",
    description: "Sent to admins when a comment needs approval",
    subjectTemplate: "New comment awaiting moderation",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Comment Awaiting Moderation</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        A new comment on "<strong>{post_title}</strong>" by <strong>{commenter_name}</strong> is awaiting your approval:
      </p>
      <blockquote style="margin:0 0 24px;padding:16px;background-color:#f9fafb;border-left:4px solid #f59e0b;border-radius:0 4px 4px 0;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{comment_excerpt}</p>
      </blockquote>
    `),
    availableVariables: [
      { name: "post_title", description: "Title of the post", required: true },
      { name: "commenter_name", description: "Commenter's name", required: false },
      { name: "comment_excerpt", description: "Comment excerpt", required: false },
    ],
    priority: "batched",
    recipientType: "admin",
    category: "comment",
    eventCode: "comment.created",
  },

  {
    slug: "comment-approved",
    name: "Comment Approved",
    description: "Sent to the commenter when their comment is approved",
    subjectTemplate: "Your comment was approved",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Comment Approved</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your comment on "<strong>{post_title}</strong>" has been approved and is now visible.
      </p>
      <a href="{comment_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Comment</a>
    `),
    availableVariables: [
      { name: "post_title", description: "Title of the post", required: true },
      { name: "comment_url", description: "URL to the comment", required: false },
    ],
    priority: "batched",
    recipientType: "customer",
    category: "comment",
    eventCode: "comment.approved",
  },

  {
    slug: "comment-reply",
    name: "Comment Reply",
    description: "Sent when someone replies to a user's comment",
    subjectTemplate: "Someone replied to your comment",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New Reply</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        <strong>{replier_name}</strong> replied to your comment on "<strong>{post_title}</strong>":
      </p>
      <blockquote style="margin:0 0 24px;padding:16px;background-color:#f9fafb;border-left:4px solid #18181b;border-radius:0 4px 4px 0;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{reply_excerpt}</p>
      </blockquote>
      <a href="{comment_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Reply</a>
    `),
    availableVariables: [
      { name: "replier_name", description: "Name of the person who replied", required: false },
      { name: "post_title", description: "Post title", required: true },
      { name: "reply_excerpt", description: "Reply excerpt", required: false },
      { name: "comment_url", description: "URL to the comment thread", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "comment",
    eventCode: "comment.created",
  },

  {
    slug: "comment-digest",
    name: "Comment Digest",
    description: "Weekly digest of comments on employee's posts",
    subjectTemplate: "Comments this week on your posts",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Weekly Comment Digest</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, here's a summary of comments on your posts this week:
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">{comment_summary}</p>
    `),
    availableVariables: [
      { name: "comment_summary", description: "Summary of comments this week", required: false },
    ],
    priority: "digest",
    recipientType: "employee",
    category: "comment",
    // No eventCode - generated by cron
  },

  // ═══ Role & Account ══════════════════════════════════════════════════════════

  {
    slug: "role-changed",
    name: "Role Changed",
    description: "Sent when a user's role is updated",
    subjectTemplate: "Your role has been updated to {role}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Role Updated</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your role on {site_name} has been updated to <strong>{role}</strong>.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">This change may affect your permissions on the site.</p>
    `),
    availableVariables: [
      { name: "role", description: "New role name", required: true },
      { name: "old_role", description: "Previous role name", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "system",
    eventCode: "role.assigned",
  },

  {
    slug: "account-deactivated",
    name: "Account Deactivated",
    description: "Sent when a user's account is deactivated",
    subjectTemplate: "Your account has been deactivated",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#dc2626;">Account Deactivated</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your account on {site_name} has been deactivated.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Reason: {reason}
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">If you believe this was a mistake, please contact us at {support_email}.</p>
    `),
    availableVariables: [
      { name: "reason", description: "Reason for deactivation", required: false, defaultValue: "No reason provided" },
      { name: "support_email", description: "Support email address", required: false, defaultValue: "support@convexpress.com" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "system",
    eventCode: "profile.deactivated",
  },

  {
    slug: "user-deletion-confirmation",
    name: "User Deletion Confirmation",
    description: "Sent to confirm account deletion",
    subjectTemplate: "Your account has been deleted",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Account Deleted</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your account on {site_name} has been permanently deleted as of {deletion_date}.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your personal data will be removed within {data_retention_days} days.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">This action cannot be undone.</p>
    `),
    availableVariables: [
      { name: "deletion_date", description: "Date of deletion", required: false },
      { name: "data_retention_days", description: "Days until data is fully purged", required: false, defaultValue: "30" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "system",
    eventCode: "profile.deleted",
  },

  // ═══ System ══════════════════════════════════════════════════════════════════

  {
    slug: "revision-restored-alert",
    name: "Revision Restored Alert",
    description: "Sent when a post revision is restored",
    subjectTemplate: "Post revision restored by {user}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Revision Restored</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        <strong>{user}</strong> restored a revision of "<strong>{post_title}</strong>" from {revision_date}.
      </p>
    `),
    availableVariables: [
      { name: "user", description: "User who restored the revision", required: false },
      { name: "post_title", description: "Post title", required: true },
      { name: "revision_date", description: "Date of the restored revision", required: false },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "content",
    eventCode: "revision.restored",
  },

  {
    slug: "media-storage-warning",
    name: "Media Storage Warning",
    description: "Sent when media storage usage is approaching the limit",
    subjectTemplate: "Storage usage approaching limit",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#f59e0b;">Storage Warning</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Media storage usage is at <strong>{usage_percent}%</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Used:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{used_space}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Total:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{total_space}</td></tr>
      </table>
    `),
    availableVariables: [
      { name: "usage_percent", description: "Current storage usage percentage", required: true },
      { name: "used_space", description: "Used storage space", required: false },
      { name: "total_space", description: "Total available storage", required: false },
    ],
    priority: "batched",
    recipientType: "admin",
    category: "system",
    eventCode: "media.uploaded",
  },

  {
    slug: "settings-changed-alert",
    name: "Settings Changed Alert",
    description: "Sent when site settings are modified",
    subjectTemplate: "Site settings were updated",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Settings Updated</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Site settings section "<strong>{section}</strong>" was updated by another administrator.
      </p>
    `),
    availableVariables: [
      { name: "section", description: "Settings section that was changed", required: true },
      { name: "changed_by", description: "Admin who made the change", required: false },
    ],
    priority: "batched",
    recipientType: "admin",
    category: "system",
    eventCode: "settings.updated",
  },

  {
    slug: "sitemap-generated",
    name: "Sitemap Generated",
    description: "Sent when the sitemap is regenerated",
    subjectTemplate: "Sitemap updated successfully",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Sitemap Updated</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        The sitemap for {site_name} has been regenerated with {url_count} URLs.
      </p>
      <a href="{sitemap_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Sitemap</a>
    `),
    availableVariables: [
      { name: "url_count", description: "Number of URLs in the sitemap", required: false },
      { name: "sitemap_url", description: "URL to the sitemap", required: false },
    ],
    priority: "batched",
    recipientType: "admin",
    category: "system",
    eventCode: "seo.sitemap_generated",
  },

  {
    slug: "webhook-failure-alert",
    name: "Webhook Failure Alert",
    description: "Sent when a webhook delivery fails",
    subjectTemplate: "Webhook delivery failed: {endpoint}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#dc2626;">Webhook Failure</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        A webhook delivery to <strong>{endpoint}</strong> has failed.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Status Code:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{status_code}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Error:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{error}</td></tr>
      </table>
    `),
    availableVariables: [
      { name: "endpoint", description: "Webhook endpoint URL", required: true },
      { name: "status_code", description: "HTTP status code", required: false },
      { name: "error", description: "Error message", required: false },
    ],
    priority: "immediate",
    recipientType: "admin",
    category: "system",
    eventCode: "api.webhook_triggered",
  },

  // ═══ Knowledge Base & Ticket ════════════════════════════════════════════════

  {
    slug: "ticket_reply_notification",
    name: "Ticket Reply Notification",
    description: "Sent to ticket submitter when support replies to their ticket",
    subjectTemplate: "New reply on ticket {{ticketNumber}}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New Reply on Your Ticket</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        <strong>{senderName}</strong> replied to your ticket: <strong>{ticketNumber}</strong> - {subject}
      </p>
    `),
    preheaderText: "You have a new reply on your support ticket",
    availableVariables: [
      { name: "ticketNumber", description: "Ticket number/ID", required: true },
      { name: "subject", description: "Ticket subject", required: true },
      { name: "senderName", description: "Name of the person who replied", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "support",
    eventCode: "ticket.replied",
  },

  {
    slug: "ticket_user_reply",
    name: "Ticket User Reply",
    description: "Sent to support agents when a customer replies to their ticket",
    subjectTemplate: "Customer replied to {{ticketNumber}}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Customer Replied</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        <strong>{userName}</strong> replied to ticket <strong>{ticketNumber}</strong>.
      </p>
    `),
    preheaderText: "A customer has replied to a support ticket",
    availableVariables: [
      { name: "ticketNumber", description: "Ticket number/ID", required: true },
      { name: "userName", description: "Name of the customer who replied", required: false },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "support",
    eventCode: "ticket.replied",
  },

  {
    slug: "ticket_assigned",
    name: "Ticket Assigned",
    description: "Sent to an agent when a ticket is assigned to them",
    subjectTemplate: "Ticket {{ticketNumber}} assigned to you",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Ticket Assigned to You</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        You've been assigned to ticket: <strong>{ticketNumber}</strong> - {subject}
      </p>
    `),
    preheaderText: "A support ticket has been assigned to you",
    availableVariables: [
      { name: "ticketNumber", description: "Ticket number/ID", required: true },
      { name: "subject", description: "Ticket subject", required: true },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "support",
    eventCode: "ticket.assigned",
  },

  {
    slug: "ticket_resolved",
    name: "Ticket Resolved",
    description: "Sent to the ticket submitter when their ticket is resolved",
    subjectTemplate: "Your ticket {{ticketNumber}} has been resolved",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Ticket Resolved</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your support ticket has been resolved. Thank you for reaching out.
      </p>
    `),
    preheaderText: "Your support ticket has been resolved",
    availableVariables: [
      { name: "ticketNumber", description: "Ticket number/ID", required: true },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "support",
    eventCode: "ticket.resolved",
  },

  {
    slug: "kb_workflow_step_ready",
    name: "KB Workflow Step Ready",
    description: "Sent when a knowledge base article is ready for review",
    subjectTemplate: "Article ready for review: {{articleTitle}}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Article Ready for Review</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        An article needs your review: <strong>{articleTitle}</strong>
      </p>
    `),
    preheaderText: "A knowledge base article is awaiting your review",
    availableVariables: [
      { name: "articleTitle", description: "Title of the article", required: true },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "knowledge_base",
    eventCode: "kb.workflow_step_ready",
  },

  {
    slug: "kb_workflow_approved",
    name: "KB Article Approved",
    description: "Sent when a knowledge base article is approved and published",
    subjectTemplate: "Your article has been approved: {{articleTitle}}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Article Approved</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your article <strong>{articleTitle}</strong> has been approved and published.
      </p>
    `),
    preheaderText: "Your knowledge base article has been approved",
    availableVariables: [
      { name: "articleTitle", description: "Title of the article", required: true },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "knowledge_base",
    eventCode: "kb.workflow_approved",
  },

  {
    slug: "kb_workflow_rejected",
    name: "KB Article Needs Revisions",
    description: "Sent when a knowledge base article is rejected and needs revisions",
    subjectTemplate: "Article needs revisions: {{articleTitle}}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Article Needs Revisions</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your article <strong>{articleTitle}</strong> was not approved and needs revisions.
      </p>
    `),
    preheaderText: "Your knowledge base article needs revisions",
    availableVariables: [
      { name: "articleTitle", description: "Title of the article", required: true },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "knowledge_base",
    eventCode: "kb.workflow_rejected",
  },

  {
    slug: "kb_comment_notification",
    name: "KB Comment Notification",
    description: "Sent when someone comments on a knowledge base article",
    subjectTemplate: "New comment on {{articleTitle}}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New Comment on Your Article</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        <strong>{commenterName}</strong> commented on your article: <strong>{articleTitle}</strong>
      </p>
    `),
    preheaderText: "Someone commented on your knowledge base article",
    availableVariables: [
      { name: "articleTitle", description: "Title of the article", required: true },
      { name: "commenterName", description: "Name of the commenter", required: false },
    ],
    priority: "immediate",
    recipientType: "employee",
    category: "knowledge_base",
    eventCode: "kb.comment_created",
  },

  // ═══ Purchase Core ══════════════════════════════════════════════════════════

  {
    slug: "purchase-receipt",
    name: "Purchase Receipt",
    description: "Sent to customers when payment is received for any purchase source",
    subjectTemplate: "Receipt for {orderNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Payment received</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, we received payment for <strong>{orderNumber}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Source:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{sourceLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Total:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{total}</td></tr>
      </table>
      <a href="{orderUrl}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View purchase</a>
    `),
    preheaderText: "Your payment has been received",
    availableVariables: [
      { name: "orderNumber", description: "Purchase/order number", required: true },
      { name: "sourceLabel", description: "Purchase source label", required: false },
      { name: "total", description: "Formatted total amount", required: true },
      { name: "orderUrl", description: "Customer purchase URL", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "commerce",
    eventCode: "purchase.payment_succeeded",
  },

  {
    slug: "purchase-admin-alert",
    name: "Purchase Admin Alert",
    description: "Sent to administrators when a paid purchase is recorded",
    subjectTemplate: "New paid purchase {orderNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">New paid purchase</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        A paid purchase was recorded from <strong>{sourceLabel}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Order:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{orderNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Customer:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{customerEmail}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Total:</td><td style="padding:8px 0;color:#18181b;font-size:14px;">{total}</td></tr>
      </table>
      <a href="{adminUrl}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Open ledger</a>
    `),
    preheaderText: "A paid purchase needs admin visibility",
    availableVariables: [
      { name: "orderNumber", description: "Purchase/order number", required: true },
      { name: "sourceLabel", description: "Purchase source label", required: false },
      { name: "customerEmail", description: "Customer email address", required: false },
      { name: "total", description: "Formatted total amount", required: true },
      { name: "adminUrl", description: "Admin ledger URL", required: false },
    ],
    priority: "immediate",
    recipientType: "admin",
    category: "commerce",
    eventCode: "purchase.payment_succeeded",
  },

  {
    slug: "purchase-payment-failed",
    name: "Purchase Payment Failed",
    description: "Sent to customers when a purchase payment fails",
    subjectTemplate: "Payment issue for {orderNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Payment could not be completed</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        We could not complete payment for <strong>{orderNumber}</strong>. You can review the purchase and try again if payment is still required.
      </p>
      <a href="{orderUrl}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Review purchase</a>
    `),
    preheaderText: "There was a payment issue",
    availableVariables: [
      { name: "orderNumber", description: "Purchase/order number", required: true },
      { name: "orderUrl", description: "Customer purchase URL", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "commerce",
    eventCode: "purchase.payment_failed",
  },

  // ═══ Commerce Returns ═══════════════════════════════════════════════════════

  {
    slug: "commerce-return-requested-admin",
    name: "Return Requested Admin Alert",
    description: "Sent to admins when a customer requests a return",
    subjectTemplate: "Return request {returnNumber} for order {orderNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Return requested</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        {customerEmail} requested return <strong>{returnNumber}</strong> for order <strong>{orderNumber}</strong>.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Reason: {reason}</p>
    `),
    preheaderText: "A customer return request needs review",
    availableVariables: [
      { name: "returnNumber", description: "Return/RMA number", required: true },
      { name: "orderNumber", description: "Order number", required: true },
      { name: "customerEmail", description: "Customer email address", required: false },
      { name: "reason", description: "Customer return reason", required: false },
    ],
    priority: "immediate",
    recipientType: "admin",
    category: "commerce",
    eventCode: "commerce.return_requested",
  },

  {
    slug: "commerce-return-approved",
    name: "Return Approved",
    description: "Sent to customers when a return is approved",
    subjectTemplate: "Your return {returnNumber} was approved",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Return approved</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your return <strong>{returnNumber}</strong> for order <strong>{orderNumber}</strong> was approved.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Estimated refund: {refundAmount}</p>
    `),
    preheaderText: "Your return request was approved",
    availableVariables: [
      { name: "returnNumber", description: "Return/RMA number", required: true },
      { name: "orderNumber", description: "Order number", required: true },
      { name: "refundAmount", description: "Approved refund amount", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "commerce",
    eventCode: "commerce.return_approved",
  },

  {
    slug: "commerce-return-rejected",
    name: "Return Rejected",
    description: "Sent to customers when a return is rejected",
    subjectTemplate: "Update on return {returnNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Return update</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Return <strong>{returnNumber}</strong> for order <strong>{orderNumber}</strong> was not approved.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Reason: {rejectionReason}</p>
    `),
    preheaderText: "Your return request has an update",
    availableVariables: [
      { name: "returnNumber", description: "Return/RMA number", required: true },
      { name: "orderNumber", description: "Order number", required: true },
      { name: "rejectionReason", description: "Admin rejection reason", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "commerce",
    eventCode: "commerce.return_rejected",
  },

  {
    slug: "commerce-return-label-added",
    name: "Return Shipping Label Added",
    description: "Sent when a return shipping label is available",
    subjectTemplate: "Return label for {returnNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Return label ready</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        A return shipping label is ready for return <strong>{returnNumber}</strong>.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Tracking: {trackingNumber}</p>
    `),
    preheaderText: "Your return shipping label is ready",
    availableVariables: [
      { name: "returnNumber", description: "Return/RMA number", required: true },
      { name: "trackingNumber", description: "Return tracking number", required: false },
      { name: "labelUrl", description: "Return label URL", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "commerce",
    eventCode: "commerce.return_label_added",
  },

  {
    slug: "commerce-return-refunded",
    name: "Return Refunded",
    description: "Sent when a return refund succeeds",
    subjectTemplate: "Refund processed for {returnNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Refund processed</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Refund <strong>{refundAmount}</strong> was processed for return <strong>{returnNumber}</strong>.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Refund method: {refundMethod}</p>
    `),
    preheaderText: "Your return refund was processed",
    availableVariables: [
      { name: "returnNumber", description: "Return/RMA number", required: true },
      { name: "refundAmount", description: "Refund amount", required: true },
      { name: "refundMethod", description: "Refund method", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "commerce",
    eventCode: "commerce.return_refunded",
  },

  {
    slug: "commerce-return-refund-failed",
    name: "Return Refund Failed Admin Alert",
    description: "Sent to admins when an automatic return refund fails",
    subjectTemplate: "Refund failed for return {returnNumber}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Refund failed</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        The refund for return <strong>{returnNumber}</strong> failed and needs review.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Error: {failureReason}</p>
    `),
    preheaderText: "A return refund needs attention",
    availableVariables: [
      { name: "returnNumber", description: "Return/RMA number", required: true },
      { name: "refundAmount", description: "Refund amount", required: false },
      { name: "failureReason", description: "Provider failure reason", required: false },
    ],
    priority: "immediate",
    recipientType: "admin",
    category: "commerce",
    eventCode: "commerce.return_refund_failed",
  },

  // ═══ Digest ══════════════════════════════════════════════════════════════════

  // ═══ Shipping (Tier 1.3 — auto-seeded when v2Enabled) ═══════════════════════

  {
    slug: "shipping_picked_up",
    name: "Shipment Picked Up",
    description: "Sent when a carrier picks up a shipment",
    subjectTemplate: "Your order {order_number} is on its way",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Your order is on the move</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your order <strong>{order_number}</strong> has been picked up by {carrier} and is in transit.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Tracking number: <strong>{tracking_number}</strong>
      </p>
    `),
    preheaderText: "Your order has been picked up by the carrier",
    availableVariables: [
      { name: "recipient_name", description: "Customer name", required: false, defaultValue: "there" },
      { name: "order_number", description: "Order number", required: true },
      { name: "tracking_number", description: "Carrier tracking number", required: false },
      { name: "carrier", description: "Carrier name (UPS, FedEx, etc.)", required: false },
      { name: "status_description", description: "Free-form carrier status text", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "shipping",
    eventCode: "shipping.tracking_updated",
  },

  {
    slug: "shipping_out_for_delivery",
    name: "Out for Delivery",
    description: "Sent when a shipment is out for final-mile delivery",
    subjectTemplate: "Your order {order_number} is out for delivery today",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Out for delivery</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your order <strong>{order_number}</strong> is on the truck for delivery today.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Tracking number: <strong>{tracking_number}</strong>
      </p>
    `),
    preheaderText: "Your shipment is out for delivery today",
    availableVariables: [
      { name: "recipient_name", description: "Customer name", required: false, defaultValue: "there" },
      { name: "order_number", description: "Order number", required: true },
      { name: "tracking_number", description: "Carrier tracking number", required: false },
      { name: "carrier", description: "Carrier name", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "shipping",
    eventCode: "shipping.tracking_updated",
  },

  {
    slug: "shipping_delivered",
    name: "Shipment Delivered",
    description: "Sent when a shipment is confirmed delivered",
    subjectTemplate: "Your order {order_number} has been delivered",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Delivered!</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your order <strong>{order_number}</strong> has been delivered.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Carrier: {carrier} · Tracking: {tracking_number}
      </p>
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
        Didn't receive your package? Reply to this email for help.
      </p>
    `),
    preheaderText: "Your order has been delivered",
    availableVariables: [
      { name: "recipient_name", description: "Customer name", required: false, defaultValue: "there" },
      { name: "order_number", description: "Order number", required: true },
      { name: "tracking_number", description: "Carrier tracking number", required: false },
      { name: "carrier", description: "Carrier name", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "shipping",
    eventCode: "shipping.tracking_delivered",
  },

  {
    slug: "shipping_exception",
    name: "Shipment Exception",
    description: "Sent when a carrier reports a delivery exception (delay, address issue, etc.)",
    subjectTemplate: "Issue with your order {order_number} delivery",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Delivery exception</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, the carrier has reported an issue with your order <strong>{order_number}</strong>.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Status: {status_description}<br/>
        Tracking: {tracking_number}
      </p>
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
        We're monitoring the situation. If we need anything from you, we'll be in touch.
      </p>
    `),
    preheaderText: "There's an issue with your shipment",
    availableVariables: [
      { name: "recipient_name", description: "Customer name", required: false, defaultValue: "there" },
      { name: "order_number", description: "Order number", required: true },
      { name: "tracking_number", description: "Carrier tracking number", required: false },
      { name: "carrier", description: "Carrier name", required: false },
      { name: "status_description", description: "Free-form carrier status text", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "shipping",
    eventCode: "shipping.tracking_exception",
  },

  {
    slug: "shipping_returned",
    name: "Shipment Returned",
    description: "Sent when a shipment is returned to sender",
    subjectTemplate: "Your order {order_number} was returned",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Shipment returned</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, your order <strong>{order_number}</strong> was returned to us by the carrier.
      </p>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Tracking: {tracking_number}<br/>
        Reason: {status_description}
      </p>
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
        We'll reach out shortly to figure out next steps.
      </p>
    `),
    preheaderText: "Your shipment was returned to sender",
    availableVariables: [
      { name: "recipient_name", description: "Customer name", required: false, defaultValue: "there" },
      { name: "order_number", description: "Order number", required: true },
      { name: "tracking_number", description: "Carrier tracking number", required: false },
      { name: "status_description", description: "Free-form carrier status text", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "shipping",
    eventCode: "shipping.tracking_returned",
  },

  {
    slug: "weekly-content-digest",
    name: "Weekly Content Digest",
    description: "Weekly summary of published content for all subscribers",
    subjectTemplate: "Your weekly content summary",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Weekly Digest</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Hi {recipient_name}, here's what's new on {site_name} this week:
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong>{post_count}</strong> new posts published:</p>
      <ul style="margin:0 0 24px;padding-left:20px;">{post_list}</ul>
      <a href="{site_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Visit {site_name}</a>
    `),
    availableVariables: [
      { name: "post_count", description: "Number of new posts", required: false },
      { name: "post_list", description: "HTML list of new posts", required: false },
    ],
    priority: "digest",
    recipientType: "customer",
    category: "content",
    // No eventCode - generated by cron
  },

  // ═══ Subscriptions (Wave 10.2) ═══════════════════════════════════════════════

  {
    slug: "subscription-welcome",
    name: "Subscription Welcome",
    description: "Sent when a subscription is first activated",
    subjectTemplate: "Welcome — your subscription to {offer_title} is active",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Welcome, {recipient_name}!</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your subscription to <strong>{offer_title}</strong> is now active. Your next bill of {amount} is due on {next_billing_at}.
      </p>
      <a href="{portal_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Manage subscription</a>
    `),
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false, defaultValue: "there" },
      { name: "offer_title", description: "Subscription offer title", required: true },
      { name: "amount", description: "Recurring amount formatted", required: false },
      { name: "next_billing_at", description: "Next billing date", required: false },
      { name: "portal_url", description: "Customer portal URL", required: false, defaultValue: "/dashboard/subscriptions" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "subscription",
    eventCode: "commerce.subscription_created",
  },

  {
    slug: "subscription-renewed",
    name: "Subscription Renewed",
    description: "Sent when a renewal charge succeeds",
    subjectTemplate: "Your subscription to {offer_title} renewed",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Thanks, {recipient_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your subscription to <strong>{offer_title}</strong> renewed successfully. {amount} was charged to the card on file.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Next renewal: {next_billing_at}.</p>
      <a href="{portal_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Manage subscription</a>
    `),
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false, defaultValue: "there" },
      { name: "offer_title", description: "Subscription offer title", required: true },
      { name: "amount", description: "Charged amount formatted", required: false },
      { name: "next_billing_at", description: "Next billing date", required: false },
      { name: "portal_url", description: "Customer portal URL", required: false, defaultValue: "/dashboard/subscriptions" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "subscription",
    eventCode: "commerce.subscription_renewed",
  },

  {
    slug: "subscription-payment-failed",
    name: "Subscription Payment Failed",
    description: "Sent when a renewal charge fails; retry will follow",
    subjectTemplate: "Payment failed for your subscription to {offer_title}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#b91c1c;">Action needed, {recipient_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        We couldn't charge your card for <strong>{offer_title}</strong>. We'll retry automatically, but you can fix it now to avoid interruption.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Attempt {attempt_number} of {max_attempts}.</p>
      <a href="{portal_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Update payment method</a>
    `),
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false, defaultValue: "there" },
      { name: "offer_title", description: "Subscription offer title", required: true },
      { name: "attempt_number", description: "Current retry attempt", required: false, defaultValue: "1" },
      { name: "max_attempts", description: "Maximum retries before cancel", required: false, defaultValue: "4" },
      { name: "portal_url", description: "Customer portal URL", required: false, defaultValue: "/dashboard/subscriptions" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "subscription",
    eventCode: "commerce.subscription_past_due",
  },

  {
    slug: "subscription-trial-ending",
    name: "Subscription Trial Ending",
    description: "Sent 3 days before a trial ends",
    subjectTemplate: "Your {offer_title} trial ends in 3 days",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Hi {recipient_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your trial of <strong>{offer_title}</strong> ends on {trial_ends_at}. Your first full charge of {amount} will run that day.
      </p>
      <a href="{portal_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Manage subscription</a>
    `),
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false, defaultValue: "there" },
      { name: "offer_title", description: "Subscription offer title", required: true },
      { name: "trial_ends_at", description: "Trial end date", required: true },
      { name: "amount", description: "First-charge amount formatted", required: false },
      { name: "portal_url", description: "Customer portal URL", required: false, defaultValue: "/dashboard/subscriptions" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "subscription",
    eventCode: "commerce.subscription_trial_ending",
  },

  {
    slug: "subscription-cancelled",
    name: "Subscription Cancelled",
    description: "Sent when a subscription is cancelled",
    subjectTemplate: "Your subscription to {offer_title} has been cancelled",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Hi {recipient_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your subscription to <strong>{offer_title}</strong> has been cancelled. We're sorry to see you go.
      </p>
    `),
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false, defaultValue: "there" },
      { name: "offer_title", description: "Subscription offer title", required: true },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "subscription",
    eventCode: "commerce.subscription_cancelled",
  },

  {
    slug: "subscription-paused",
    name: "Subscription Paused",
    description: "Sent when a subscription is paused",
    subjectTemplate: "Your subscription to {offer_title} is paused",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Hi {recipient_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your subscription to <strong>{offer_title}</strong> has been paused. We won't charge you while paused. Resume any time.
      </p>
      <a href="{portal_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Resume subscription</a>
    `),
    availableVariables: [
      { name: "recipient_name", description: "User's display name", required: false, defaultValue: "there" },
      { name: "offer_title", description: "Subscription offer title", required: true },
      { name: "portal_url", description: "Customer portal URL", required: false, defaultValue: "/dashboard/subscriptions" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "subscription",
    eventCode: "commerce.subscription_paused",
  },

  // ═══ LMS ════════════════════════════════════════════════════════════════════

  {
    slug: "lms-course-enrolled",
    name: "LMS Course Enrollment",
    description: "Sent when a learner is enrolled in a course",
    subjectTemplate: "You're enrolled in {course_title}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">You're in, {recipient_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your enrollment in <strong>{course_title}</strong> is active.
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        Start with the first lesson whenever you're ready.
      </p>
      <a href="{course_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Start course</a>
    `),
    preheaderText: "Your course enrollment is active",
    availableVariables: [
      { name: "recipient_name", description: "Learner display name", required: false, defaultValue: "there" },
      { name: "course_title", description: "Course title", required: true },
      { name: "course_url", description: "Learner course URL", required: true },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "lms",
    eventCode: "lms.enrolled",
  },

  {
    slug: "lms-course-unenrolled",
    name: "LMS Course Access Removed",
    description: "Sent when a learner's course access is revoked",
    subjectTemplate: "Access removed: {course_title}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Course access changed</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your access to <strong>{course_title}</strong> has been removed.
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        If this seems incorrect, contact the site administrator.
      </p>
      <a href="{course_public_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View course</a>
    `),
    preheaderText: "Your course access changed",
    availableVariables: [
      { name: "recipient_name", description: "Learner display name", required: false, defaultValue: "there" },
      { name: "course_title", description: "Course title", required: true },
      { name: "course_public_url", description: "Public course URL", required: true },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "lms",
    eventCode: "lms.unenrolled",
  },

  {
    slug: "lms-enrollment-expired",
    name: "LMS Course Access Expired",
    description: "Sent when a learner's time-limited course access expires",
    subjectTemplate: "Access expired: {course_title}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Course access expired</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your access to <strong>{course_title}</strong> expired{expired_at_sentence}.
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        You can review the course page or contact the site team if you need access restored.
      </p>
      <a href="{course_public_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View course</a>
    `),
    preheaderText: "Your course access has expired",
    availableVariables: [
      { name: "recipient_name", description: "Learner display name", required: false, defaultValue: "there" },
      { name: "course_title", description: "Course title", required: true },
      { name: "course_public_url", description: "Public course URL", required: true },
      { name: "expired_at", description: "Expiration timestamp", required: false },
      { name: "expired_at_sentence", description: "Human-readable expiration suffix", required: false, defaultValue: " recently" },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "lms",
    eventCode: "lms.enrollment_expired",
  },

  {
    slug: "lms-course-completed",
    name: "LMS Course Completed",
    description: "Sent when a learner completes a course",
    subjectTemplate: "Course complete: {course_title}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Nice work, {recipient_name}</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        You've completed <strong>{course_title}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        Review the course any time from your learning dashboard.
      </p>
      <a href="{course_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View course</a>
    `),
    preheaderText: "You completed a course",
    availableVariables: [
      { name: "recipient_name", description: "Learner display name", required: false, defaultValue: "there" },
      { name: "course_title", description: "Course title", required: true },
      { name: "course_url", description: "Learner course URL", required: true },
      { name: "completed_at", description: "Completion timestamp", required: false },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "lms",
    eventCode: "lms.course_completed",
  },

  {
    slug: "lms-certificate-issued",
    name: "LMS Certificate Issued",
    description: "Sent when a course certificate is issued",
    subjectTemplate: "Your certificate for {course_title} is ready",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#18181b;">Your certificate is ready</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Congratulations, {recipient_name}. Your certificate for <strong>{course_title}</strong> has been issued.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Serial: {serial}</p>
      <a href="{certificate_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View certificate</a>
    `),
    preheaderText: "Your course certificate has been issued",
    availableVariables: [
      { name: "recipient_name", description: "Learner display name", required: false, defaultValue: "there" },
      { name: "course_title", description: "Course title", required: true },
      { name: "serial", description: "Certificate serial number", required: true },
      { name: "certificate_url", description: "Public certificate URL", required: true },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "lms",
    eventCode: "lms.certificate_issued",
  },

  {
    slug: "lms-certificate-revoked",
    name: "LMS Certificate Revoked",
    description: "Sent when an issued certificate is revoked",
    subjectTemplate: "Certificate revoked for {course_title}",
    bodyHtml: wrapHtml(`
      <h2 style="margin:0 0 16px;font-size:20px;color:#b45309;">Certificate status changed</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
        Your certificate for <strong>{course_title}</strong> has been revoked.
      </p>
      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
        Visit the course to review your current completion status.
      </p>
      <a href="{course_url}" style="display:inline-block;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View course</a>
    `),
    preheaderText: "A certificate status changed",
    availableVariables: [
      { name: "recipient_name", description: "Learner display name", required: false, defaultValue: "there" },
      { name: "course_title", description: "Course title", required: true },
      { name: "serial", description: "Certificate serial number", required: false },
      { name: "course_url", description: "Learner course URL", required: true },
    ],
    priority: "immediate",
    recipientType: "customer",
    category: "lms",
    eventCode: "lms.certificate_revoked",
  },
];
