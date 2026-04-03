/**
 * Support Bridge System - Integration Reference
 *
 * Documents how the Support Bridge connects the KB System and Ticket System
 * via AI-powered deflection, a floating support widget, and deflection analytics.
 *
 * This file serves as a reference for:
 *   - Events emitted by the Support Bridge
 *   - Capabilities required for support analytics access
 *   - Integration points with KB and Ticket systems
 *   - Settings sections registered by this system
 *
 * Architecture:
 *   The Support Bridge is a thin integration layer. It NEVER modifies the KB or
 *   Ticket systems directly. It:
 *     1. Reads KB articles via Convex searchIndex (internal query)
 *     2. Reads tickets via the widget.getRecentTickets query
 *     3. Creates tickets via api.tickets.tickets.create
 *     4. Logs deflection attempts in support_deflectionLogs
 *     5. Emits events for the audit trail
 *
 * Removing this system leaves KB and Tickets fully functional.
 *
 * ─── Events Emitted ──────────────────────────────────────────────────────────
 *
 *   support.deflection_attempted
 *     Fired when an AI deflection is attempted (every generateAnswer call).
 *     Payload: { sessionId, query, kbArticleCount, aiResponseLength, responseLatencyMs }
 *
 *   support.deflection_escalated
 *     Fired when a user escalates from AI to a ticket.
 *     Payload: { sessionId, query, ticketId }
 *
 *   settings.updated (from support context)
 *     Fired when support widget or AI settings are changed.
 *     Payload: { section: "support_widget" | "support_ai", changes, updatedBy }
 *
 * ─── Capabilities Required ───────────────────────────────────────────────────
 *
 *   support.viewAnalytics
 *     Required to view deflection analytics dashboard.
 *     Fallback: Editor+ (role level 80+) via currentUserCan().
 *
 *   settings.manage
 *     Required to update widget and AI settings.
 *     Typically: Administrator only.
 *
 * ─── Settings Sections ───────────────────────────────────────────────────────
 *
 *   support_widget
 *     { isEnabled, position, greeting, offlineMessage }
 *     Controls the floating widget's visibility and content.
 *
 *   support_ai
 *     { deflectionEnabled, aiProvider, aiModel, aiApiKey, systemPrompt }
 *     Controls AI deflection behavior. aiApiKey is never returned in cleartext.
 *
 * ─── Integration Points ──────────────────────────────────────────────────────
 *
 *   KB System (read only):
 *     - internal.support.internals.searchKBArticles
 *       Searches kb_articles table via Convex searchIndex.
 *       Falls back gracefully if kb_articles table doesn't exist.
 *
 *   Ticket System (write):
 *     - api.tickets.tickets.create
 *       Called by TicketFormView in the website widget.
 *       Passes source: "widget", aiAttempted, aiQuery for tracking.
 *
 *   Settings System (read/write):
 *     - settings table, by_section index
 *       Reads "support_widget" and "support_ai" sections.
 *
 * ─── Deflection Log Retention ────────────────────────────────────────────────
 *
 *   Logs in support_deflectionLogs are retained for 90 days by default.
 *   The cleanupOldLogs internal mutation is intended to be called by a
 *   daily cron job (wired in crons.ts).
 *
 *   To register the cron, add to convex/crons.ts:
 *     crons.daily(
 *       "support-deflection-log-cleanup",
 *       { hourUTC: 3, minuteUTC: 0 },
 *       internal.support.internals.cleanupOldLogs,
 *       { batchSize: 500, retentionDays: 90 },
 *     );
 */

// This file is documentation only -- no exports.
export {};
