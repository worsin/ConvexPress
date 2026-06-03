export type EmailTemplateCategory =
  | "registration"
  | "content"
  | "comment"
  | "security"
  | "system"
  | "support"
  | "knowledge_base"
  | "commerce"
  | "shipping"
  | "subscription"
  | "lms";

export type EmailTemplateTriggerKind =
  | "event"
  | "direct"
  | "digest"
  | "manual";

export interface EmailTemplateRegistryEntry {
  slug: string;
  category: EmailTemplateCategory;
  triggerKind: EmailTemplateTriggerKind;
  canonicalEventCode?: string;
  description: string;
}

export const EMAIL_TEMPLATE_CATEGORIES: EmailTemplateCategory[] = [
  "registration",
  "content",
  "comment",
  "security",
  "system",
  "support",
  "knowledge_base",
  "commerce",
  "shipping",
  "subscription",
  "lms",
];

export const EMAIL_TEMPLATE_REGISTRY: EmailTemplateRegistryEntry[] = [
  {
    slug: "welcome-email",
    category: "registration",
    triggerKind: "event",
    canonicalEventCode: "registration.user_registered",
    description: "Welcome message for newly created users.",
  },
  {
    slug: "email-verification",
    category: "registration",
    triggerKind: "event",
    canonicalEventCode: "registration.user_registered",
    description: "Verification prompt for newly created users.",
  },
  {
    slug: "new-user-admin",
    category: "registration",
    triggerKind: "event",
    canonicalEventCode: "registration.user_registered",
    description: "Admin alert when a user account is created.",
  },
  {
    slug: "user-invitation",
    category: "registration",
    triggerKind: "event",
    canonicalEventCode: "registration.user_invited",
    description: "Invitation message sent when an admin creates or resends an invitation.",
  },
  {
    slug: "login-new-device",
    category: "security",
    triggerKind: "event",
    canonicalEventCode: "auth.login",
    description: "Security alert when a login appears to come from a new device or network.",
  },
  {
    slug: "failed-login-attempts",
    category: "security",
    triggerKind: "event",
    canonicalEventCode: "auth.login_failed",
    description: "Admin alert when repeated failed logins are detected.",
  },
  {
    slug: "password-reset-request",
    category: "security",
    triggerKind: "direct",
    canonicalEventCode: "password.reset_requested",
    description: "Password reset email containing a secure reset link.",
  },
  {
    slug: "password-changed",
    category: "security",
    triggerKind: "event",
    canonicalEventCode: "password.changed",
    description: "Confirmation that a password was changed or reset.",
  },
  {
    slug: "post-published-author",
    category: "content",
    triggerKind: "event",
    canonicalEventCode: "post.published",
    description: "Author notification when a post goes live.",
  },
  {
    slug: "post-published-subscribers",
    category: "content",
    triggerKind: "event",
    canonicalEventCode: "post.published",
    description: "Subscriber update when a post goes live.",
  },
  {
    slug: "post-scheduled-reminder",
    category: "content",
    triggerKind: "event",
    canonicalEventCode: "post.scheduled",
    description: "Reminder email for a scheduled post.",
  },
  {
    slug: "new-comment-author",
    category: "comment",
    triggerKind: "event",
    canonicalEventCode: "comment.created",
    description: "Post-author alert for a new comment.",
  },
  {
    slug: "comment-pending-moderation",
    category: "comment",
    triggerKind: "event",
    canonicalEventCode: "comment.created",
    description: "Admin moderation alert for a new comment.",
  },
  {
    slug: "comment-approved",
    category: "comment",
    triggerKind: "event",
    canonicalEventCode: "comment.approved",
    description: "Commenter confirmation that a comment was approved.",
  },
  {
    slug: "comment-reply",
    category: "comment",
    triggerKind: "event",
    canonicalEventCode: "comment.replied",
    description: "Reply notification for the original commenter.",
  },
  {
    slug: "comment-digest",
    category: "comment",
    triggerKind: "digest",
    description: "Digest summary of recent comments for staff/authors.",
  },
  {
    slug: "role-changed",
    category: "system",
    triggerKind: "event",
    canonicalEventCode: "role.assigned",
    description: "Notification that a user role changed.",
  },
  {
    slug: "account-deactivated",
    category: "system",
    triggerKind: "event",
    canonicalEventCode: "profile.deactivated",
    description: "Notice that an account was deactivated.",
  },
  {
    slug: "user-deletion-confirmation",
    category: "system",
    triggerKind: "event",
    canonicalEventCode: "profile.deleted",
    description: "Confirmation for account deletion or export flow.",
  },
  {
    slug: "revision-restored-alert",
    category: "content",
    triggerKind: "event",
    canonicalEventCode: "revision.restored",
    description: "Alert when a content revision is restored.",
  },
  {
    slug: "media-storage-warning",
    category: "system",
    triggerKind: "event",
    canonicalEventCode: "media.uploaded",
    description: "Storage-capacity warning for admins.",
  },
  {
    slug: "settings-changed-alert",
    category: "system",
    triggerKind: "event",
    canonicalEventCode: "settings.updated",
    description: "Admin alert when settings change.",
  },
  {
    slug: "sitemap-generated",
    category: "system",
    triggerKind: "event",
    canonicalEventCode: "seo.sitemap_generated",
    description: "Admin alert after sitemap generation completes.",
  },
  {
    slug: "webhook-failure-alert",
    category: "system",
    triggerKind: "event",
    canonicalEventCode: "api.webhook_triggered",
    description: "Admin alert when an outbound webhook delivery fails.",
  },
  {
    slug: "ticket_reply_notification",
    category: "support",
    triggerKind: "event",
    canonicalEventCode: "ticket.replied",
    description: "Sent to the ticket owner after a staff reply.",
  },
  {
    slug: "ticket_user_reply",
    category: "support",
    triggerKind: "event",
    canonicalEventCode: "ticket.replied",
    description: "Sent to the assigned agent after a customer reply.",
  },
  {
    slug: "ticket_assigned",
    category: "support",
    triggerKind: "event",
    canonicalEventCode: "ticket.assigned",
    description: "Sent when a ticket is assigned to an agent.",
  },
  {
    slug: "ticket_resolved",
    category: "support",
    triggerKind: "event",
    canonicalEventCode: "ticket.resolved",
    description: "Sent to the ticket owner when a ticket is resolved.",
  },
  {
    slug: "kb_workflow_step_ready",
    category: "knowledge_base",
    triggerKind: "event",
    canonicalEventCode: "kb.workflow_step_ready",
    description: "Sent to the next KB reviewer when a workflow step starts.",
  },
  {
    slug: "kb_workflow_approved",
    category: "knowledge_base",
    triggerKind: "event",
    canonicalEventCode: "kb.workflow_approved",
    description: "Sent to the article author when KB review is approved.",
  },
  {
    slug: "kb_workflow_rejected",
    category: "knowledge_base",
    triggerKind: "event",
    canonicalEventCode: "kb.workflow_rejected",
    description: "Sent to the article author when KB review is rejected.",
  },
  {
    slug: "kb_comment_notification",
    category: "knowledge_base",
    triggerKind: "event",
    canonicalEventCode: "kb.comment_created",
    description: "Sent for new KB comments.",
  },
  {
    slug: "purchase-receipt",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "purchase.payment_succeeded",
    description: "Customer receipt for any paid purchase source.",
  },
  {
    slug: "purchase-admin-alert",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "purchase.payment_succeeded",
    description: "Admin alert for a paid purchase from any source.",
  },
  {
    slug: "purchase-payment-failed",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "purchase.payment_failed",
    description: "Customer alert when a purchase payment fails.",
  },
  {
    slug: "commerce-return-requested-admin",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "commerce.return_requested",
    description: "Admin alert for a newly requested return.",
  },
  {
    slug: "commerce-return-approved",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "commerce.return_approved",
    description: "Return approval notification for the customer.",
  },
  {
    slug: "commerce-return-rejected",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "commerce.return_rejected",
    description: "Return rejection notification for the customer.",
  },
  {
    slug: "commerce-return-label-added",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "commerce.return_label_added",
    description: "Return shipping label notification for the customer.",
  },
  {
    slug: "commerce-return-refunded",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "commerce.return_refunded",
    description: "Refund completion notification for the customer.",
  },
  {
    slug: "commerce-return-refund-failed",
    category: "commerce",
    triggerKind: "direct",
    canonicalEventCode: "commerce.return_refund_failed",
    description: "Admin alert when a return refund fails.",
  },
  {
    slug: "shipping_picked_up",
    category: "shipping",
    triggerKind: "direct",
    canonicalEventCode: "shipping.tracking_updated",
    description: "Shipment pickup tracking email.",
  },
  {
    slug: "shipping_out_for_delivery",
    category: "shipping",
    triggerKind: "direct",
    canonicalEventCode: "shipping.tracking_updated",
    description: "Shipment out-for-delivery tracking email.",
  },
  {
    slug: "shipping_delivered",
    category: "shipping",
    triggerKind: "direct",
    canonicalEventCode: "shipping.tracking_delivered",
    description: "Shipment delivered tracking email.",
  },
  {
    slug: "shipping_exception",
    category: "shipping",
    triggerKind: "direct",
    canonicalEventCode: "shipping.tracking_exception",
    description: "Shipment exception tracking email.",
  },
  {
    slug: "shipping_returned",
    category: "shipping",
    triggerKind: "direct",
    canonicalEventCode: "shipping.tracking_returned",
    description: "Shipment returned tracking email.",
  },
  {
    slug: "weekly-content-digest",
    category: "content",
    triggerKind: "digest",
    description: "Weekly digest of newly published content.",
  },
  {
    slug: "subscription-welcome",
    category: "subscription",
    triggerKind: "event",
    canonicalEventCode: "commerce.subscription_created",
    description: "Subscription welcome email.",
  },
  {
    slug: "subscription-renewed",
    category: "subscription",
    triggerKind: "event",
    canonicalEventCode: "commerce.subscription_renewed",
    description: "Subscription renewal confirmation.",
  },
  {
    slug: "subscription-payment-failed",
    category: "subscription",
    triggerKind: "event",
    canonicalEventCode: "commerce.subscription_past_due",
    description: "Subscription payment failed alert.",
  },
  {
    slug: "subscription-trial-ending",
    category: "subscription",
    triggerKind: "event",
    canonicalEventCode: "commerce.subscription_trial_ending",
    description: "Trial-ending reminder for subscriptions.",
  },
  {
    slug: "subscription-cancelled",
    category: "subscription",
    triggerKind: "event",
    canonicalEventCode: "commerce.subscription_cancelled",
    description: "Subscription cancellation confirmation.",
  },
  {
    slug: "subscription-paused",
    category: "subscription",
    triggerKind: "event",
    canonicalEventCode: "commerce.subscription_paused",
    description: "Subscription pause confirmation.",
  },
  {
    slug: "lms-course-enrolled",
    category: "lms",
    triggerKind: "event",
    canonicalEventCode: "lms.enrolled",
    description: "Course enrollment confirmation for learners.",
  },
  {
    slug: "lms-course-unenrolled",
    category: "lms",
    triggerKind: "event",
    canonicalEventCode: "lms.unenrolled",
    description: "Course access removal notice for learners.",
  },
  {
    slug: "lms-enrollment-expired",
    category: "lms",
    triggerKind: "event",
    canonicalEventCode: "lms.enrollment_expired",
    description: "Course access expiration notice for learners.",
  },
  {
    slug: "lms-course-completed",
    category: "lms",
    triggerKind: "event",
    canonicalEventCode: "lms.course_completed",
    description: "Course completion confirmation for learners.",
  },
  {
    slug: "lms-certificate-issued",
    category: "lms",
    triggerKind: "event",
    canonicalEventCode: "lms.certificate_issued",
    description: "Certificate-ready email for learners.",
  },
  {
    slug: "lms-certificate-revoked",
    category: "lms",
    triggerKind: "event",
    canonicalEventCode: "lms.certificate_revoked",
    description: "Certificate revocation notice for learners.",
  },
];

export const EMAIL_TEMPLATE_REGISTRY_BY_SLUG = Object.fromEntries(
  EMAIL_TEMPLATE_REGISTRY.map((entry) => [entry.slug, entry]),
) as Record<string, EmailTemplateRegistryEntry>;

export const OBSOLETE_EMAIL_LISTENERS = [
  {
    eventCode: "password.reset_requested",
    name: "Email: Password Reset Link",
  },
];
