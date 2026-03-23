/**
 * SEO System - Public Mutations
 *
 * Four mutations for managing SEO data:
 *
 *   - updatePostSeo:   Update per-post SEO metadata in postMeta
 *   - updateGlobal:    Update a global SEO settings section
 *   - updateRobots:    Update robots.txt configuration (convenience wrapper)
 *   - generateSitemap: Trigger sitemap regeneration (delegates to Sitemap System)
 *
 * Auth model:
 *   - updatePostSeo: Requires edit_posts (own), edit_others_posts (others'),
 *     edit_published_posts (published). Uses the SEO-specific capability
 *     `seo.update_post` for the base check.
 *   - updateGlobal: Requires `seo.update_global` (Administrator only).
 *   - updateRobots: Requires `seo.update_robots` (Administrator only).
 *   - generateSitemap: Requires `seo.generate_sitemap` (Administrator only).
 *
 * Usage:
 *   // Admin post editor SEO metabox
 *   const updateSeo = useMutation(api.seo.mutations.updatePostSeo);
 *   await updateSeo({ postId, seoTitle: "My Title", seoDescription: "..." });
 *
 *   // Admin SEO settings
 *   const updateGlobal = useMutation(api.seo.mutations.updateGlobal);
 *   await updateGlobal({ key: "titles", value: JSON.stringify({...}) });
 */

import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireCan, getCurrentUser , getUserIdentifier } from "../helpers/permissions";
import { checkPostCapability } from "../helpers/postAuth";
import type { AuthUser, AuthPost } from "../helpers/postAuth";
import { emitEvent } from "../helpers/events";
import { SEO_EVENTS, SYSTEM } from "../events/constants";
import {
  updatePostSeoArgs,
  updateGlobalArgs,
  updateRobotsArgs,
  SEO_FIELD_TO_META_KEY,
  isValidUrl,
  isValidArticleType,
  isValidPageType,
  isValidScore,
  isValidSettingsKey,
} from "./validators";
import {
  parseSeoSettingsValue,
  DEFAULT_ROBOTS_SETTINGS,
} from "../helpers/seo";

// ─── updatePostSeo ──────────────────────────────────────────────────────────

/**
 * Update SEO metadata for a specific post or page.
 *
 * Upserts postMeta rows for each provided SEO field. Empty string values
 * cause the corresponding postMeta row to be deleted (reverting to defaults).
 *
 * Flow:
 *   1. Authenticate and check seo.update_post capability
 *   2. Validate the post exists
 *   3. Validate input fields (lengths, URLs, scores, schema types)
 *   4. For each provided field, upsert or delete the postMeta row
 *   5. Emit seo.meta_updated event
 *   6. Return list of updated keys
 */
export const updatePostSeo = mutation({
  args: updatePostSeoArgs,
  handler: async (ctx, args) => {
    // 1. Auth check - require seo.update_post base capability
    const user = await requireCan(ctx, "seo.update_post");

    // 2. Validate post exists
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // 2b. Granular ownership check using WordPress-style post capability logic:
    //   - Own post: needs post.update (Author+)
    //   - Others' post: needs post.update AND Editor-level (80+)
    //   - Published post by another user: same Editor+ requirement
    await checkPostCapability(
      ctx,
      user as unknown as AuthUser,
      post as unknown as AuthPost,
      "edit",
    );

    // 3. Validate inputs
    if (args.seoTitle !== undefined && args.seoTitle.length > 200) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "SEO title must not exceed 200 characters",
      });
    }

    if (args.seoDescription !== undefined && args.seoDescription.length > 500) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Meta description must not exceed 500 characters",
      });
    }

    if (args.focusKeyphrase !== undefined && args.focusKeyphrase.length > 100) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Focus keyphrase must not exceed 100 characters",
      });
    }

    if (args.canonical !== undefined && args.canonical !== "" && !isValidUrl(args.canonical)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Canonical URL must be a valid absolute URL",
      });
    }

    if (args.ogImage !== undefined && args.ogImage !== "" && !isValidUrl(args.ogImage)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "OG image must be a valid URL",
      });
    }

    if (args.twitterImage !== undefined && args.twitterImage !== "" && !isValidUrl(args.twitterImage)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Twitter image must be a valid URL",
      });
    }

    if (args.seoScore !== undefined && !isValidScore(args.seoScore)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "SEO score must be an integer between 0 and 100",
      });
    }

    if (args.readabilityScore !== undefined && !isValidScore(args.readabilityScore)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Readability score must be an integer between 0 and 100",
      });
    }

    if (args.schemaType !== undefined && args.schemaType !== "" && !isValidPageType(args.schemaType)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid schema type: "${args.schemaType}"`,
      });
    }

    if (args.schemaArticleType !== undefined && args.schemaArticleType !== "" && !isValidArticleType(args.schemaArticleType)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid article type: "${args.schemaArticleType}"`,
      });
    }

    // 4. Build field-to-value map and upsert postMeta rows
    const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
    const updatedKeys: string[] = [];

    // Helper to convert argument values to string for storage
    const fieldValues: Record<string, string | undefined> = {};

    if (args.seoTitle !== undefined) fieldValues.seoTitle = args.seoTitle.trim();
    if (args.seoDescription !== undefined) fieldValues.seoDescription = args.seoDescription.trim();
    if (args.focusKeyphrase !== undefined) fieldValues.focusKeyphrase = args.focusKeyphrase.trim();
    if (args.additionalKeyphrases !== undefined) fieldValues.additionalKeyphrases = JSON.stringify(args.additionalKeyphrases);
    if (args.canonical !== undefined) fieldValues.canonical = args.canonical.trim();
    if (args.noindex !== undefined) fieldValues.noindex = String(args.noindex);
    if (args.nofollow !== undefined) fieldValues.nofollow = String(args.nofollow);
    if (args.ogTitle !== undefined) fieldValues.ogTitle = args.ogTitle.trim();
    if (args.ogDescription !== undefined) fieldValues.ogDescription = args.ogDescription.trim();
    if (args.ogImage !== undefined) fieldValues.ogImage = args.ogImage.trim();
    if (args.twitterTitle !== undefined) fieldValues.twitterTitle = args.twitterTitle.trim();
    if (args.twitterDescription !== undefined) fieldValues.twitterDescription = args.twitterDescription.trim();
    if (args.twitterImage !== undefined) fieldValues.twitterImage = args.twitterImage.trim();
    if (args.schemaType !== undefined) fieldValues.schemaType = args.schemaType;
    if (args.schemaArticleType !== undefined) fieldValues.schemaArticleType = args.schemaArticleType;
    if (args.seoScore !== undefined) fieldValues.seoScore = String(args.seoScore);
    if (args.readabilityScore !== undefined) fieldValues.readabilityScore = String(args.readabilityScore);
    if (args.cornerstone !== undefined) fieldValues.cornerstone = String(args.cornerstone);

    // Process each field
    for (const [fieldName, stringValue] of Object.entries(fieldValues)) {
      const metaKey = SEO_FIELD_TO_META_KEY[fieldName];
      if (!metaKey) continue;

      // Find existing postMeta row
      const existing = await ctx.db
        .query("postMeta")
        .withIndex("by_post_key", (q) => q.eq("postId", args.postId).eq("key", metaKey))
        .unique();

      const oldValue = existing?.value ?? null;

      if (stringValue === "" || stringValue === undefined) {
        // Empty string: delete the row to revert to default
        if (existing) {
          await ctx.db.delete("postMeta", existing._id);
          changes.push({ field: metaKey, oldValue, newValue: null });
          updatedKeys.push(metaKey);
        }
      } else {
        // Upsert the value
        if (existing) {
          if (existing.value !== stringValue) {
            await ctx.db.patch("postMeta", existing._id, { value: stringValue });
            changes.push({ field: metaKey, oldValue, newValue: stringValue });
            updatedKeys.push(metaKey);
          }
        } else {
          await ctx.db.insert("postMeta", {
            postId: args.postId,
            key: metaKey,
            value: stringValue,
          });
          changes.push({ field: metaKey, oldValue: null, newValue: stringValue });
          updatedKeys.push(metaKey);
        }
      }
    }

    // 5. Emit event (only if changes were made)
    if (changes.length > 0) {
      await emitEvent(ctx, SEO_EVENTS.META_UPDATED, SYSTEM.SEO, {
        postId: args.postId,
        postTitle: post.title,
        changes,
      });
    }

    // 6. Return result
    return {
      success: true,
      updatedKeys,
    };
  },
});

// ─── updateGlobal ───────────────────────────────────────────────────────────

/**
 * Update a global SEO settings section.
 *
 * Accepts a key (one of 7 settings keys) and a JSON-encoded value string.
 * Validates the key and the JSON, then upserts the seoSettings row.
 *
 * Flow:
 *   1. Authenticate and check seo.update_global capability
 *   2. Validate the key is known
 *   3. Validate the value is valid JSON
 *   4. Validate the value does not exceed 10,000 characters
 *   5. Upsert the seoSettings row
 *   6. Return success
 */
export const updateGlobal = mutation({
  args: updateGlobalArgs,
  handler: async (ctx, args) => {
    // 1. Auth check
    const user = await requireCan(ctx, "seo.update_global");

    // 2. Validate key
    if (!isValidSettingsKey(args.key)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid settings key: "${args.key}"`,
      });
    }

    // 3. Validate JSON
    try {
      JSON.parse(args.value);
    } catch {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Value must be valid JSON",
      });
    }

    // 4. Validate length
    if (args.value.length > 10000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Settings value must not exceed 10,000 characters",
      });
    }

    // 5. Upsert
    const now = Date.now();
    const existing = await ctx.db
      .query("seoSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch("seoSettings", existing._id, {
        value: args.value,
        updatedAt: now,
        updatedBy: getUserIdentifier(user),
      });
    } else {
      await ctx.db.insert("seoSettings", {
        key: args.key,
        value: args.value,
        updatedAt: now,
        updatedBy: getUserIdentifier(user),
      });
    }

    return { success: true, key: args.key };
  },
});

// ─── updateRobots ───────────────────────────────────────────────────────────

/**
 * Update robots.txt configuration.
 *
 * Convenience mutation that reads the current robots settings, merges
 * provided fields, and saves back. This avoids the client needing to
 * know the full JSON structure.
 *
 * Flow:
 *   1. Authenticate and check seo.update_robots capability
 *   2. Validate custom rules length
 *   3. Read current robots settings
 *   4. Merge provided fields
 *   5. If siteNoindex changed to true, include warning in audit payload
 *   6. Save updated settings
 *   7. Return success
 */
export const updateRobots = mutation({
  args: updateRobotsArgs,
  handler: async (ctx, args) => {
    // 1. Auth check
    const user = await requireCan(ctx, "seo.update_robots");

    // 2. Validate custom rules length
    if (args.customRules !== undefined && args.customRules.length > 10000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Custom robots.txt rules must not exceed 10,000 characters",
      });
    }

    // 3. Read current settings
    const existing = await ctx.db
      .query("seoSettings")
      .withIndex("by_key", (q) => q.eq("key", "robots"))
      .unique();

    const current = parseSeoSettingsValue(
      existing?.value,
      DEFAULT_ROBOTS_SETTINGS,
    );

    // 4. Merge provided fields
    const updated = { ...current };
    if (args.customRules !== undefined) updated.customRules = args.customRules;
    if (args.siteNoindex !== undefined) updated.siteNoindex = args.siteNoindex;
    if (args.blockAiBots !== undefined) updated.blockAiBots = args.blockAiBots;

    // 5. Check for site-wide noindex change
    const noindexChanged = args.siteNoindex !== undefined && args.siteNoindex !== current.siteNoindex;
    const noindexEnabled = noindexChanged && args.siteNoindex === true;

    // 6. Save
    const now = Date.now();
    const valueJson = JSON.stringify(updated);

    if (existing) {
      await ctx.db.patch("seoSettings", existing._id, {
        value: valueJson,
        updatedAt: now,
        updatedBy: getUserIdentifier(user),
      });
    } else {
      await ctx.db.insert("seoSettings", {
        key: "robots",
        value: valueJson,
        updatedAt: now,
        updatedBy: getUserIdentifier(user),
      });
    }

    // Emit warning event if site-wide noindex was enabled
    if (noindexEnabled) {
      await emitEvent(ctx, SEO_EVENTS.META_UPDATED, SYSTEM.SEO, {
        action: "site_noindex_enabled",
        message: "CAUTION: Site-wide noindex enabled. The site will not appear in search results.",
        updatedBy: user._id,
      });
    }

    return { success: true };
  },
});

// ─── generateSitemap ────────────────────────────────────────────────────────

/**
 * Trigger sitemap regeneration.
 *
 * Delegates to the Sitemap System's internal function. This is a thin
 * wrapper that handles auth and emits the SEO event.
 *
 * Note: The actual internal.sitemap.regenerate function may not exist yet
 * (the Sitemap System may not be implemented). In that case, this mutation
 * returns a message indicating the sitemap system is not available.
 *
 * Flow:
 *   1. Authenticate and check seo.generate_sitemap capability
 *   2. Attempt to call internal.sitemap.regenerate
 *   3. Emit seo.sitemap_generated event
 *   4. Return success
 */
export const generateSitemap = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Auth check
    const user = await requireCan(ctx, "seo.generate_sitemap");

    // 2. Emit the sitemap generation event
    // The Sitemap System should have a listener for this event.
    // Rather than calling an internal function directly (which may not exist),
    // we emit an event that the Sitemap System can listen for.
    await emitEvent(ctx, SEO_EVENTS.SITEMAP_GENERATED, SYSTEM.SEO, {
      triggeredBy: user._id,
      triggeredAt: Date.now(),
      source: "manual",
    });

    return {
      success: true,
      message: "Sitemap regeneration triggered",
    };
  },
});
