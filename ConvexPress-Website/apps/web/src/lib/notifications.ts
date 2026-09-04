/**
 * Notifications — customer-facing model for the notification center.
 *
 * The backend (notifications.queries.listForCenter) returns public-safe
 * items and per-view counts; this module carries the copy, the kind
 * metadata, link resolution (admin URLs never leak to members), snooze
 * presets, and the date helpers the center, bell, and widget share.
 *
 * Mirrors ConvexPress-Admin/packages/backend/convex/notifications/center.ts.
 */

export type NotificationType = "info" | "success" | "warning" | "error";

export type NotificationKind = "support" | "commerce" | "learning" | "content" | "account" | "system";

export type NotificationView = "inbox" | "unread" | "needs" | "snoozed" | "archived";

export const NOTIFICATION_VIEWS: NotificationView[] = ["inbox", "unread", "needs", "snoozed", "archived"];

/** Row from notifications.queries.listForCenter */
export interface CenterNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
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
  ticketNumber?: string;
  ticketId?: string;
}

export interface NotificationCounts {
  inbox: number;
  unread: number;
  needs: number;
  snoozed: number;
  archived: number;
}

export const EMPTY_COUNTS: NotificationCounts = { inbox: 0, unread: 0, needs: 0, snoozed: 0, archived: 0 };

export interface CenterResult {
  items: CenterNotification[];
  counts: NotificationCounts;
  kinds: NotificationKind[];
  now: number;
}

export const VIEW_META: Record<NotificationView, { label: string; empty: string; emptyTitle: string }> = {
  inbox: {
    label: "All",
    emptyTitle: "Nothing here yet",
    empty: "Updates about your orders, tickets, courses, and account land in this inbox.",
  },
  unread: { label: "Unread", emptyTitle: "You're caught up", empty: "Nothing unread. New arrivals show up here first." },
  needs: { label: "Needs you", emptyTitle: "Nothing is waiting on you", empty: "Replies, payments, and alerts that need a decision show up here." },
  snoozed: { label: "Snoozed", emptyTitle: "Nothing snoozed", empty: "Snooze a notification to bring it back later today, tomorrow, or next week." },
  archived: { label: "Archived", emptyTitle: "Nothing archived", empty: "Archived notifications stay here in case you need them again." },
};

export const KIND_META: Record<NotificationKind, { label: string }> = {
  support: { label: "Support" },
  commerce: { label: "Orders and billing" },
  learning: { label: "Courses" },
  content: { label: "Content and comments" },
  account: { label: "Account and security" },
  system: { label: "Site" },
};

export const KIND_ORDER: NotificationKind[] = ["support", "commerce", "learning", "content", "account", "system"];

export function isNotificationView(value: unknown): value is NotificationView {
  return typeof value === "string" && (NOTIFICATION_VIEWS as string[]).includes(value);
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && (KIND_ORDER as string[]).includes(value);
}

// ─── State ───────────────────────────────────────────────────────────────────

export function isRead(n: Pick<CenterNotification, "readAt">): boolean {
  return typeof n.readAt === "number";
}

export function isArchived(n: Pick<CenterNotification, "dismissedAt">): boolean {
  return typeof n.dismissedAt === "number";
}

export function isSnoozed(n: Pick<CenterNotification, "snoozedUntil">, now: number): boolean {
  return typeof n.snoozedUntil === "number" && n.snoozedUntil > now;
}

/** Needs the member, has not been actioned, and is not archived or snoozed. */
export function isPendingAction(n: Pick<CenterNotification, "needsAction" | "actionedAt" | "dismissedAt" | "snoozedUntil">, now: number): boolean {
  return n.needsAction && typeof n.actionedAt !== "number" && !isArchived(n) && !isSnoozed(n, now);
}

/** Client-side mirror of the backend view rules (used to filter a stale list while a new query loads). */
export function matchesView(n: Pick<CenterNotification, "readAt" | "dismissedAt" | "snoozedUntil" | "actionedAt" | "needsAction">, view: NotificationView, now: number): boolean {
  switch (view) {
    case "archived":
      return isArchived(n);
    case "snoozed":
      return !isArchived(n) && isSnoozed(n, now);
    case "inbox":
      return !isArchived(n) && !isSnoozed(n, now);
    case "unread":
      return !isArchived(n) && !isSnoozed(n, now) && !isRead(n);
    case "needs":
      return isPendingAction(n, now);
    default:
      return true;
  }
}

// ─── Links ───────────────────────────────────────────────────────────────────

export type LinkTarget =
  | { kind: "ticket"; ticketNumber: string }
  | { kind: "ticketById"; ticketId: string }
  | { kind: "dashboard"; subpath: string }
  | { kind: "path"; path: string }
  | null;

const DASHBOARD_PREFIX = "/dashboard";

/**
 * Where "Open" should take the member. Structured ticket references win;
 * admin-app URLs (/admin/...) are never surfaced to members. Dashboard
 * URLs are returned as a dashboard subpath so the caller can rebuild them
 * under the configured base path.
 */
export function resolveLink(n: Pick<CenterNotification, "actionUrl" | "ticketNumber" | "ticketId">): LinkTarget {
  if (n.ticketNumber) return { kind: "ticket", ticketNumber: n.ticketNumber };
  if (n.ticketId) return { kind: "ticketById", ticketId: n.ticketId };
  const url = (n.actionUrl ?? "").trim();
  if (!url) return null;
  if (url.startsWith("/admin")) return null;
  if (/^https?:\/\//i.test(url)) return { kind: "path", path: url };
  if (!url.startsWith("/")) return null;
  const ticketMatch = url.match(/^\/support\/tickets\/([^/?#]+)/);
  if (ticketMatch) {
    const ref = ticketMatch[1];
    return /^TKT-/i.test(ref) ? { kind: "ticket", ticketNumber: ref.toUpperCase() } : { kind: "ticketById", ticketId: ref };
  }
  if (url === DASHBOARD_PREFIX || url.startsWith(`${DASHBOARD_PREFIX}/`)) {
    return { kind: "dashboard", subpath: url.slice(DASHBOARD_PREFIX.length) || "" };
  }
  return { kind: "path", path: url };
}

/** Button text for the resolved link. Falls back to the backend label. */
export function linkLabel(target: LinkTarget, fallback?: string): string {
  switch (target?.kind) {
    case "ticket":
    case "ticketById":
      return "Open ticket";
    case "dashboard":
      return fallback && fallback !== "View" ? fallback : "Open in dashboard";
    case "path":
      return fallback ?? "Open";
    default:
      return fallback ?? "Open";
  }
}

// ─── Snooze presets ──────────────────────────────────────────────────────────

export interface SnoozePreset {
  key: string;
  label: string;
  until: (now: number) => number;
}

function at(dayOffset: number, hour: number, now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export const SNOOZE_PRESETS: SnoozePreset[] = [
  {
    key: "later",
    label: "Later today",
    until: (now) => {
      const inThreeHours = now + 3 * 3_600_000;
      const sixPm = at(0, 18, now);
      // "Later today" is 6pm if that's still ahead, otherwise three hours out.
      return sixPm > now + 30 * 60_000 ? Math.max(sixPm, Math.min(inThreeHours, sixPm)) : inThreeHours;
    },
  },
  { key: "tomorrow", label: "Tomorrow morning", until: (now) => at(1, 9, now) },
  {
    key: "nextweek",
    label: "Next week",
    until: (now) => {
      const d = new Date(now);
      const day = d.getDay();
      const toMonday = (8 - day) % 7 || 7;
      return at(toMonday, 9, now);
    },
  },
];

export function defaultSnoozePreset(): SnoozePreset {
  return SNOOZE_PRESETS[1];
}

// ─── Time ────────────────────────────────────────────────────────────────────

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 0) {
    const m = Math.round(-diff / 60_000);
    if (m < 60) return `in ${Math.max(1, m)}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `in ${h}h`;
    const d = Math.round(h / 24);
    return d === 1 ? "tomorrow" : `in ${d} days`;
  }
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

export function fullTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, n)) return "Today";
  if (same(d, new Date(now - 86_400_000))) return "Yesterday";
  if (now - ts < 7 * 86_400_000) return "This week";
  if (now - ts < 30 * 86_400_000) return "Earlier this month";
  return d.toLocaleDateString("en-US", { month: "long", year: d.getFullYear() !== n.getFullYear() ? "numeric" : undefined });
}

export function groupByDay<T extends { createdAt: number }>(items: T[], now = Date.now()): Array<{ label: string; items: T[] }> {
  const groups: Array<{ label: string; items: T[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export function searchText(n: Pick<CenterNotification, "title" | "message" | "actorName" | "ticketNumber" | "kind">): string {
  return `${n.title} ${n.message} ${n.actorName ?? ""} ${n.ticketNumber ?? ""} ${KIND_META[n.kind]?.label ?? ""}`.toLowerCase();
}

/** Summary line under the page title / in the bell header. */
export function summaryLine(counts: NotificationCounts): string {
  if (counts.unread === 0 && counts.needs === 0) return "You're all caught up.";
  const parts = [`${counts.unread} unread`];
  if (counts.needs > 0) parts.push(`${counts.needs} ${counts.needs === 1 ? "needs" : "need"} you`);
  return `${parts.join(", ")}.`;
}
