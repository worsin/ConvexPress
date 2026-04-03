import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ─── Registration System ──────────────────────────────────────────────────────
// Expire pending invitations past their expiresAt timestamp
// Added by: Registration System Expert
crons.daily(
  "expire-invitations",
  { hourUTC: 3, minuteUTC: 0 },
  internal.registration.internals.expireOldInvitations,
);

// Cleanup expired/revoked invitations older than 90 days
// Added by: Registration System Expert
crons.weekly(
  "cleanup-old-invitations",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.registration.internals.cleanupExpiredInvitations,
);

// ─── Revision System ──────────────────────────────────────────────────────────
// Daily prune of excess manual revisions past the configured max_revisions limit.
// Processes all posts with excess revisions, deleting oldest manual revisions first.
// Autosave revisions are never pruned. When max_revisions is -1 (unlimited), skips.
// Added by: Revision System Expert (Phase 3)
crons.daily(
  "prune-revisions",
  { hourUTC: 3, minuteUTC: 30 },
  internal.revisions.internals.prune,
  {},
);

// ─── Search System ────────────────────────────────────────────────────────────
// Daily purge of old search analytics data past retention period (default 90 days).
// Processes up to 500 records per invocation to stay within mutation time limits.
// Added by: Search System Expert
crons.daily(
  "search-analytics-purge",
  { hourUTC: 3, minuteUTC: 15 },
  internal.search.internals.purgeOldAnalytics,
  {},
);

// Weekly cleanup of orphaned search index entries (content that was deleted
// but index entry remains). Processes up to 200 entries per invocation.
// Added by: Search System Expert
crons.weekly(
  "search-orphan-cleanup",
  { dayOfWeek: "monday", hourUTC: 3, minuteUTC: 30 },
  internal.search.internals.cleanupOrphanedIndex,
);

// ─── Email Notification System ────────────────────────────────────────────────
// Process batched emails every 5 minutes (picks up queued emails whose scheduledFor has passed)
// Added by: Email Notification System Expert (Phase 3)
crons.interval(
  "email-process-batched",
  { minutes: 5 },
  internal.emails.internals.processBatchedEmails,
);

// Generate weekly digest emails (comment digest + content digest)
// Runs every Monday at 8:00 AM UTC
// Added by: Email Notification System Expert (Phase 3)
crons.weekly(
  "email-weekly-digest",
  { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 },
  internal.emails.internals.generateDigest,
);

// Clean up old email queue records (sent >90 days, failed >30 days)
// Runs daily at 4:30 AM UTC, processes in batches of 100
// Added by: Email Notification System Expert (Phase 3)
crons.daily(
  "email-queue-cleanup",
  { hourUTC: 4, minuteUTC: 30 },
  internal.emails.internals.cleanupOldEmails,
);

// ─── Site Notification System ─────────────────────────────────────────────────
// Daily cleanup of expired non-persistent notifications (30-day retention).
// Processes in batches of 100 to stay within mutation time limits.
// Added by: Site Notification System Expert (Phase 3)
crons.daily(
  "site-notification-cleanup",
  { hourUTC: 3, minuteUTC: 45 },
  internal.notifications.internals.cleanupExpired,
);

// ─── Audit Log System ─────────────────────────────────────────────────────────
// Daily retention cleanup: deletes expired audit entries past their expiresAt timestamp.
// Audit entries have configurable retention based on event type (30-365 days).
// Processes in batches of 100 to avoid long-running mutations.
// Added by: Audit Log System Expert (Phase 3)
crons.daily(
  "audit-log-retention-cleanup",
  { hourUTC: 4, minuteUTC: 15 },
  internal.auditLogs.internals.retentionCleanup,
);

// ─── Sitemap System ──────────────────────────────────────────────────────────
// Regenerate stale sitemaps every 6 hours as a safety net.
// Event-driven regeneration handles most updates, but this cron catches
// any sitemaps that were marked stale but missed the debounce window.
// NOTE: Uses internalAction (not internalMutation) because sitemap
// regeneration may need to make HTTP calls (e.g., pinging search engines).
// Added by: Sitemap System Expert (Phase 5)
crons.interval(
  "sitemap-regenerate-stale",
  { hours: 6 },
  internal.sitemaps.internals.regenerateStale,
  {},
);

// ─── API System ───────────────────────────────────────────────────────────────
// Hourly: expire API keys past their expiresAt, clean stale rate limit windows
// Added by: API System Expert (Phase 5)
crons.hourly(
  "api-cleanup-expired-keys",
  { minuteUTC: 15 },
  internal.api.internals.cleanupExpiredKeys,
);

// Daily: delete webhook delivery log records older than 30 days
// Added by: API System Expert (Phase 5)
crons.daily(
  "api-cleanup-delivery-logs",
  { hourUTC: 5, minuteUTC: 0 },
  internal.api.internals.cleanupDeliveryLogs,
);

// ─── Routing System ──────────────────────────────────────────────────────────
// Daily cleanup of old/low-hit 404 entries.
// Rules: resolved > 90 days, unresolved low-hit > 30 days, enforce 10k max.
// Added by: Routing System Expert (Phase 3)
crons.daily(
  "routing-404-log-cleanup",
  { hourUTC: 4, minuteUTC: 0 },
  internal.routing.internals.cleanup404Log,
);

// ─── Event Dispatcher System ─────────────────────────────────────────────────
// Daily retention cleanup: deletes expired events and their execution records.
// Events have configurable retention via expiresAt (default 30 days, auth/role 90 days).
// Processes in batches of 100 to avoid long-running mutations.
// Added by: Event Dispatcher System Expert (Phase 1)
crons.daily(
  "event-retention-cleanup",
  { hourUTC: 2, minuteUTC: 30 },
  internal.events.internals.retentionCleanup,
);

// ─── Content Editor System ──────────────────────────────────────────────────
// Hourly cleanup of expired editor locks (locks older than 2 minutes).
// Editor locks use a 30s heartbeat; any lock not renewed for 2+ minutes is stale.
// Added by: Content Editor System Expert
crons.hourly(
  "editor-lock-cleanup",
  { minuteUTC: 45 },
  internal.editor.internals.cleanupExpiredLocks,
);

// ─── Media System ───────────────────────────────────────────────────────────
// Daily cleanup of stuck "processing" items (>2 hours) and old "failed" items (>30 days).
// Stuck items are marked as "failed"; old failed items are permanently deleted
// along with their storage files, size records, and metadata.
// Processes in batches of 50 per phase to stay within mutation time limits.
// Added by: Media System Expert (Phase 2)
crons.daily(
  "media-cleanup-expired",
  { hourUTC: 5, minuteUTC: 45 },
  internal.media.internals.cleanupExpiredMedia,
);

// ─── WordPress Sync System ──────────────────────────────────────────────────
// Hourly: check for stale running jobs (no progress for >1 hour) and mark as failed
// Added by: WordPress Sync System
crons.hourly(
  "wpsync-check-stale-jobs",
  { minuteUTC: 30 },
  internal.wordpressSync.internals.checkStaleJobs,
);

// Daily: cleanup old completed/failed/cancelled jobs older than 30 days
// Added by: WordPress Sync System
crons.daily(
  "wpsync-cleanup-old-jobs",
  { hourUTC: 6, minuteUTC: 0 },
  internal.wordpressSync.internals.cleanupOldJobs,
);

// Weekly: cleanup orphaned mappings (mappings for deleted sites)
// Added by: WordPress Sync System
crons.weekly(
  "wpsync-cleanup-orphaned-mappings",
  { dayOfWeek: "saturday", hourUTC: 6, minuteUTC: 30 },
  internal.wordpressSync.internals.cleanupOrphanedMappings,
);

// ─── Analytics System ────────────────────────────────────────────────────────
// Daily rollup: aggregate yesterday's raw pageEvents into pageAnalyticsDaily.
// Runs at 00:05 UTC to ensure the previous day's events are complete.
// Added by: Analytics System Expert
crons.daily(
  "analytics-daily-rollup",
  { hourUTC: 0, minuteUTC: 5 },
  internal.analytics.internals.rollupDailyAnalytics,
  {},
);

// Daily purge: delete raw pageEvents older than retention period (default 90 days).
// Processes in batches of 1000; reschedules itself if more remain.
// Added by: Analytics System Expert
crons.daily(
  "analytics-purge-expired",
  { hourUTC: 1, minuteUTC: 0 },
  internal.analytics.internals.purgeExpiredEvents,
  {},
);

// ─── GA4 Integration System ─────────────────────────────────────────────────
// Hourly purge of expired gaCache entries (1-hour TTL).
// Processes in batches of 100 per invocation to stay within mutation limits.
// Added by: GA4 Integration System Expert
crons.hourly(
  "ga4-purge-expired-cache",
  { minuteUTC: 5 },
  internal.ga4.internals.deleteExpiredEntries,
);

// ─── Knowledge Base System ───────────────────────────────────────────────────
// Every 5 minutes: scan and publish KB articles whose scheduledAt has passed.
// Uses publishScheduledBatch (no-args) which scans all due draft articles.
// Added by: KB System (round 3 audit fix)
crons.interval(
  "kb:publishScheduled",
  { minutes: 5 },
  internal.kb.internals.publishScheduledBatch,
  {},
);

// Daily cleanup of old page view records (90-day retention, batch 500).
// Added by: KB System (round 3 audit fix)
crons.daily(
  "kb:cleanupPageViews",
  { hourUTC: 4, minuteUTC: 0 },
  internal.kb.internals.cleanupPageViews,
  {},
);

// ─── Ticket System ───────────────────────────────────────────────────────────
// Daily: auto-close tickets that have been resolved for > autoCloseAfterDays.
// Added by: Ticket System (round 3 audit fix)
crons.daily(
  "tickets:autoCloseResolved",
  { hourUTC: 2, minuteUTC: 0 },
  internal.tickets.internals.autoCloseResolved,
  {},
);

// Daily: trigger session and rate-limit cleanup for the ticket system.
// Added by: Ticket System (round 3 audit fix)
crons.daily(
  "tickets:cleanupAll",
  { hourUTC: 3, minuteUTC: 0 },
  internal.tickets.internals.cleanupAll,
  {},
);

// ─── Support Bridge System ───────────────────────────────────────────────────
// Daily purge of deflection logs older than 90 days (batch 500, reschedules).
// Added by: Support Bridge System (round 3 audit fix)
crons.daily(
  "support:cleanupOldLogs",
  { hourUTC: 3, minuteUTC: 30 },
  internal.support.internals.cleanupOldLogs,
  {},
);

export default crons;
