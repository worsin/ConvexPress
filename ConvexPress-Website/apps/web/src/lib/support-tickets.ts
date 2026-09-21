import type { Id } from "@convexpress-website/backend/generated/dataModel";
/**
 * Support tickets — customer-facing model and copy.
 *
 * Statuses, categories and priorities mirror the backend validators in
 * ConvexPress-Admin/packages/backend/convex/schema/tickets.ts. Everything the
 * list, the thread, the widget and the public /support routes show about a
 * ticket's state is derived here so they always agree.
 */

export type TicketStatus = "open" | "awaitingResponse" | "inProgress" | "resolved" | "closed";
export type TicketCategory = "billing" | "technical" | "account" | "featureRequest" | "general" | "other";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type SenderType = "user" | "admin" | "system" | "ai";

export interface TicketAttachment {
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface ThreadMessage {
  _id: string;
  sequence: number;
  senderType: SenderType;
  senderName: string;
  content: string;
  createdAt: number;
  editedAt?: number;
  attachments?: TicketAttachment[];
}

/** Row from tickets.queries.getMyTicketsOverview */
export interface TicketOverview {
  _id: Id<"ticket_tickets">;
  ticketNumber: string;
  subject: string;
  category: TicketCategory | string;
  status: TicketStatus;
  priority: TicketPriority;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt?: number;
  firstResponseAt?: number;
  resolvedAt?: number;
  closedAt?: number;
  rating?: number;
  unread: boolean;
  waitingOnYou: boolean;
  finished: boolean;
  lastMessagePreview: string;
  lastMessageSender: SenderType;
  agentName: string | null;
  agentInitials: string | null;
  responseWindow: string;
}

export interface TicketOverviewCounts {
  yours: number;
  active: number;
  done: number;
  total: number;
}

export interface TicketOverviewResult {
  tickets: TicketOverview[];
  counts: TicketOverviewCounts;
  responseWindow: string;
}

/** Result of tickets.queries.getMyTicketThread */
export interface TicketThreadTicket {
  _id: Id<"ticket_tickets">;
  ticketNumber: string;
  subject: string;
  description: string;
  category: TicketCategory | string;
  categoryLabel: string;
  status: TicketStatus;
  priority: TicketPriority;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt?: number;
  lastMessageSenderType?: SenderType;
  firstResponseAt?: number;
  resolvedAt?: number;
  closedAt?: number;
  rating?: number;
  ratingComment?: string;
  unread: boolean;
  waitingOnYou: boolean;
  finished: boolean;
  isOwner: boolean;
  viewerName: string;
}

export interface TicketThreadData {
  ticket: TicketThreadTicket;
  messages: ThreadMessage[];
  agent: { name: string; initials: string } | null;
  responseWindow: string;
  resolutionTargetMinutes: number | null;
}

export interface TicketCategoryOption {
  value: TicketCategory;
  label: string;
  responseWindow: string;
}

export interface TicketCategoriesResult {
  categories: TicketCategoryOption[];
  firstResponseTargetMinutes: number | null;
  resolutionTargetMinutes: number | null;
}

export type Tone = "info" | "warn" | "good" | "neutral" | "bad";

export const STATUS_META: Record<TicketStatus, { label: string; tone: Tone; blurb: string }> = {
  open: { label: "Open", tone: "info", blurb: "We have it and will reply soon." },
  inProgress: { label: "Working on it", tone: "info", blurb: "Someone on our team is on this." },
  awaitingResponse: { label: "Your turn", tone: "warn", blurb: "We replied and are waiting on you." },
  resolved: { label: "Resolved", tone: "good", blurb: "Marked as solved. Reply to reopen if not." },
  closed: { label: "Closed", tone: "neutral", blurb: "This conversation is finished." },
};

export const STATUS_ORDER: TicketStatus[] = ["awaitingResponse", "open", "inProgress", "resolved", "closed"];

/**
 * Copy for the built-in categories. Sites can rename or add categories in
 * admin settings; unknown values fall back to the label the backend sends.
 */
export const CATEGORY_META: Record<TicketCategory, { label: string; hint: string; examples: string }> = {
  technical: { label: "Something's not working", hint: "Errors, pages that won't load, downloads that fail.", examples: "Include what you clicked and what you saw." },
  billing: { label: "Billing and payments", hint: "Charges, receipts, refunds, and renewals.", examples: "Mention the amount and the date if you have them." },
  account: { label: "My account", hint: "Sign-in, profile, email, or membership questions.", examples: "Tell us which email address you use." },
  featureRequest: { label: "Suggestion", hint: "Something you wish the site did.", examples: "Describe what you're trying to get done." },
  general: { label: "General question", hint: "Anything about products, orders, or how things work.", examples: "As much detail as you can." },
  other: { label: "Something else", hint: "Anything that doesn't fit above.", examples: "As much detail as you can." },
};

export const CATEGORY_ORDER: TicketCategory[] = ["technical", "billing", "account", "general", "featureRequest", "other"];

export function categoryLabel(value: string, fallback?: string): string {
  return CATEGORY_META[value as TicketCategory]?.label ?? fallback ?? value;
}

export function categoryHint(value: string): string | undefined {
  return CATEGORY_META[value as TicketCategory]?.hint;
}

export function categoryExamples(value: string): string {
  return CATEGORY_META[value as TicketCategory]?.examples ?? "As much detail as you can.";
}

/** Order categories the way CATEGORY_ORDER prefers; unknown ones keep their position after. */
export function sortCategories<T extends { value: string }>(categories: T[]): T[] {
  const rank = (value: string) => {
    const i = CATEGORY_ORDER.indexOf(value as TicketCategory);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...categories].sort((a, b) => rank(a.value) - rank(b.value));
}

export const PRIORITY_META: Record<TicketPriority, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Normal", tone: "neutral" },
  high: { label: "High", tone: "warn" },
  urgent: { label: "Urgent", tone: "bad" },
};

// ─── State ───────────────────────────────────────────────────────────────────

export function waitingOnYou(t: Pick<TicketOverview, "status">): boolean {
  return t.status === "awaitingResponse";
}

export function isFinished(t: Pick<TicketOverview, "status">): boolean {
  return t.status === "resolved" || t.status === "closed";
}

export function canReply(t: Pick<TicketOverview, "status">): boolean {
  return t.status !== "closed";
}

export function canRate(t: Pick<TicketOverview, "status" | "rating">): boolean {
  return isFinished(t) && (t.rating === undefined || t.rating === null);
}

/** Needs the member: waiting on them, or holding an unread agent reply. */
export function needsYou(t: Pick<TicketOverview, "status" | "unread">): boolean {
  return waitingOnYou(t) || t.unread;
}

export type TicketFilter = "all" | "yours" | "active" | "done";

export const FILTER_LABELS: Record<TicketFilter, string> = {
  all: "All",
  yours: "Yours",
  active: "Active",
  done: "Done",
};

export function matchesFilter(t: TicketOverview, filter: TicketFilter): boolean {
  switch (filter) {
    case "yours":
      return needsYou(t);
    case "active":
      return !isFinished(t);
    case "done":
      return isFinished(t);
    default:
      return true;
  }
}

/** Yours first, then most recent activity. */
export function compareTickets(a: TicketOverview, b: TicketOverview): number {
  const ya = needsYou(a) ? 1 : 0;
  const yb = needsYou(b) ? 1 : 0;
  if (ya !== yb) return yb - ya;
  return (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt);
}

export function ticketSearchText(t: TicketOverview): string {
  return `${t.ticketNumber} ${t.subject} ${t.lastMessagePreview} ${categoryLabel(t.category)} ${t.agentName ?? ""}`.toLowerCase();
}

// ─── Validation ──────────────────────────────────────────────────────────────

export const SUBJECT_MIN = 5;
export const SUBJECT_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 10000;

export interface TicketDraftErrors {
  subject?: string;
  description?: string;
}

export function validateTicketDraft(input: { subject: string; description: string }): {
  values: { subject: string; description: string };
  fieldErrors: TicketDraftErrors;
} {
  const subject = input.subject.trim().replace(/\s+/g, " ");
  const description = input.description.trim();
  const fieldErrors: TicketDraftErrors = {};
  if (subject.length < SUBJECT_MIN) fieldErrors.subject = `Give it a subject of at least ${SUBJECT_MIN} characters.`;
  else if (subject.length > SUBJECT_MAX) fieldErrors.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;
  if (description.length < DESCRIPTION_MIN) fieldErrors.description = `Tell us a little more (at least ${DESCRIPTION_MIN} characters).`;
  else if (description.length > DESCRIPTION_MAX) fieldErrors.description = `Keep the description under ${DESCRIPTION_MAX.toLocaleString()} characters.`;
  return { values: { subject, description }, fieldErrors };
}

/** Pull the human message out of a ConvexError or Error. */
export function explainError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
    if (typeof data === "string" && data.trim()) return data;
    if (typeof (err as { message?: unknown }).message === "string") {
      const message = (err as { message: string }).message;
      // Convex wraps the thrown data in a long prefix; keep the readable tail.
      const idx = message.indexOf("Uncaught ConvexError:");
      return idx >= 0 ? message.slice(idx + "Uncaught ConvexError:".length).trim() : message;
    }
  }
  return fallback;
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"];
export const ATTACHMENT_ACCEPT = ATTACHMENT_TYPES.join(",");
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 5;

export function validateAttachment(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!ATTACHMENT_TYPES.includes(file.type)) return `${file.name}: use a PNG, JPG, WebP, GIF, PDF, or text file.`;
  if (file.size <= 0) return `${file.name}: the file is empty.`;
  if (file.size > ATTACHMENT_MAX_BYTES) return `${file.name}: keep it under 10 MB.`;
  return null;
}

/** Add files to a selection, enforcing the per-message limits. Returns the first problem. */
export function addFilesToSelection(current: File[], incoming: Iterable<File>): { files: File[]; problem: string | null } {
  const files = [...current];
  let problem: string | null = null;
  for (const file of incoming) {
    if (files.length >= ATTACHMENT_MAX_COUNT) {
      problem = `Up to ${ATTACHMENT_MAX_COUNT} files per message.`;
      break;
    }
    const err = validateAttachment(file);
    if (err) {
      problem = problem ?? err;
      continue;
    }
    files.push(file);
  }
  return { files, problem };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Names and time ──────────────────────────────────────────────────────────

/** "Ana Rivera" -> "AR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Support";
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
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

export function timeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fullTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Today", "Yesterday", or "Tue, Aug 12". */
export function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, n)) return "Today";
  if (same(d, new Date(now - 86_400_000))) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() !== n.getFullYear() ? "numeric" : undefined });
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

/** Ticket numbers look like TKT-YYYYMM-NNNNN; anything else is a document id. */
export function looksLikeTicketNumber(value: string): boolean {
  return /^TKT-\d{6}-\d{5}$/iu.test(value.trim());
}

export function isTicketCategory(value: unknown): value is TicketCategory {
 return typeof value === "string" && ["billing", "technical", "account", "featureRequest", "general", "other"].includes(value);
}
