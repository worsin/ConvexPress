/**
 * Ticket System Integration Reference
 *
 * This file documents all cross-system integration points for the Ticket /
 * Support system. It is a reference/seed file — NOT runtime code that runs on
 * every request.
 *
 * Capabilities to seed in Role & Capability System:
 * - ticket.view               — View own submitted tickets (website users)
 * - ticket.viewAll            — View all tickets in the admin queue
 * - ticket.respond            — Post replies to tickets as a support agent
 * - ticket.assign             — Assign or reassign tickets to agents
 * - ticket.updateStatus       — Change ticket status (open, pending, resolved, etc.)
 * - ticket.updatePriority     — Change ticket priority (low, normal, high, urgent)
 * - ticket.close              — Close resolved tickets
 * - ticket.manageCannedResponses — Create and manage canned response shortcuts
 * - ticket.viewAnalytics      — Access the ticket analytics dashboard
 * - ticket.viewInternalNotes  — Read internal (agent-only) notes on tickets
 *
 * Events emitted (defined in events/constants.ts as TICKET_EVENTS):
 * - ticket.created        — Fired when a new support ticket is submitted
 * - ticket.replied        — Fired when an agent or user posts a reply
 * - ticket.assigned       — Fired when a ticket is assigned to an agent
 * - ticket.status_changed — Fired when the ticket status changes
 * - ticket.resolved       — Fired when a ticket is marked resolved
 * - ticket.closed         — Fired when a ticket is closed
 * - ticket.rated          — Fired when a user submits a satisfaction rating
 *
 * Email templates needed (seed in Email Notification System):
 * - ticket_reply_notification — Notify the ticket submitter of a new agent reply
 * - ticket_user_reply         — Notify assigned agent(s) when the user posts a reply
 * - ticket_assigned           — Notify an agent when a ticket is assigned to them
 * - ticket_resolved           — Notify the ticket submitter that their ticket is resolved
 *                               and prompt for satisfaction rating
 *
 * Audit actions logged (via existing auditLogs/internals.ts):
 * - ticket.create             — Ticket submitted
 * - ticket.reply              — Reply posted on a ticket
 * - ticket.assign             — Ticket assigned or reassigned
 * - ticket.status_change      — Ticket status updated
 * - ticket.priority_change    — Ticket priority updated
 * - ticket.close              — Ticket closed
 * - ticket.delete             — Ticket permanently deleted
 * - ticket.canned.create      — Canned response created
 * - ticket.canned.update      — Canned response updated
 * - ticket.canned.delete      — Canned response deleted
 */

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const TICKET_CAPABILITIES = [
  { slug: "ticket.view",                 label: "View Own Tickets",              description: "View tickets submitted by the current user" },
  { slug: "ticket.viewAll",              label: "View All Tickets",              description: "View all tickets in the support queue" },
  { slug: "ticket.respond",              label: "Respond to Tickets",            description: "Post agent replies to tickets" },
  { slug: "ticket.assign",               label: "Assign Tickets",                description: "Assign or reassign tickets to support agents" },
  { slug: "ticket.updateStatus",         label: "Update Ticket Status",          description: "Change the status of a ticket" },
  { slug: "ticket.updatePriority",       label: "Update Ticket Priority",        description: "Change the priority level of a ticket" },
  { slug: "ticket.close",                label: "Close Tickets",                 description: "Close resolved or irrelevant tickets" },
  { slug: "ticket.manageCannedResponses",label: "Manage Canned Responses",       description: "Create, update, and delete canned response shortcuts" },
  { slug: "ticket.viewAnalytics",        label: "View Ticket Analytics",         description: "Access ticket analytics and performance reports" },
  { slug: "ticket.viewInternalNotes",    label: "View Internal Notes",           description: "Read agent-only internal notes on tickets" },
] as const;

// ─── Email Templates ──────────────────────────────────────────────────────────

export const TICKET_EMAIL_TEMPLATES = [
  {
    slug: "ticket_reply_notification",
    subject: "Re: [Ticket #{{ticketId}}] {{subject}}",
    description: "Sent to the ticket submitter when a support agent posts a reply",
    variables: ["userName", "ticketId", "subject", "replyExcerpt", "ticketUrl"],
  },
  {
    slug: "ticket_user_reply",
    subject: "User replied: [Ticket #{{ticketId}}] {{subject}}",
    description: "Sent to the assigned agent when the user posts a reply",
    variables: ["agentName", "ticketId", "subject", "userName", "replyExcerpt", "ticketUrl"],
  },
  {
    slug: "ticket_assigned",
    subject: "Ticket assigned to you: [#{{ticketId}}] {{subject}}",
    description: "Sent to an agent when a ticket is assigned to them",
    variables: ["agentName", "ticketId", "subject", "priority", "category", "ticketUrl"],
  },
  {
    slug: "ticket_resolved",
    subject: "Your support request has been resolved: [#{{ticketId}}]",
    description: "Sent to the ticket submitter when their ticket is resolved; prompts for satisfaction rating",
    variables: ["userName", "ticketId", "subject", "ratingUrl", "ticketUrl"],
  },
] as const;

// ─── Audit Actions ────────────────────────────────────────────────────────────

export const TICKET_AUDIT_ACTIONS = [
  "ticket.create",
  "ticket.reply",
  "ticket.assign",
  "ticket.status_change",
  "ticket.priority_change",
  "ticket.close",
  "ticket.delete",
  "ticket.canned.create",
  "ticket.canned.update",
  "ticket.canned.delete",
] as const;
