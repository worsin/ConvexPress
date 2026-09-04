/**
 * Ticket System - Customer-facing derivations (pure)
 *
 * The website's ticket list, thread and widget all agree on a ticket's state
 * because it is derived here, once, and unit-tested without Convex:
 *
 *   - isUnreadForCustomer():  an agent replied after the customer last opened it
 *   - isWaitingOnCustomer():  status says it is the customer's turn
 *   - isFinished() / canCustomerReply() / canRate()
 *   - overviewCounts():       the Yours / Active / Done tab numbers
 *   - messagePreview():       one-line preview for list rows
 *   - responseWindowText():   "within about 4 hours" from an SLA target in minutes
 *   - attachment limits + validateAttachmentMeta()
 *
 * Pure TypeScript: no Convex imports.
 */

export type TicketStatus = "open" | "awaitingResponse" | "inProgress" | "resolved" | "closed";
export type TicketSenderType = "user" | "admin" | "system" | "ai";

export interface CustomerReadState {
  status: TicketStatus;
  lastCustomerReadAt?: number | null;
  lastAgentMessageAt?: number | null;
}

/** True when an agent posted a public reply the customer has not opened yet. */
export function isUnreadForCustomer(t: Pick<CustomerReadState, "lastCustomerReadAt" | "lastAgentMessageAt">): boolean {
  const agentAt = t.lastAgentMessageAt ?? 0;
  if (agentAt <= 0) return false;
  const readAt = t.lastCustomerReadAt ?? 0;
  return agentAt > readAt;
}

/** True when the customer is the one who needs to act. */
export function isWaitingOnCustomer(t: Pick<CustomerReadState, "status">): boolean {
  return t.status === "awaitingResponse";
}

export function isFinished(t: Pick<CustomerReadState, "status">): boolean {
  return t.status === "resolved" || t.status === "closed";
}

/**
 * Owners may reply to anything that is not closed; replying to a resolved
 * ticket reopens it. Closed tickets get a new ticket instead.
 */
export function canCustomerReply(t: Pick<CustomerReadState, "status">): boolean {
  return t.status !== "closed";
}

export function canRate(t: Pick<CustomerReadState, "status"> & { rating?: number | null }): boolean {
  return isFinished(t) && (t.rating === undefined || t.rating === null);
}

/** Status a ticket lands in after the owner replies. */
export function statusAfterCustomerReply(status: TicketStatus): TicketStatus {
  switch (status) {
    case "awaitingResponse":
    case "resolved":
    case "closed":
      return "open";
    default:
      return status;
  }
}

/** Status a ticket lands in after a public agent reply. */
export function statusAfterAgentReply(status: TicketStatus): TicketStatus {
  return status === "open" || status === "inProgress" ? "awaitingResponse" : status;
}

// ─── Overview counts ─────────────────────────────────────────────────────────

export interface OverviewCounts {
  /** Waiting on the customer, or holding an unread agent reply. */
  yours: number;
  /** Not resolved or closed. */
  active: number;
  /** Resolved or closed. */
  done: number;
  total: number;
}

export function needsCustomer(t: CustomerReadState): boolean {
  return isWaitingOnCustomer(t) || isUnreadForCustomer(t);
}

export function overviewCounts(tickets: CustomerReadState[]): OverviewCounts {
  const counts: OverviewCounts = { yours: 0, active: 0, done: 0, total: tickets.length };
  for (const t of tickets) {
    if (needsCustomer(t)) counts.yours += 1;
    if (isFinished(t)) counts.done += 1;
    else counts.active += 1;
  }
  return counts;
}

/**
 * Sort for the customer list: tickets that need the customer first, then
 * most recent activity first.
 */
export function compareForCustomerList(
  a: CustomerReadState & { lastMessageAt?: number | null; updatedAt: number },
  b: CustomerReadState & { lastMessageAt?: number | null; updatedAt: number },
): number {
  const ya = needsCustomer(a) ? 1 : 0;
  const yb = needsCustomer(b) ? 1 : 0;
  if (ya !== yb) return yb - ya;
  return (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt);
}

// ─── Previews ────────────────────────────────────────────────────────────────

export const PREVIEW_LENGTH = 140;

/** Strip markup and collapse whitespace so a message fits on one line. */
export function messagePreview(content: string, length = PREVIEW_LENGTH): string {
  const text = content
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= length) return text;
  return `${text.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

// ─── Response window copy ────────────────────────────────────────────────────

/**
 * Human copy for an SLA first-response target given in minutes:
 *   30      -> "within about 30 minutes"
 *   240     -> "within about 4 hours"
 *   1440    -> "within one business day"
 *   2880    -> "within 2 business days"
 */
export function responseWindowText(minutes: number | null | undefined): string {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return "as soon as we can";
  if (minutes < 60) return `within about ${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  if (hours < 24) {
    const rounded = Math.round(hours);
    return rounded === 1 ? "within about an hour" : `within about ${rounded} hours`;
  }
  const days = Math.round(hours / 24);
  return days <= 1 ? "within one business day" : `within ${days} business days`;
}

export interface CategoryOption {
  value: string;
  label: string;
  /** Optional per-category first-response target (minutes) set in ticket.general. */
  firstResponseTarget?: number;
}

/** Response window per category: category override, else the site-wide SLA. */
export function responseWindowForCategory(
  category: Pick<CategoryOption, "firstResponseTarget"> | undefined,
  slaFirstResponseMinutes: number | undefined,
): string {
  return responseWindowText(category?.firstResponseTarget ?? slaFirstResponseMinutes);
}

// ─── Attachments ─────────────────────────────────────────────────────────────

/** MIME types customers may attach (screenshots, PDFs, plain text logs). */
export const CUSTOMER_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
] as const;

/** 10 MB per file. */
export const CUSTOMER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Files per message (mirrors MAX_ATTACHMENTS in validators.ts). */
export const CUSTOMER_ATTACHMENT_MAX_COUNT = 5;

export const CUSTOMER_ATTACHMENT_NAME_MAX = 255;

export interface AttachmentMeta {
  name: string;
  mimeType: string;
  size: number;
}

/** Returns an error message, or null when the attachment is acceptable. */
export function validateAttachmentMeta(file: AttachmentMeta): string | null {
  const name = (file.name ?? "").trim();
  if (!name) return "Attachment needs a file name";
  if (name.length > CUSTOMER_ATTACHMENT_NAME_MAX) return "Attachment file name is too long";
  if (!(CUSTOMER_ATTACHMENT_TYPES as readonly string[]).includes(file.mimeType)) {
    return `${name}: use a PNG, JPG, WebP, GIF, PDF, or text file.`;
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return `${name}: the file is empty.`;
  if (file.size > CUSTOMER_ATTACHMENT_MAX_BYTES) return `${name}: keep it under 10 MB.`;
  return null;
}

export function validateAttachmentList(files: AttachmentMeta[] | undefined): string | null {
  if (!files || files.length === 0) return null;
  if (files.length > CUSTOMER_ATTACHMENT_MAX_COUNT) {
    return `Up to ${CUSTOMER_ATTACHMENT_MAX_COUNT} files per message.`;
  }
  for (const file of files) {
    const err = validateAttachmentMeta(file);
    if (err) return err;
  }
  return null;
}

// ─── Names ───────────────────────────────────────────────────────────────────

/** "Ana Rivera" -> "AR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}
