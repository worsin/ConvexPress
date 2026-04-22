/**
 * Audit Log System - Public Mutations
 *
 * One mutation:
 *   - clear: Delete audit entries older than a given date, by severity,
 *     or that have expired. Self-auditing: emits its own event BEFORE
 *     deleting to create a permanent record of the clear action.
 *
 * NOTE: There is NO create or update mutation. Audit entries are:
 *   - Created ONLY by the internal createEntry handler (via Event Dispatcher)
 *   - IMMUTABLE once written (append-only)
 *   - Deletable ONLY via clear (Administrator) or retention cleanup (cron)
 *
 * Usage:
 *   const clearAuditLog = useMutation(api.auditLogs.mutations.clear);
 *
 *   // Dry run first
 *   const preview = await clearAuditLog({
 *     mode: "before_date",
 *     beforeDate: Date.now() - 90 * 24 * 60 * 60 * 1000,
 *     dryRun: true,
 *   });
 *
 *   // Then actual clear
 *   await clearAuditLog({
 *     mode: "before_date",
 *     beforeDate: Date.now() - 90 * 24 * 60 * 60 * 1000,
 *     dryRun: false,
 *     confirmPhrase: "CONFIRM DELETE",
 *   });
 */

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SYSTEM } from "../events/constants";
import { clearArgs } from "./validators";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum age for before_date mode: 30 days */
const MIN_CLEAR_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Batch size for deletion */
const BATCH_SIZE = 100;

/** Severity levels that CAN be cleared via by_severity mode */
const CLEARABLE_SEVERITIES = new Set(["informational", "low"]);

// ─── clear ──────────────────────────────────────────────────────────────────

/**
 * Clear audit entries based on mode.
 *
 * Three modes:
 *   - "before_date": Delete entries older than a given date (min 30 days ago)
 *   - "by_severity": Delete entries of a specific severity (informational/low only)
 *   - "expired": Delete entries past their expiresAt timestamp
 *
 * Safety guards:
 *   - beforeDate must be at least 30 days in the past
 *   - Only informational and low severity can be cleared via by_severity
 *   - Critical, high, and medium severity entries are PROTECTED
 *   - Requires "CONFIRM DELETE" phrase for non-dry-run
 *   - Self-auditing: emits audit.cleared event BEFORE deleting
 *
 * Batch processing:
 *   - Deletes in batches of 100
 *   - Schedules continuation via ctx.scheduler for remaining entries
 *   - Returns the count deleted in the first batch (total count for dry run)
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const clear = mutation({
  args: clearArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // ─── 1. Authorization ─────────────────────────────────────────────
    const user = await requireCan(ctx, "audit.clear");

    const isDryRun = args.dryRun ?? false;
    const now = Date.now();

    // ─── 2. Validate based on mode ──────────────────────────────────────
    if (args.mode === "before_date") {
      if (!args.beforeDate) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "beforeDate is required for before_date mode",
        });
      }

      const minDate = now - MIN_CLEAR_AGE_MS;
      if (args.beforeDate > minDate) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "beforeDate must be at least 30 days in the past",
        });
      }
    }

    if (args.mode === "by_severity") {
      if (!args.severity) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "severity is required for by_severity mode",
        });
      }

      if (!CLEARABLE_SEVERITIES.has(args.severity)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Cannot clear "${args.severity}" severity entries. Only "informational" and "low" can be cleared.`,
        });
      }
    }

    // ─── 3. Query entries to delete ─────────────────────────────────────
    let entries;

    if (args.mode === "before_date") {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_occurred", (q: ConvexQueryBuilder) =>
          q.lt("occurredAt", args.beforeDate!),
        )
        .take(isDryRun ? 10000 : BATCH_SIZE);
    } else if (args.mode === "by_severity") {
      // Severity is validated above; narrow the type for the index query
      const sev = args.severity!;
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_severity", (q: ConvexQueryBuilder) =>
          q.eq("severity", sev),
        )
        .take(isDryRun ? 10000 : BATCH_SIZE);
    } else {
      // expired mode
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_expires", (q: ConvexQueryBuilder) => q.lt("expiresAt", now))
        .take(isDryRun ? 10000 : BATCH_SIZE);
    }

    // ─── 4. Dry run: return count without deleting ──────────────────────
    if (isDryRun) {
      // Find oldest remaining entry for context
      const oldestRemaining = await ctx.db
        .query("auditEntries")
        .withIndex("by_occurred")
        .order("asc")
        .first();

      return {
        deletedCount: entries.length,
        oldestRemaining: oldestRemaining?.occurredAt,
        isDryRun: true,
      };
    }

    // ─── 5. Require confirmation phrase ─────────────────────────────────
    if (args.confirmPhrase !== "CONFIRM DELETE") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          'Confirmation phrase must be exactly "CONFIRM DELETE"',
      });
    }

    // ─── 6. Self-audit: emit event BEFORE deleting ──────────────────────
    // This creates a permanent record of the clear action
    await emitEvent(ctx, "audit.cleared", SYSTEM.AUDIT, {
      mode: args.mode,
      count: entries.length,
      severity: args.severity,
      beforeDate: args.beforeDate,
      clearedBy: user._id,
      clearedByEmail: user.email,
    });

    // ─── 7. Delete the batch ────────────────────────────────────────────
    for (const entry of entries) {
      await ctx.db.delete("auditEntries", entry._id);
    }

    // ─── 8. Schedule continuation if needed ─────────────────────────────
    if (entries.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.auditLogs.internals.clearBatch,
        {
          mode: args.mode,
          beforeDate: args.beforeDate,
          severity: args.severity,
          deletedSoFar: entries.length,
        },
      );
    }

    // ─── 9. Find oldest remaining for context ───────────────────────────
    const oldestRemaining = await ctx.db
      .query("auditEntries")
      .withIndex("by_occurred")
      .order("asc")
      .first();

    return {
      deletedCount: entries.length,
      oldestRemaining: oldestRemaining?.occurredAt,
      isDryRun: false,
    };
  },
});
