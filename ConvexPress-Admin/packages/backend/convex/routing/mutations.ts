/**
 * Routing System - Mutations
 *
 * All write operations for URL redirect management:
 *   createRedirect  - Create a new redirect rule (manual)
 *   updateRedirect  - Update an existing redirect rule
 *   deleteRedirect  - Delete a redirect rule
 *   resolve404      - Mark a 404 entry as resolved (optionally linking a redirect)
 *   dismiss404      - Dismiss a 404 entry without creating a redirect
 *   bulkDismiss404  - Bulk dismiss multiple 404 entries
 *   logNotFound     - Public 404 logger (no auth, called from ConvexPress-Website)
 *
 * Authorization:
 *   - All redirect management: requires routing.create_redirect / routing.update_redirect / routing.delete_redirect
 *   - 404 resolution: requires routing.create_redirect (Administrator only)
 *
 * Redirect loop detection and chain flattening are performed automatically.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  createRedirectArgs,
  updateRedirectArgs,
  deleteRedirectArgs,
  resolve404Args,
  dismiss404Args,
  bulkDismiss404Args,
  MAX_URL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_REGEX_LENGTH,
  MAX_REGEX_REDIRECTS,
  RESERVED_PATHS,
} from "./validators";

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validate a source URL for redirect creation/update.
 */
function validateSourceUrl(url: string): void {
  if (!url.startsWith("/")) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Source URL must start with /",
    });
  }
  if (url.includes("?")) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Source URL must not contain query strings",
    });
  }
  if (url.includes("#")) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Source URL must not contain fragments",
    });
  }
  if (url.length > MAX_URL_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Source URL must be ${MAX_URL_LENGTH} characters or fewer`,
    });
  }
  if (url.includes(" ")) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Source URL must not contain spaces",
    });
  }
  for (const reserved of RESERVED_PATHS) {
    if (url === reserved || url.startsWith(reserved + "/")) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot redirect reserved path: ${reserved}`,
      });
    }
  }
}

/**
 * Validate a target URL for redirect creation/update.
 */
function validateTargetUrl(targetUrl: string, sourceUrl: string): void {
  if (targetUrl.length > MAX_URL_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Target URL must be ${MAX_URL_LENGTH} characters or fewer`,
    });
  }
  if (targetUrl.includes("#")) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Target URL must not contain fragments",
    });
  }
  // Absolute URL validation
  if (targetUrl.startsWith("http://")) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Absolute target URLs must use HTTPS",
    });
  }
  // Must be relative (starts with /) or absolute HTTPS
  if (!targetUrl.startsWith("/") && !targetUrl.startsWith("https://")) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Target URL must be a relative path (/) or absolute HTTPS URL",
    });
  }
  // Direct loop check
  if (targetUrl === sourceUrl) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Target URL must not equal source URL (redirect loop)",
    });
  }
}

/**
 * Validate a regex pattern for redirect matching.
 */
function validateRegexPattern(pattern: string): void {
  if (pattern.length > MAX_REGEX_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Regex pattern must be ${MAX_REGEX_LENGTH} characters or fewer`,
    });
  }
  // Check for catastrophically backtracking patterns (nested quantifiers)
  if (/(\+|\*|\?)\s*(\+|\*|\?)/.test(pattern) || /\(.*(\+|\*)\)(\+|\*)/.test(pattern)) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Regex pattern contains potentially catastrophic backtracking",
    });
  }
  try {
    new RegExp(pattern);
  } catch {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Invalid regular expression pattern",
    });
  }
}

// ─── Create Redirect ────────────────────────────────────────────────────────

/**
 * Create a new manual redirect rule.
 *
 * Flow:
 *   1. Auth check: Administrator with routing.create_redirect capability
 *   2. Validate source URL
 *   3. Validate target URL
 *   4. If regex: validate pattern + check regex limit
 *   5. Check for duplicate active exact-match redirect on same source URL
 *   6. Detect redirect loops (direct and indirect)
 *   7. Flatten redirect chains (update existing redirects pointing to sourceUrl)
 *   8. Insert redirect record
 *   9. Return redirect ID
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createRedirect = mutation({
  args: createRedirectArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "routing.create_redirect");

    // ── Validate source URL ──────────────────────────────────────────────
    validateSourceUrl(args.sourceUrl);

    // ── Validate target URL ──────────────────────────────────────────────
    validateTargetUrl(args.targetUrl, args.sourceUrl);

    // ── Validate note length ─────────────────────────────────────────────
    if (args.note && args.note.length > MAX_NOTE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Note must be ${MAX_NOTE_LENGTH} characters or fewer`,
      });
    }

    // ── Validate regex pattern (if regex match type) ─────────────────────
    if (args.matchType === "regex") {
      validateRegexPattern(args.sourceUrl);

      // Check regex redirect limit
      const existingRegex = await ctx.db
        .query("redirects")
        .withIndex("by_enabled", (q: ConvexQueryBuilder) => q.eq("enabled", true))
        .collect();

      const regexCount = existingRegex.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (r) => r.matchType === "regex",
      ).length;

      if (regexCount >= MAX_REGEX_REDIRECTS) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Maximum of ${MAX_REGEX_REDIRECTS} regex redirects allowed`,
        });
      }
    }

    // ── Check for duplicate active exact-match redirect ──────────────────
    if (args.matchType === "exact") {
      const existingRedirects = await ctx.db
        .query("redirects")
        .withIndex("by_source_url", (q: ConvexQueryBuilder) => q.eq("sourceUrl", args.sourceUrl))
        .collect();

      const activeDuplicate = existingRedirects.find(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (r) => r.enabled && r.matchType === "exact",
      );

      if (activeDuplicate) {
        throw new ConvexError({
          code: "DUPLICATE",
          message: "A redirect already exists for this URL",
        });
      }
    }

    // ── Detect redirect loops ────────────────────────────────────────────
    // Check if targetUrl has an existing redirect back to sourceUrl (indirect loop)
    const targetRedirects = await ctx.db
      .query("redirects")
      .withIndex("by_source_url", (q: ConvexQueryBuilder) => q.eq("sourceUrl", args.targetUrl))
      .collect();

    const indirectLoop = targetRedirects.find(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (r) => r.enabled && r.targetUrl === args.sourceUrl,
    );

    if (indirectLoop) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "This redirect would create a loop",
      });
    }

    // ── Flatten redirect chains ──────────────────────────────────────────
    // Update any existing redirects pointing to sourceUrl to point to targetUrl
    // Uses the by_target_url index for efficient lookup instead of full table scan
    const chainingRedirects = await ctx.db
      .query("redirects")
      .withIndex("by_target_url", (q: ConvexQueryBuilder) => q.eq("targetUrl", args.sourceUrl))
      .collect();

    const now = Date.now();

    for (const redirect of chainingRedirects) {
      if (redirect.enabled) {
        await ctx.db.patch("redirects", redirect._id, {
          targetUrl: args.targetUrl,
          updatedAt: now,
          updatedBy: user._id,
        });
      }
    }

    // ── Insert redirect record ───────────────────────────────────────────
    const redirectId = await ctx.db.insert("redirects", {
      sourceUrl: args.sourceUrl,
      targetUrl: args.targetUrl,
      statusCode: args.statusCode,
      source: "manual",
      matchType: args.matchType,
      enabled: true,
      hitCount: 0,
      note: args.note?.trim(),
      createdAt: now,
      createdBy: user._id,
      updatedAt: now,
      updatedBy: user._id,
    });

    return redirectId;
  },
});

// ─── Update Redirect ────────────────────────────────────────────────────────

/**
 * Update an existing redirect rule.
 *
 * Flow:
 *   1. Auth check: Administrator with routing.update_redirect capability
 *   2. Fetch existing redirect (throw if not found)
 *   3. Validate changed fields
 *   4. If sourceUrl or targetUrl changed: re-check for loops and chains
 *   5. Patch the redirect record
 *   6. Return updated record ID
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateRedirect = mutation({
  args: updateRedirectArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "routing.update_redirect");

    // ── Fetch existing redirect ──────────────────────────────────────────
    const existing = await ctx.db.get("redirects", args.redirectId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Redirect not found",
      });
    }

    const resolvedSourceUrl = args.sourceUrl ?? existing.sourceUrl;
    const resolvedTargetUrl = args.targetUrl ?? existing.targetUrl;
    const resolvedMatchType = args.matchType ?? existing.matchType;

    // ── Validate changed source URL ──────────────────────────────────────
    if (args.sourceUrl !== undefined) {
      validateSourceUrl(args.sourceUrl);
    }

    // ── Validate changed target URL ──────────────────────────────────────
    if (args.targetUrl !== undefined || args.sourceUrl !== undefined) {
      validateTargetUrl(resolvedTargetUrl, resolvedSourceUrl);
    }

    // ── Validate note length ─────────────────────────────────────────────
    if (args.note !== undefined && args.note !== null && args.note.length > MAX_NOTE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Note must be ${MAX_NOTE_LENGTH} characters or fewer`,
      });
    }

    // ── Validate regex if match type is regex ────────────────────────────
    if (resolvedMatchType === "regex") {
      validateRegexPattern(resolvedSourceUrl);

      // If changing to regex, check limit
      if (args.matchType === "regex" && existing.matchType !== "regex") {
        const existingRegex = await ctx.db
          .query("redirects")
          .withIndex("by_enabled", (q: ConvexQueryBuilder) => q.eq("enabled", true))
          .collect();

        const regexCount = existingRegex.filter(
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
          (r) => r.matchType === "regex" && r._id !== args.redirectId,
        ).length;

        if (regexCount >= MAX_REGEX_REDIRECTS) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: `Maximum of ${MAX_REGEX_REDIRECTS} regex redirects allowed`,
          });
        }
      }
    }

    // ── Check for loops (if source or target changed) ────────────────────
    if (args.sourceUrl !== undefined || args.targetUrl !== undefined) {
      // Check for duplicate active exact-match redirect
      if (resolvedMatchType === "exact" && args.sourceUrl !== undefined) {
        const existingRedirects = await ctx.db
          .query("redirects")
          .withIndex("by_source_url", (q: ConvexQueryBuilder) =>
            q.eq("sourceUrl", resolvedSourceUrl),
          )
          .collect();

        const activeDuplicate = existingRedirects.find(
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
          (r) =>
            r.enabled &&
            r.matchType === "exact" &&
            r._id !== args.redirectId,
        );

        if (activeDuplicate) {
          throw new ConvexError({
            code: "DUPLICATE",
            message: "A redirect already exists for this URL",
          });
        }
      }

      // Detect indirect loops
      const targetRedirects = await ctx.db
        .query("redirects")
        .withIndex("by_source_url", (q: ConvexQueryBuilder) =>
          q.eq("sourceUrl", resolvedTargetUrl),
        )
        .collect();

      const indirectLoop = targetRedirects.find(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (r) => r.enabled && r.targetUrl === resolvedSourceUrl,
      );

      if (indirectLoop) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "This redirect would create a loop",
        });
      }
    }

    // ── Build patch ──────────────────────────────────────────────────────
    const now = Date.now();
    const patch: Record<string, unknown> = {
      updatedAt: now,
      updatedBy: user._id,
    };

    if (args.sourceUrl !== undefined) patch.sourceUrl = args.sourceUrl;
    if (args.targetUrl !== undefined) patch.targetUrl = args.targetUrl;
    if (args.statusCode !== undefined) patch.statusCode = args.statusCode;
    if (args.matchType !== undefined) patch.matchType = args.matchType;
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.note !== undefined) patch.note = args.note?.trim();

    await ctx.db.patch("redirects", args.redirectId, patch);

    return args.redirectId;
  },
});

// ─── Delete Redirect ────────────────────────────────────────────────────────

/**
 * Delete a redirect rule permanently.
 *
 * Flow:
 *   1. Auth check: Administrator with routing.delete_redirect capability
 *   2. Fetch existing redirect (throw if not found)
 *   3. Delete the redirect record
 *   4. Chains are already flat, so no cascading updates needed
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteRedirect = mutation({
  args: deleteRedirectArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "routing.delete_redirect");

    const existing = await ctx.db.get("redirects", args.redirectId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Redirect not found",
      });
    }

    await ctx.db.delete("redirects", args.redirectId);

    return { success: true };
  },
});

// ─── Resolve 404 ────────────────────────────────────────────────────────────

/**
 * Mark a 404 entry as resolved, optionally linking the redirect that fixes it.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const resolve404 = mutation({
  args: resolve404Args,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "routing.create_redirect");

    const entry = await ctx.db.get("notFound", args.notFoundId);
    if (!entry) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "404 entry not found",
      });
    }

    if (entry.resolved) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "This 404 entry is already resolved",
      });
    }

    const now = Date.now();
    await ctx.db.patch("notFound", args.notFoundId, {
      resolved: true,
      resolvedBy: user._id,
      resolvedAt: now,
      redirectId: args.redirectId,
    });

    return args.notFoundId;
  },
});

// ─── Dismiss 404 ────────────────────────────────────────────────────────────

/**
 * Dismiss a 404 entry without creating a redirect.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const dismiss404 = mutation({
  args: dismiss404Args,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "routing.create_redirect");

    const entry = await ctx.db.get("notFound", args.notFoundId);
    if (!entry) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "404 entry not found",
      });
    }

    const now = Date.now();
    await ctx.db.patch("notFound", args.notFoundId, {
      resolved: true,
      resolvedBy: user._id,
      resolvedAt: now,
    });

    return args.notFoundId;
  },
});

// ─── Bulk Dismiss 404 ──────────────────────────────────────────────────────

/**
 * Bulk dismiss multiple 404 entries.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const bulkDismiss404 = mutation({
  args: bulkDismiss404Args,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "routing.create_redirect");

    if (args.notFoundIds.length === 0) {
      return { dismissed: 0, skipped: 0, errors: 0 };
    }

    let dismissed = 0;
    let skipped = 0;
    let errors = 0;
    const now = Date.now();

    for (const notFoundId of args.notFoundIds) {
      try {
        const entry = await ctx.db.get("notFound", notFoundId);
        if (!entry) {
          errors++;
          continue;
        }
        if (entry.resolved) {
          skipped++;
          continue;
        }

        await ctx.db.patch("notFound", notFoundId, {
          resolved: true,
          resolvedBy: user._id,
          resolvedAt: now,
        });

        dismissed++;
      } catch {
        errors++;
      }
    }

    return { dismissed, skipped, errors };
  },
});

// ─── Public 404 Logger ──────────────────────────────────────────────────────

/**
 * Public (no-auth) mutation for the website to log 404 hits.
 *
 * This wraps the internal log404 function and makes it callable from the
 * ConvexPress-Website client. It does NOT require authentication because 404s
 * are logged for all visitors including anonymous ones.
 *
 * Basic abuse mitigation:
 *   - URL length limited to MAX_URL_LENGTH
 *   - Referrer and userAgent length limited to 1000 chars
 *   - Empty URLs rejected
 *
 * Note: For production, consider rate-limiting at the reverse proxy level.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const logNotFound = mutation({
  args: {
    url: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    referrer: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userAgent: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // Basic validation
    if (!args.url || args.url.length === 0) return;
    if (args.url.length > MAX_URL_LENGTH) return;

    const now = Date.now();

    // Truncate referrer and userAgent to prevent oversized records
    const referrer = args.referrer?.slice(0, 1000);
    const userAgent = args.userAgent?.slice(0, 1000);

    // Check for existing entry (aggregate per URL)
    const existing = await ctx.db
      .query("notFound")
      .withIndex("by_url", (q: ConvexQueryBuilder) => q.eq("url", args.url))
      .unique();

    if (existing) {
      // Aggregate: increment hit count and update metadata
      const patch: Record<string, unknown> = {
        hitCount: existing.hitCount + 1,
        lastHitAt: now,
      };
      if (referrer) patch.referrer = referrer;
      if (userAgent) patch.userAgent = userAgent;

      await ctx.db.patch("notFound", existing._id, patch);
    } else {
      // New 404 entry
      await ctx.db.insert("notFound", {
        url: args.url,
        referrer,
        userAgent,
        hitCount: 1,
        lastHitAt: now,
        resolved: false,
      });
    }
  },
});
