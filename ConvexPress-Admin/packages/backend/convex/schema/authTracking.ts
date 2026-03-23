/**
 * Auth Tracking System - Schema
 *
 * Tracks failed login attempts and login security events.
 * Used for rate limiting detection, admin alerts, and the
 * user-facing session security dashboard.
 *
 * WorkOS handles actual rate-limiting and account lockout internally,
 * but SmithHarper tracks attempts for:
 *   - Admin visibility (failed login log in admin dashboard)
 *   - User-facing security page (login history + failed attempts)
 *   - Event Dispatcher wiring (auth.login_failed events)
 *   - Future: IP-based anomaly detection
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const authTrackingTables = {
  /**
   * Failed login attempts log.
   *
   * Records each failed authentication attempt with metadata.
   * Since WorkOS handles auth externally, failed attempts are recorded
   * when the client detects a WorkOS auth error and reports it back,
   * OR when the headless API returns an authentication error.
   *
   * Retention: 90 days (compliance-relevant).
   */
  failedLoginAttempts: defineTable({
    /** Email address used in the attempt */
    email: v.string(),

    /** IP address of the requester (if available) */
    ip: v.optional(v.string()),

    /** User agent string of the requester */
    userAgent: v.optional(v.string()),

    /** Failure reason code */
    reason: v.union(
      v.literal("invalid_credentials"),
      v.literal("account_locked"),
      v.literal("account_deactivated"),
      v.literal("account_banned"),
      v.literal("mfa_failed"),
      v.literal("rate_limited"),
      v.literal("unknown"),
    ),

    /** Human-readable failure description */
    description: v.optional(v.string()),

    /** Which app the attempt came from */
    app: v.union(
      v.literal("admin"),
      v.literal("website"),
      v.literal("unknown"),
    ),

    /** Convex user ID if the email matches a known user */
    userId: v.optional(v.id("users")),

    /** Whether this attempt has been reviewed by an admin */
    reviewed: v.boolean(),

    /** Timestamp of the attempt */
    attemptedAt: v.number(),

    /** TTL expiration for automatic cleanup */
    expiresAt: v.number(),
  })
    .index("by_email", ["email", "attemptedAt"])
    .index("by_ip", ["ip", "attemptedAt"])
    .index("by_userId", ["userId", "attemptedAt"])
    .index("by_attemptedAt", ["attemptedAt"])
    .index("by_reviewed", ["reviewed", "attemptedAt"])
    .index("by_expires", ["expiresAt"]),
};
