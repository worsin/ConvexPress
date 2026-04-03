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
    eventCode: "registration.registered",
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
    eventCode: "registration.registered",
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
    eventCode: "registration.registered",
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
    eventCode: "registration.invited",
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
    eventCode: "auth.login",
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

  // ═══ Digest ══════════════════════════════════════════════════════════════════

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
];
