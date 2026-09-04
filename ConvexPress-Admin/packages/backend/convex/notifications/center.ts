/**
 * Site Notification System - Notification Center derivations (pure)
 *
 * Everything the customer-facing notification center needs that is not a
 * database read lives here so it can be unit-tested without Convex:
 *
 *   - kindOf():            eventCode/notificationKey -> coarse customer-facing kind
 *   - deriveNeedsAction(): does this notification ask the recipient to act?
 *   - viewsOf():           which center views (inbox/unread/needs/snoozed/archived)
 *                          a row belongs to at a given instant
 *   - computeCounts():     per-view counts for the view tabs and the bell
 *   - toCenterItem():      public-safe projection of a siteNotifications row
 *   - filterForCenter():   view + kind + search filtering
 *
 * Snooze expiry is query-time only: a row whose `snoozedUntil` has passed is
 * back in the inbox the next time any query runs. No cron, no scheduler.
 *
 * Pure TypeScript: no Convex imports. Safe to import from tests and from the
 * website (mirrored there as lib/notifications.ts).
 */

// ─── Kinds ───────────────────────────────────────────────────────────────────

/** Coarse groups a member filters by. Order matters for the filter chips. */
export const NOTIFICATION_KINDS = [
  "support",
  "commerce",
  "learning",
  "content",
  "account",
  "system",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const KIND_LABELS: Record<NotificationKind, string> = {
  support: "Support",
  commerce: "Orders and billing",
  learning: "Courses",
  content: "Content and comments",
  account: "Account and security",
  system: "Site",
};

const KIND_BY_EVENT_PREFIX: Array<[prefix: string, kind: NotificationKind]> = [
  ["ticket.", "support"],
  ["support.", "support"],
  ["purchase.", "commerce"],
  ["subscription.", "commerce"],
  ["commerce.", "commerce"],
  ["cart.", "commerce"],
  ["checkout.", "commerce"],
  ["product.", "commerce"],
  ["wishlist.", "commerce"],
  ["order.", "commerce"],
  ["lms.", "learning"],
  ["course.", "learning"],
  ["post.", "content"],
  ["comment.", "content"],
  ["media.", "content"],
  ["kb.", "content"],
  ["revision.", "content"],
  ["form.", "content"],
  ["registration.", "account"],
  ["user.", "account"],
  ["profile.", "account"],
  ["password.", "account"],
  ["auth.", "account"],
  ["security.", "account"],
  ["login.", "account"],
  ["role.", "account"],
];

const KIND_BY_KEY_PREFIX: Array<[prefix: string, kind: NotificationKind]> = [
  ["ticket_", "support"],
  ["purchase_", "commerce"],
  ["subscription_", "commerce"],
  ["lms_", "learning"],
  ["post_", "content"],
  ["comment_", "content"],
  ["new_comment", "content"],
  ["pending_comments", "content"],
  ["media_", "content"],
  ["kb_", "content"],
  ["revision_", "content"],
  ["form_", "content"],
  ["login_", "account"],
  ["failed_login", "account"],
  ["password_", "account"],
  ["profile_", "account"],
  ["avatar_", "account"],
  ["role_", "account"],
  ["new_user_", "account"],
  ["user_", "account"],
];

/**
 * Map a notification to the kind a customer would filter by. Looks at the
 * event code first (it carries the emitting system), then the notification
 * key, and falls back to "system".
 */
export function kindOf(n: {
  eventCode?: string | null;
  notificationKey?: string | null;
}): NotificationKind {
  const code = (n.eventCode ?? "").toLowerCase();
  for (const [prefix, kind] of KIND_BY_EVENT_PREFIX) {
    if (code.startsWith(prefix)) return kind;
  }
  const key = (n.notificationKey ?? "").toLowerCase();
  for (const [prefix, kind] of KIND_BY_KEY_PREFIX) {
    if (key.startsWith(prefix)) return kind;
  }
  return "system";
}

// ─── Needs action ────────────────────────────────────────────────────────────

/**
 * Keys whose "needs you" state is fixed regardless of the generic rule.
 * true  = always asks for something
 * false = purely informational even when persistent/warning
 */
export const NEEDS_ACTION_OVERRIDES: Record<string, boolean> = {
  ticket_reply_agent: true, // support replied, your turn
  ticket_resolved: false, // informational; rating is optional
  ticket_reply_customer: false, // admin-side FYI
  purchase_payment_failed: true,
  subscription_past_due: true,
  subscription_trial_ending: true,
  subscription_paused: false,
  subscription_cancelled: false,
  pending_comments: true,
  comment_flagged: true,
  kb_workflow_step_ready: true,
  login_new_location: true,
  failed_login_alert: true,
  password_changed: false,
  role_changed: false,
  post_scheduled: false,
  lms_enrollment_expired: false,
  lms_certificate_revoked: false,
  webhook_failed: true,
};

export interface NeedsActionInput {
  notificationKey?: string | null;
  type?: "info" | "success" | "warning" | "error" | string | null;
  persistent?: boolean | null;
  actionUrl?: string | null;
}

/**
 * Whether a notification asks the recipient to do something.
 *
 * Rule: an explicit per-key override wins; otherwise errors and warnings
 * need attention, successes never do, and a persistent info notification
 * that carries a link does (persistent means "do not auto-expire until dealt
 * with", e.g. a reply to your comment).
 */
export function deriveNeedsAction(n: NeedsActionInput): boolean {
  const key = n.notificationKey ?? "";
  if (key in NEEDS_ACTION_OVERRIDES) return NEEDS_ACTION_OVERRIDES[key];
  if (n.type === "error" || n.type === "warning") return true;
  // Successes are celebrations (order paid, course completed): never a to-do.
  if (n.type === "success") return false;
  if (n.persistent === true && typeof n.actionUrl === "string" && n.actionUrl.length > 0) {
    return true;
  }
  return false;
}

/** Stored flag when present (backfilled rows), otherwise derived. */
export function effectiveNeedsAction(
  n: NeedsActionInput & { needsAction?: boolean | null },
): boolean {
  if (typeof n.needsAction === "boolean") return n.needsAction;
  return deriveNeedsAction(n);
}

// ─── Views ───────────────────────────────────────────────────────────────────

export const CENTER_VIEWS = ["inbox", "unread", "needs", "snoozed", "archived"] as const;
export type CenterView = (typeof CENTER_VIEWS)[number];

export function isCenterView(value: unknown): value is CenterView {
  return typeof value === "string" && (CENTER_VIEWS as readonly string[]).includes(value);
}

export interface CenterStateInput {
  readAt?: number | null;
  dismissedAt?: number | null;
  snoozedUntil?: number | null;
  actionedAt?: number | null;
  needsAction: boolean;
}

export function isSnoozed(n: Pick<CenterStateInput, "snoozedUntil">, now: number): boolean {
  return typeof n.snoozedUntil === "number" && n.snoozedUntil > now;
}

export function isArchived(n: Pick<CenterStateInput, "dismissedAt">): boolean {
  return typeof n.dismissedAt === "number";
}

export function isInInbox(n: CenterStateInput, now: number): boolean {
  return !isArchived(n) && !isSnoozed(n, now);
}

export function isUnread(n: Pick<CenterStateInput, "readAt">): boolean {
  return n.readAt === undefined || n.readAt === null;
}

/** Needs the member and has not been actioned yet. Archived rows never need anyone. */
export function isPendingAction(n: CenterStateInput, now: number): boolean {
  return (
    isInInbox(n, now) &&
    n.needsAction === true &&
    (n.actionedAt === undefined || n.actionedAt === null)
  );
}

/** All views a row belongs to at `now`. */
export function viewsOf(n: CenterStateInput, now: number): CenterView[] {
  const views: CenterView[] = [];
  if (isArchived(n)) {
    views.push("archived");
    return views;
  }
  if (isSnoozed(n, now)) {
    views.push("snoozed");
    return views;
  }
  views.push("inbox");
  if (isUnread(n)) views.push("unread");
  if (isPendingAction(n, now)) views.push("needs");
  return views;
}

export function matchesView(n: CenterStateInput, view: CenterView, now: number): boolean {
  return viewsOf(n, now).includes(view);
}

export interface CenterCounts {
  inbox: number;
  unread: number;
  needs: number;
  snoozed: number;
  archived: number;
}

export const EMPTY_COUNTS: CenterCounts = { inbox: 0, unread: 0, needs: 0, snoozed: 0, archived: 0 };

export function computeCounts(rows: CenterStateInput[], now: number): CenterCounts {
  const counts: CenterCounts = { ...EMPTY_COUNTS };
  for (const row of rows) {
    for (const view of viewsOf(row, now)) {
      counts[view] = counts[view] + 1;
    }
  }
  return counts;
}

// ─── Items ───────────────────────────────────────────────────────────────────

/** Public-safe projection of a siteNotifications row. */
export interface CenterItem {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  kind: NotificationKind;
  notificationKey: string;
  eventCode: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: number;
  readAt?: number;
  dismissedAt?: number;
  snoozedUntil?: number;
  actionedAt?: number;
  needsAction: boolean;
  actorName?: string;
  actorAvatarUrl?: string;
  groupCount?: number;
  /** Ticket number when the notification is about a support ticket. */
  ticketNumber?: string;
  /** Ticket document id when the notification is about a support ticket. */
  ticketId?: string;
}

export interface CenterSourceRow {
  _id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  notificationKey: string;
  eventCode: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: number;
  readAt?: number;
  dismissedAt?: number;
  snoozedUntil?: number;
  actionedAt?: number;
  needsAction?: boolean;
  persistent: boolean;
  actorName?: string;
  actorAvatarUrl?: string;
  groupCount?: number;
  metadata?: string;
}

const TICKET_NUMBER_PATTERN = /^TKT-\d{6}-\d{5}$/u;

/** Pull ticket references out of the JSON metadata without exposing the rest. */
export function ticketRefsFromMetadata(
  metadata: string | undefined,
): { ticketNumber?: string; ticketId?: string } {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const out: { ticketNumber?: string; ticketId?: string } = {};
    if (typeof parsed.ticketNumber === "string" && TICKET_NUMBER_PATTERN.test(parsed.ticketNumber)) {
      out.ticketNumber = parsed.ticketNumber;
    }
    if (typeof parsed.ticketId === "string" && parsed.ticketId.length > 0) {
      out.ticketId = parsed.ticketId;
    }
    return out;
  } catch {
    return {};
  }
}

export function toCenterItem(row: CenterSourceRow): CenterItem {
  const refs = ticketRefsFromMetadata(row.metadata);
  return {
    id: row._id,
    title: row.title,
    message: row.message,
    type: row.type,
    kind: kindOf(row),
    notificationKey: row.notificationKey,
    eventCode: row.eventCode,
    icon: row.icon,
    actionUrl: row.actionUrl,
    actionLabel: row.actionLabel,
    createdAt: row.createdAt,
    readAt: row.readAt,
    dismissedAt: row.dismissedAt,
    snoozedUntil: row.snoozedUntil,
    actionedAt: row.actionedAt,
    needsAction: effectiveNeedsAction(row),
    actorName: row.actorName,
    actorAvatarUrl: row.actorAvatarUrl,
    groupCount: row.groupCount,
    ticketNumber: refs.ticketNumber,
    ticketId: refs.ticketId,
  };
}

// ─── Filtering ───────────────────────────────────────────────────────────────

export function searchText(item: Pick<CenterItem, "title" | "message" | "actorName" | "ticketNumber" | "kind">): string {
  return [item.title, item.message, item.actorName ?? "", item.ticketNumber ?? "", KIND_LABELS[item.kind]]
    .join(" ")
    .toLowerCase();
}

export interface CenterFilter {
  view: CenterView;
  kind?: NotificationKind | "all";
  search?: string;
  limit?: number;
}

export const CENTER_DEFAULT_LIMIT = 100;
export const CENTER_MAX_LIMIT = 250;

export function filterForCenter(items: CenterItem[], filter: CenterFilter, now: number): CenterItem[] {
  const q = (filter.search ?? "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(filter.limit ?? CENTER_DEFAULT_LIMIT, CENTER_MAX_LIMIT));
  const out: CenterItem[] = [];
  for (const item of items) {
    if (!matchesView(item, filter.view, now)) continue;
    if (filter.kind && filter.kind !== "all" && item.kind !== filter.kind) continue;
    if (q && !searchText(item).includes(q)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Snooze ──────────────────────────────────────────────────────────────────

/** Longest a notification may be snoozed for (30 days). */
export const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** Shortest useful snooze (1 minute) so accidental "now" values are rejected. */
export const MIN_SNOOZE_MS = 60 * 1000;

export function validateSnoozeUntil(until: number, now: number): string | null {
  if (!Number.isFinite(until)) return "Snooze time must be a timestamp";
  if (until < now + MIN_SNOOZE_MS) return "Snooze time must be in the future";
  if (until > now + MAX_SNOOZE_MS) return "Notifications can be snoozed for up to 30 days";
  return null;
}
