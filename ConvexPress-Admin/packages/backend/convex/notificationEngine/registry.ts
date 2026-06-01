import { EMAIL_TEMPLATE_REGISTRY } from "../emails/registry";
import { NOTIFICATION_TYPES } from "../notifications/validators";

export type NotificationChannel = "site" | "email";

export interface NotificationEngineListenerDef {
  eventCode: string;
  name: string;
  handlerModule: string;
  handlerFunction: string;
  handlerType: "internal" | "action" | "scheduled";
  priority: number;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoff: "linear" | "exponential";
  system: string;
  description: string;
  filterCondition?: string;
}

export interface NotificationRouteSummary {
  eventCode: string;
  channels: NotificationChannel[];
}

const ENGINE_LISTENER_NAME_PREFIX = "Notification Engine:";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export const EVENT_DRIVEN_EMAIL_EVENT_CODES = uniqueSorted(
  EMAIL_TEMPLATE_REGISTRY.filter(
    (entry) => entry.triggerKind === "event" && entry.canonicalEventCode,
  ).map((entry) => entry.canonicalEventCode!),
);

const SITE_EVENT_CODES = uniqueSorted(
  Object.values(NOTIFICATION_TYPES).map((config) => config.eventCode),
);

export const EMAIL_EVENT_HANDLER_ROUTES: NotificationEngineListenerDef[] = [
  {
    eventCode: "registration.user_registered",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email registration.user_registered`,
    handlerModule: "emails/internals",
    handlerFunction: "onUserRegistered",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes registration completion emails through the email notification system.",
  },
  {
    eventCode: "registration.user_invited",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email registration.user_invited`,
    handlerModule: "emails/internals",
    handlerFunction: "onUserInvited",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes invitation emails through the email notification system.",
  },
  {
    eventCode: "auth.login",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email auth.login`,
    handlerModule: "emails/internals",
    handlerFunction: "onLoggedIn",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes new-device login alerts through the email notification system.",
  },
  {
    eventCode: "auth.login_failed",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email auth.login_failed`,
    handlerModule: "emails/internals",
    handlerFunction: "onLoginFailed",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes failed-login security alerts through the email notification system.",
  },
  {
    eventCode: "password.changed",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email password.changed`,
    handlerModule: "emails/internals",
    handlerFunction: "onPasswordChanged",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes password-changed confirmations through the email notification system.",
  },
  {
    eventCode: "password.reset_completed",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email password.reset_completed`,
    handlerModule: "emails/internals",
    handlerFunction: "onPasswordChanged",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes password-reset completion confirmations through the email notification system.",
  },
  {
    eventCode: "post.published",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email post.published`,
    handlerModule: "emails/internals",
    handlerFunction: "onPostPublished",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes publication emails through the email notification system.",
  },
  {
    eventCode: "post.scheduled",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email post.scheduled`,
    handlerModule: "emails/internals",
    handlerFunction: "onPostScheduled",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes post scheduling reminder emails through the email notification system.",
  },
  {
    eventCode: "comment.created",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email comment.created`,
    handlerModule: "emails/internals",
    handlerFunction: "onCommentCreated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes comment-created emails through the email notification system.",
  },
  {
    eventCode: "comment.approved",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email comment.approved`,
    handlerModule: "emails/internals",
    handlerFunction: "onCommentApproved",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes comment approval emails through the email notification system.",
  },
  {
    eventCode: "comment.replied",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email comment.replied`,
    handlerModule: "emails/internals",
    handlerFunction: "onCommentReplied",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes comment reply emails through the email notification system.",
  },
  {
    eventCode: "role.assigned",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email role.assigned`,
    handlerModule: "emails/internals",
    handlerFunction: "onRoleAssigned",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes role-change emails through the email notification system.",
  },
  {
    eventCode: "revision.restored",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email revision.restored`,
    handlerModule: "emails/internals",
    handlerFunction: "onRevisionRestored",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes revision-restore alerts through the email notification system.",
  },
  {
    eventCode: "media.uploaded",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email media.uploaded`,
    handlerModule: "emails/internals",
    handlerFunction: "onMediaUploaded",
    handlerType: "internal",
    priority: 30,
    maxRetries: 3,
    retryDelayMs: 5000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes storage-threshold warnings through the email notification system.",
  },
  {
    eventCode: "settings.updated",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email settings.updated`,
    handlerModule: "emails/internals",
    handlerFunction: "onSettingsUpdated",
    handlerType: "internal",
    priority: 30,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes settings-change alerts through the email notification system.",
  },
  {
    eventCode: "seo.sitemap_generated",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email seo.sitemap_generated`,
    handlerModule: "emails/internals",
    handlerFunction: "onSitemapGenerated",
    handlerType: "internal",
    priority: 30,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes sitemap-generation emails through the email notification system.",
  },
  {
    eventCode: "api.webhook_triggered",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email api.webhook_triggered`,
    handlerModule: "emails/internals",
    handlerFunction: "onWebhookTriggered",
    handlerType: "internal",
    priority: 5,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes webhook-failure alerts through the email notification system.",
  },
  {
    eventCode: "profile.deactivated",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email profile.deactivated`,
    handlerModule: "emails/internals",
    handlerFunction: "onProfileDeactivated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes account deactivation confirmations through the email notification system.",
  },
  {
    eventCode: "profile.deleted",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email profile.deleted`,
    handlerModule: "emails/internals",
    handlerFunction: "onProfileDeleted",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes account deletion confirmations through the email notification system.",
  },
  {
    eventCode: "ticket.replied",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email ticket.replied`,
    handlerModule: "emails/internals",
    handlerFunction: "onTicketReplied",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes ticket reply emails through the support email notification system.",
  },
  {
    eventCode: "ticket.assigned",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email ticket.assigned`,
    handlerModule: "emails/internals",
    handlerFunction: "onTicketAssigned",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes ticket assignment emails through the support email notification system.",
  },
  {
    eventCode: "ticket.resolved",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email ticket.resolved`,
    handlerModule: "emails/internals",
    handlerFunction: "onTicketResolved",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes ticket resolution emails through the support email notification system.",
  },
  {
    eventCode: "kb.workflow_step_ready",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email kb.workflow_step_ready`,
    handlerModule: "emails/internals",
    handlerFunction: "onKbWorkflowStepReady",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes KB workflow review-step emails through the email notification system.",
  },
  {
    eventCode: "kb.workflow_approved",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email kb.workflow_approved`,
    handlerModule: "emails/internals",
    handlerFunction: "onKbWorkflowApproved",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes KB workflow approval emails through the email notification system.",
  },
  {
    eventCode: "kb.workflow_rejected",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email kb.workflow_rejected`,
    handlerModule: "emails/internals",
    handlerFunction: "onKbWorkflowRejected",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes KB workflow rejection emails through the email notification system.",
  },
  {
    eventCode: "kb.comment_created",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email kb.comment_created`,
    handlerModule: "emails/internals",
    handlerFunction: "onKbCommentCreated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes KB comment emails through the email notification system.",
  },
  {
    eventCode: "lms.enrolled",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email lms.enrolled`,
    handlerModule: "emails/internals",
    handlerFunction: "onLmsCourseEnrolled",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes LMS enrollment confirmations through the email notification system.",
  },
  {
    eventCode: "lms.unenrolled",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email lms.unenrolled`,
    handlerModule: "emails/internals",
    handlerFunction: "onLmsCourseUnenrolled",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes LMS course-access removal emails through the email notification system.",
  },
  {
    eventCode: "lms.course_completed",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email lms.course_completed`,
    handlerModule: "emails/internals",
    handlerFunction: "onLmsCourseCompleted",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes LMS course completion confirmations through the email notification system.",
  },
  {
    eventCode: "lms.certificate_issued",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email lms.certificate_issued`,
    handlerModule: "emails/internals",
    handlerFunction: "onLmsCertificateIssued",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes LMS certificate issuance emails through the email notification system.",
  },
  {
    eventCode: "lms.certificate_revoked",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email lms.certificate_revoked`,
    handlerModule: "emails/internals",
    handlerFunction: "onLmsCertificateRevoked",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes LMS certificate revocation emails through the email notification system.",
  },
  {
    eventCode: "commerce.subscription_created",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email commerce.subscription_created`,
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionCreated",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes subscription welcome emails through the subscription email system.",
  },
  {
    eventCode: "commerce.subscription_renewed",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email commerce.subscription_renewed`,
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionRenewed",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes subscription renewal emails through the subscription email system.",
  },
  {
    eventCode: "commerce.subscription_past_due",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email commerce.subscription_past_due`,
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionPastDue",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes subscription past-due emails through the subscription email system.",
  },
  {
    eventCode: "commerce.subscription_trial_ending",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email commerce.subscription_trial_ending`,
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionTrialEnding",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes subscription trial-ending emails through the subscription email system.",
  },
  {
    eventCode: "commerce.subscription_cancelled",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email commerce.subscription_cancelled`,
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionCancelled",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes subscription cancellation emails through the subscription email system.",
  },
  {
    eventCode: "commerce.subscription_paused",
    name: `${ENGINE_LISTENER_NAME_PREFIX} Email commerce.subscription_paused`,
    handlerModule: "commerceSubscriptions/emails",
    handlerFunction: "onSubscriptionPaused",
    handlerType: "internal",
    priority: 20,
    maxRetries: 3,
    retryDelayMs: 2000,
    retryBackoff: "exponential",
    system: "email",
    description:
      "Routes subscription pause emails through the subscription email system.",
  },
];

const SITE_LISTENER_DEFINITIONS: NotificationEngineListenerDef[] = SITE_EVENT_CODES.map(
  (eventCode) => ({
    eventCode,
    name: `${ENGINE_LISTENER_NAME_PREFIX} Site ${eventCode}`,
    handlerModule: "notifications/internals",
    handlerFunction: "onEvent",
    handlerType: "internal" as const,
    priority: 10,
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoff: "exponential" as const,
    system: "notification",
    description: `Routes ${eventCode} through the site notification system.`,
  }),
);

export const NOTIFICATION_ENGINE_LISTENER_DEFINITIONS: NotificationEngineListenerDef[] =
  [...SITE_LISTENER_DEFINITIONS, ...EMAIL_EVENT_HANDLER_ROUTES];

export const NOTIFICATION_ENGINE_ROUTES: NotificationRouteSummary[] = (() => {
  const routeMap = new Map<string, Set<NotificationChannel>>();

  for (const eventCode of SITE_EVENT_CODES) {
    routeMap.set(eventCode, new Set(["site"]));
  }

  for (const route of EMAIL_EVENT_HANDLER_ROUTES) {
    const channels = routeMap.get(route.eventCode) ?? new Set<NotificationChannel>();
    channels.add("email");
    routeMap.set(route.eventCode, channels);
  }

  return Array.from(routeMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([eventCode, channels]) => ({
      eventCode,
      channels: ["site", "email"].filter((channel) =>
        channels.has(channel as NotificationChannel),
      ) as NotificationChannel[],
    }));
})();

export const NOTIFICATION_ENGINE_ROUTE_MAP = Object.fromEntries(
  NOTIFICATION_ENGINE_ROUTES.map((route) => [route.eventCode, route.channels]),
) as Record<string, NotificationChannel[]>;

export function getNotificationChannelsForEvent(
  eventCode: string,
): NotificationChannel[] {
  return NOTIFICATION_ENGINE_ROUTE_MAP[eventCode] ?? [];
}

const LEGACY_EMAIL_HANDLER_FUNCTIONS = new Set([
  "onUserRegistered",
  "onUserInvited",
  "onLoggedIn",
  "onLoginFailed",
  "onPasswordChanged",
  "onPostPublished",
  "onPostScheduled",
  "onCommentCreated",
  "onCommentApproved",
  "onCommentReplied",
  "onRoleAssigned",
  "onRevisionRestored",
  "onMediaUploaded",
  "onSettingsUpdated",
  "onSitemapGenerated",
  "onWebhookTriggered",
  "onProfileDeactivated",
  "onProfileDeleted",
  "onTicketReplied",
  "onTicketAssigned",
  "onTicketResolved",
  "onKbWorkflowStepReady",
  "onKbWorkflowApproved",
  "onKbWorkflowRejected",
  "onKbCommentCreated",
  "onLmsCourseEnrolled",
  "onLmsCourseUnenrolled",
  "onLmsCourseCompleted",
  "onLmsCertificateIssued",
  "onLmsCertificateRevoked",
]);

const LEGACY_SUBSCRIPTION_EMAIL_HANDLER_FUNCTIONS = new Set([
  "onSubscriptionCreated",
  "onSubscriptionRenewed",
  "onSubscriptionPastDue",
  "onSubscriptionTrialEnding",
  "onSubscriptionCancelled",
  "onSubscriptionPaused",
]);

export function isLegacyNotificationListenerDefinition(
  listener: Pick<
    NotificationEngineListenerDef,
    "name" | "handlerModule" | "handlerFunction" | "system"
  >,
): boolean {
  if (listener.name.startsWith(ENGINE_LISTENER_NAME_PREFIX)) {
    return false;
  }

  if (
    listener.system === "notification" &&
    listener.handlerModule === "notifications/internals" &&
    listener.handlerFunction === "onEvent"
  ) {
    return true;
  }

  if (
    listener.system === "email" &&
    listener.handlerModule === "emails/internals" &&
    LEGACY_EMAIL_HANDLER_FUNCTIONS.has(listener.handlerFunction)
  ) {
    return true;
  }

  if (
    listener.system === "email" &&
    listener.handlerModule === "commerceSubscriptions/emails" &&
    LEGACY_SUBSCRIPTION_EMAIL_HANDLER_FUNCTIONS.has(listener.handlerFunction)
  ) {
    return true;
  }

  return false;
}
