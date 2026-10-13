import type { RegisteredQuery, RegisteredMutation } from "convex/server";
/**
 * WordPress Sync System - Internals
 *
 * Internal functions for sync job orchestration.
 * Not callable from clients - only from other Convex functions.
 */

import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v, ConvexError, type ObjectType } from "convex/values";
import { internal } from "../_generated/api";
import type { Id, Doc, TableNames } from "../_generated/dataModel";
import { decryptSecret } from "../api/crypto_helpers";
import {
  type SyncPhase,
  type SyncError,
  type PhaseProgress,
  type ImportConfig,
  PHASE_ORDER,
  createInitialProgress,
  getNextPhase,
  shouldRunPhase,
  normalizeImportConfig,
  BATCH_DELAY_MS,
  MAX_PHASE_ERRORS,
  FINDING_CODES,
  syncPhaseValidator,
  phaseProgressValidator,
  syncErrorValidator,
  type SiteCredentials,
} from "./validators";
import { deleteDynamicWithMediaReferences, patchDynamicWithMediaReferences } from "../media/attachmentGuard";


import { tableDocs } from "../schema/tableDocs.generated";
// Environment variable for decrypting application passwords
const WP_ENCRYPTION_KEY = process.env.WP_SYNC_ENCRYPTION_KEY;
const ARTIFACT_DELETE_BATCH_SIZE = 500;

async function decryptStoredSecret(secret: string | undefined): Promise<string | undefined> {
  if (!secret) return undefined;
  if (WP_ENCRYPTION_KEY && secret.includes(":")) {
    try {
      return await decryptSecret(secret, WP_ENCRYPTION_KEY);
    } catch (error) {
      console.warn("[WP Sync] Failed to decrypt stored secret, using as-is:", error);
    }
  }
  return secret;
}

async function deleteImportArtifactsForJob(ctx: any, jobId: any) {
  let reportsDeleted = 0;
  let findingsDeleted = 0;
  let reportBatch;
  let findingBatch;

  do {
    reportBatch = await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_job", (q: any) => q.eq("jobId", jobId))
      .take(ARTIFACT_DELETE_BATCH_SIZE);

    for (const report of reportBatch) {
      await deleteDynamicWithMediaReferences(ctx, report._id);
      reportsDeleted++;
    }
  } while (reportBatch.length === ARTIFACT_DELETE_BATCH_SIZE);

  do {
    findingBatch = await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .withIndex("by_job_created", (q: any) => q.eq("jobId", jobId))
      .take(ARTIFACT_DELETE_BATCH_SIZE);

    for (const finding of findingBatch) {
      await deleteDynamicWithMediaReferences(ctx, finding._id);
      findingsDeleted++;
    }
  } while (findingBatch.length === ARTIFACT_DELETE_BATCH_SIZE);

  return { reportsDeleted, findingsDeleted };
}

// ─── Internal Queries ──────────────────────────────────────────────────────

/**
 * Get site with credentials (internal only).
 */
export const getSiteWithCredentials: RegisteredQuery<"internal", { siteId: Id<"wordpressSites"> }, Doc<"wordpressSites"> | null> = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
  },
  returns: v.union(v.null(), tableDocs.wordpressSites),
  handler: async (ctx, { siteId }) => {
    return await ctx.db.get(siteId);
  },
});

/**
 * Get job details (internal only).
 */
export const getJobInternal: RegisteredQuery<"internal", { jobId: Id<"wordpressSyncJobs"> }, Doc<"wordpressSyncJobs"> | null> = internalQuery({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  returns: v.union(v.null(), tableDocs.wordpressSyncJobs),
  handler: async (ctx, { jobId }) => {
    return await ctx.db.get(jobId);
  },
});

/**
 * Count/fetch reconciliation findings for a job (up to limit).
 */
export const countFindings: RegisteredQuery<"internal", { jobId: Id<"wordpressSyncJobs">; limit: number }, Doc<"wordpressSyncReconciliationFindings">[]> = internalQuery({
  args: { jobId: v.id("wordpressSyncJobs"), limit: v.number() },
  returns: v.array(tableDocs.wordpressSyncReconciliationFindings),
  handler: async (ctx, { jobId, limit }) => {
    return await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .withIndex("by_job_created", (q: any) => q.eq("jobId", jobId))
      .take(limit);
  },
});

/**
 * Get a batch of ID mappings for a site, paginated by wpId.
 */
export const getMappingsBatch: RegisteredQuery<"internal", { siteId: Id<"wordpressSites">; objectType: string; afterWpId: number; limit: number }, Doc<"wpIdMappings">[]> = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: v.string(),
    afterWpId: v.number(),
    limit: v.number(),
  },
  returns: v.array(tableDocs.wpIdMappings),
  handler: async (ctx, { siteId, objectType, afterWpId, limit }) => {
    return await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q: any) =>
        q.eq("siteId", siteId).eq("objectType", objectType as any).gt("wpId", afterWpId)
      )
      .take(limit);
  },
});

// ─── Collision Detection Queries ──────────────────────────────────────────

/**
 * Find a post by slug (for slug collision detection).
 */
export const findPostBySlug: RegisteredQuery<"internal", { slug: string; type?: string }, Doc<"posts"> | null> = internalQuery({
  args: { slug: v.string(), type: v.optional(v.string()) },
  returns: v.union(v.null(), tableDocs.posts),
  handler: async (ctx, { slug, type }) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_slug", (q: any) =>
        type ? q.eq("slug", slug).eq("type", type) : q.eq("slug", slug)
      )
      .first();
  },
});

/**
 * Find a user by email (for email collision detection).
 */
export const findUserByEmail: RegisteredQuery<"internal", { email: string }, Doc<"users"> | null> = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.null(), tableDocs.users),
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
  },
});

/**
 * Find a term by slug and taxonomy (for taxonomy collision detection).
 */
export const findTermBySlug: RegisteredQuery<"internal", { slug: string; taxonomy: string }, Doc<"terms"> | null> = internalQuery({
  args: { slug: v.string(), taxonomy: v.string() },
  returns: v.union(v.null(), tableDocs.terms),
  handler: async (ctx, { slug, taxonomy }) => {
    return await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q: any) =>
        q.eq("slug", slug).eq("taxonomy", taxonomy)
      )
      .first();
  },
});

/**
 * Find a menu by slug (for menu collision detection).
 */
export const findMenuBySlug: RegisteredQuery<"internal", { slug: string }, Doc<"menus"> | null> = internalQuery({
  args: { slug: v.string() },
  returns: v.union(v.null(), tableDocs.menus),
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("menus")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first();
  },
});

/**
 * Find a product by SKU (for SKU collision detection).
 */
export const findProductBySku: RegisteredQuery<"internal", { sku: string }, Doc<"commerce_products"> | null> = internalQuery({
  args: { sku: v.string() },
  returns: v.union(v.null(), tableDocs.commerce_products),
  handler: async (ctx, { sku }) => {
    return await ctx.db
      .query("commerce_products")
      .withIndex("by_sku", (q: any) => q.eq("sku", sku))
      .first();
  },
});

/**
 * Find a customer by email (for email collision detection).
 */
export const findCustomerByEmail: RegisteredQuery<"internal", { email: string }, Doc<"commerce_customer_profiles"> | null> = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.null(), tableDocs.commerce_customer_profiles),
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("commerce_customer_profiles")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
  },
});

/**
 * Find an order by orderNumber (for order number collision detection).
 */
export const findOrderByNumber: RegisteredQuery<"internal", { orderNumber: string }, Doc<"commerce_orders"> | null> = internalQuery({
  args: { orderNumber: v.string() },
  returns: v.union(v.null(), tableDocs.commerce_orders),
  handler: async (ctx, { orderNumber }) => {
    return await ctx.db
      .query("commerce_orders")
      .withIndex("by_orderNumber", (q: any) => q.eq("orderNumber", orderNumber))
      .first();
  },
});

/**
 * Find a discount code by code (for coupon code collision detection).
 */
export const findDiscountByCode: RegisteredQuery<"internal", { code: string }, Doc<"commerce_discount_codes"> | null> = internalQuery({
  args: { code: v.string() },
  returns: v.union(v.null(), tableDocs.commerce_discount_codes),
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("commerce_discount_codes")
      .withIndex("by_code", (q: any) => q.eq("code", code))
      .first();
  },
});

/**
 * Generic entity lookup by table + ID string.
 * Used for local edit detection — fetches the local entity to compare updatedAt.
 */
export const getEntityById = internalQuery({
  args: { table: v.string(), id: v.string() },
  returns: v.union(v.null(), tableDocs.posts, tableDocs.users, tableDocs.contentPromotion_mediaUploads, tableDocs.contentPromotion_mediaRecoveryGrants, tableDocs.contentPromotion_receipts, tableDocs.locale_translation_groups, tableDocs.media, tableDocs.roles, tableDocs.wordpressSites, tableDocs.capabilities, tableDocs.events, tableDocs.eventListeners, tableDocs.terms, tableDocs.fieldGroups, tableDocs.settings, tableDocs.fieldDefinitions, tableDocs.mailingLists, tableDocs.mailingListSubscribers, tableDocs.leadMagnetDeliveries, tableDocs.forms, tableDocs.syncedBlocks, tableDocs.convexpress_managementSessions, tableDocs.syncedBlockRefreshJobs, tableDocs.reusableBlocks, tableDocs.blockDefinitions, tableDocs.comments, tableDocs.menus, tableDocs.menuItems, tableDocs.redirects, tableDocs.webhooks, tableDocs.wordpressSyncJobs, tableDocs.kb_articles, tableDocs.kb_categories, tableDocs.kb_category_deletions, tableDocs.kb_tags, tableDocs.kb_collections, tableDocs.kb_workflows, tableDocs.kb_comments, tableDocs.ticket_tickets, tableDocs.support_channels, tableDocs.recipe_categories, tableDocs.gallery_categories, tableDocs.gallery_albums, tableDocs.commerce_orders, tableDocs.form_submissions, tableDocs.form_orders, tableDocs.commerce_subscriptions, tableDocs.commerce_subscription_checkout_intents, tableDocs.commerce_subscription_invoices, tableDocs.commerce_customer_profiles, tableDocs.purchase_orders, tableDocs.commerce_products, tableDocs.commerce_product_variants, tableDocs.lms_courses, tableDocs.purchase_payments, tableDocs.commerce_product_categories, tableDocs.commerce_product_brands, tableDocs.commerce_product_tags, tableDocs.commerce_shipping_classes, tableDocs.commerce_shipping_packages, tableDocs.commerce_regions, tableDocs.commerce_sales_channels, tableDocs.commerce_customer_groups, tableDocs.commerce_dynamic_pricing_rules, tableDocs.commerce_carts, tableDocs.commerce_checkout_sessions, tableDocs.commerce_shipping_rate_quotes, tableDocs.commerce_customer_addresses, tableDocs.commerce_payment_collections, tableDocs.commerce_ship_from_locations, tableDocs.commerce_order_items, tableDocs.commerce_discount_codes, tableDocs.commerce_price_sets, tableDocs.commerce_price_lists, tableDocs.commerce_prices, tableDocs.commerce_payment_sessions, tableDocs.commerce_payment_transactions, tableDocs.commerce_cart_items, tableDocs.commerce_checkout_shipping_methods, tableDocs.commerce_payment_captures, tableDocs.commerce_return_requests, tableDocs.commerce_draft_orders, tableDocs.commerce_order_changes, tableDocs.commerce_tax_rules, tableDocs.commerce_assistant_sessions, tableDocs.commerce_assistant_messages, tableDocs.shipping_provider_connections, tableDocs.shipping_provider_accounts, tableDocs.commerce_shipments, tableDocs.commerce_shipment_labels, tableDocs.commerce_shipping_zones, tableDocs.commerce_shipping_rules, tableDocs.commerce_subscription_templates, tableDocs.commerce_bundles, tableDocs.membership_plan_benefits, tableDocs.commerce_subscription_offers, tableDocs.commerce_subscription_order_forms, tableDocs.fieldValues, tableDocs.commerce_subscription_form_submissions, tableDocs.commerce_subscription_offer_items, tableDocs.commerce_subscription_proration_events, tableDocs.commerce_subscription_items, tableDocs.commerce_subscription_coupons, tableDocs.membership_plans, tableDocs.commerce_download_tokens, tableDocs.commerce_digital_files, tableDocs.commerce_license_keys, tableDocs.commerce_review_items, tableDocs.commerce_wishlists, tableDocs.commerce_bundle_components, tableDocs.commerce_product_attributes, tableDocs.lms_certificates, tableDocs.lms_nodes, tableDocs.lms_ai_generations, tableDocs.convexpress_managementAuthorities, tableDocs.convexpress_managementBindings, tableDocs.extension_events, tableDocs.extension_event_categories, tableDocs.form_notifications, tableDocs.form_confirmations, tableDocs.form_actions, tableDocs.form_poll_rate_limits, tableDocs.form_poll_tallies, tableDocs.form_poll_votes, tableDocs.formSubmissionCounts, tableDocs.form_submission_notes, tableDocs.form_action_runs, tableDocs.form_funnel_stats, tableDocs.form_funnel_public_events, tableDocs.form_submission_attempts, tableDocs.form_security_settings, tableDocs.event_rsvp_totals, tableDocs.event_rsvp_entries, tableDocs.event_rsvp_operations, tableDocs.event_rsvp_rate_limits, tableDocs.dashboard_layouts, tableDocs.dashboard_user_layouts, tableDocs.convexpress_siteIdentity, tableDocs.convexpress_managementNonces, tableDocs.lms_course_catalog, tableDocs.lms_course_prerequisites, tableDocs.lms_curriculum_counts, tableDocs.lms_lessonVersions, tableDocs.lms_enrollments, tableDocs.lms_progress_maintenance, tableDocs.lms_progress_counts, tableDocs.lms_progress, tableDocs.lms_course_completions, tableDocs.lms_certificate_issues, tableDocs.lms_jobs, tableDocs.commerce_product_attribute_terms, tableDocs.commerce_return_items, tableDocs.commerce_return_labels, tableDocs.commerce_return_history, tableDocs.commerce_return_reasons, tableDocs.commerce_store_credit_ledger, tableDocs.commerce_bundle_selections, tableDocs.commerce_wishlist_owner_totals, tableDocs.commerce_wishlist_counts, tableDocs.commerce_wishlist_deletions, tableDocs.commerce_wishlist_items, tableDocs.commerce_review_ratings, tableDocs.commerce_review_helpful_votes, tableDocs.commerce_download_leases, tableDocs.commerce_download_log, tableDocs.commerce_license_activations, tableDocs.membership_grants, tableDocs.membership_restriction_rules, tableDocs.membership_enrollment_repairs, tableDocs.membership_access_log, tableDocs.commerce_product_subscription_overrides, tableDocs.commerce_subscription_invoice_items, tableDocs.commerce_subscription_history, tableDocs.commerce_subscription_entitlements, tableDocs.commerce_subscription_dunning_attempts, tableDocs.commerce_subscription_idempotency_keys, tableDocs.commerce_subscription_coupon_redemptions, tableDocs.commerce_subscription_pricing_card_config, tableDocs.shipping_provider_oauth_tokens, tableDocs.shipping_webhook_deliveries, tableDocs.shipping_provider_secrets, tableDocs.shipping_provider_services, tableDocs.commerce_label_batch_jobs, tableDocs.commerce_shipment_tracking_events, tableDocs.commerce_shipment_manifests, tableDocs.commerce_shipping_method_flat_rate, tableDocs.commerce_shipping_method_weight_based, tableDocs.commerce_shipping_method_dimensional, tableDocs.commerce_shipping_method_price_based, tableDocs.commerce_shipping_method_quantity_based, tableDocs.commerce_shipping_method_free, tableDocs.commerce_shipping_method_local_pickup, tableDocs.commerce_shipping_method_local_delivery, tableDocs.commerce_shipping_method_table_rate, tableDocs.commerce_rate_pipeline_runs, tableDocs.commerce_tracking_sync_log, tableDocs.commerce_address_validations, tableDocs.commerce_product_location_fulfillment, tableDocs.commerce_shipping_profiles, tableDocs.commerce_shipping_zone_methods, tableDocs.shipping_quote_diagnostics, tableDocs.commerce_product_relations, tableDocs.commerce_assistant_requests, tableDocs.commerce_shopper_memory, tableDocs.commerce_assistant_briefs, tableDocs.commerce_search_facets, tableDocs.commerce_recommendation_events, tableDocs.commerce_catalog_revisions, tableDocs.commerce_product_sales, tableDocs.commerce_product_discovery, tableDocs.commerce_order_history, tableDocs.commerce_discount_usages, tableDocs.commerce_product_sales_channels, tableDocs.commerce_customer_group_members, tableDocs.commerce_price_rules, tableDocs.commerce_applied_adjustments, tableDocs.commerce_payment_refunds, tableDocs.commerce_order_change_actions, tableDocs.commerce_shipping_methods, tableDocs.commerce_tax_classes, tableDocs.commerce_order_tax_lines, tableDocs.commerce_tax_rate_history, tableDocs.commerce_inventory_adjustments, tableDocs.commerce_inventory_levels, tableDocs.commerce_low_stock_alerts, tableDocs.commerce_stock_reservations, tableDocs.commerce_draft_order_items, tableDocs.commerce_workflow_runs, tableDocs.commerce_saved_payment_methods, tableDocs.commerce_webhook_events, tableDocs.purchase_order_lines, tableDocs.purchase_refunds, tableDocs.purchase_order_events, tableDocs.gallery_albumItems, tableDocs.recipes, tableDocs.support_deflectionLogs, tableDocs.support_inbound_events, tableDocs.ticket_messages, tableDocs.ticket_counters, tableDocs.ticket_cannedResponses, tableDocs.ticket_sessions, tableDocs.ticket_rateLimits, tableDocs.kb_search_jobs, tableDocs.kb_articleVersions, tableDocs.kb_article_category_guards, tableDocs.kb_articleTags, tableDocs.kb_relatedArticles, tableDocs.kb_collectionArticles, tableDocs.kb_templates, tableDocs.kb_articleFeedback, tableDocs.kb_bookmarks, tableDocs.kb_userProgress, tableDocs.kb_pageViews, tableDocs.kb_searchQueries, tableDocs.kb_articleWorkflows, tableDocs.kb_commentVotes, tableDocs.kb_ragChunks, tableDocs.gaCache, tableDocs.pageEvents, tableDocs.pageAnalyticsDaily, tableDocs.websiteOperatorHandoffs, tableDocs.refreshTokens, tableDocs.authSetupState, tableDocs.wpIdMappings, tableDocs.wordpressSyncReconciliationFindings, tableDocs.wordpressSyncReports, tableDocs.failedLoginAttempts, tableDocs.siteNotificationDefinitions, tableDocs.routeDefinitions, tableDocs.eventDefinitions, tableDocs.dashboardPreferences, tableDocs.apiKeys, tableDocs.webhookDeliveries, tableDocs.apiRateLimitWindows, tableDocs.sitemapCache, tableDocs.sitemapGenerationLog, tableDocs.sitemapPingLog, tableDocs.seoSettings, tableDocs.searchReindexState, tableDocs.searchIndex, tableDocs.searchQueries, tableDocs.searchSynonyms, tableDocs.notFound, tableDocs.menuLocations, tableDocs.invitations, tableDocs.revisions, tableDocs.editorLocks, tableDocs.commentMeta, tableDocs.commentLikes, tableDocs.commentFlags, tableDocs.siteNotifications, tableDocs.notificationPreferences, tableDocs.blockDefinitionVersions, tableDocs.blockDefinitionApprovals, tableDocs.syncedBlockConsumerDirty, tableDocs.syncedBlockConsumerIndex, tableDocs.syncedBlockRefreshFailures, tableDocs.syncedBlockConsumers, tableDocs.syncedBlockRevisions, tableDocs.socialFeedSources, tableDocs.mailingListConsentEvents, tableDocs.emailTemplates, tableDocs.emailQueue, tableDocs.emailUnsubscribes, tableDocs.newsletterSubscribers, tableDocs.postMeta, tableDocs.auditEntries, tableDocs.termRelationships, tableDocs.mediaMaintenance, tableDocs.mediaSizes, tableDocs.mediaMeta, tableDocs.media_reference_edges, tableDocs.media_epoch_import_receipts, tableDocs.media_epoch_claim, tableDocs.media_reference_state, tableDocs.integration_checks, tableDocs.legacyAppearanceArchives, tableDocs.appearance_drafts, tableDocs.eventListenerExecutions, tableDocs.roleChanges, tableDocs.authorPostCounts, tableDocs.locale_routing, tableDocs.locale_translations, tableDocs.contentPromotion_mediaRecoveryAudit, tableDocs.contentPromotion_mappings, tableDocs.contentPromotion_backups, tableDocs.canonicalDocumentDrafts),
  handler: async (ctx, { table, id }) => {
    try {
      return await ctx.db.get(id as any);
    } catch {
      return null;
    }
  },
});

/**
 * Generic entity patch by table + ID string.
 * Used by reconciliation phase to repair relationships.
 */
export const patchEntity = internalMutation({
  args: {
    table: v.string(),
    id: v.string(),
    fields: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, { table, id, fields }) => {
    const normalized = ctx.db.normalizeId(table as TableNames, id);
    if (!normalized) throw new ConvexError({ code: "INVALID_ENTITY_ID", message: "The reconciliation ID does not belong to the requested table." });
    // A concurrently deleted entity needs no repair. Other errors must abort the
    // transaction so unavailable attachments never appear successfully repaired.
    if (!await ctx.db.get(normalized)) return;
    await patchDynamicWithMediaReferences(ctx, normalized, fields);
  },
});

/**
 * Get media mappings that have sourceUrl populated.
 * Used by reconciliation phase to build URL rewrite maps.
 */
export const getMediaMappingsWithUrls = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    limit: v.number(),
  },
  handler: async (ctx, { siteId, limit }) => {
    const all = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q: any) =>
        q.eq("siteId", siteId).eq("objectType", "media")
      )
      .take(limit);
    const mediaMappings = all.filter((m: any) =>
      m.objectType === "media" && (m.sourceUrl || (Array.isArray(m.sourceUrls) && m.sourceUrls.length > 0))
    );

    const result = [];
    for (const mapping of mediaMappings) {
      const media = await ctx.db.get(mapping.convexId as Id<"media">);
      if (!media) continue;
      result.push({
        convexId: mapping.convexId,
        sourceUrl: mapping.sourceUrl,
        sourceUrls: mapping.sourceUrls,
        url: media.url,
      });
    }

    return result;
  },
});

// ─── Internal Mutations ────────────────────────────────────────────────────

/**
 * Initialize job progress with content counts.
 */
const initializeProgressArgs = {
    jobId: v.id("wordpressSyncJobs"),
    counts: v.object({
      users: v.number(),
      posts: v.number(),
      pages: v.number(),
      categories: v.number(),
      tags: v.number(),
      media: v.number(),
      comments: v.number(),
    }),
  };
export const initializeProgress: RegisteredMutation<"internal", { jobId: Id<"wordpressSyncJobs">; counts: { users: number; posts: number; pages: number; categories: number; tags: number; media: number; comments: number } }, void> = internalMutation({
  args: initializeProgressArgs,
  returns: v.null(),
  handler: async (ctx, { jobId, counts }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    const progress = { ...createInitialProgress(), ...job.progress };
    progress.users.total = counts.users;
    progress.posts.total = counts.posts;
    progress.pages.total = counts.pages;
    progress.categories.total = counts.categories;
    progress.tags.total = counts.tags;
    progress.media.total = counts.media;
    progress.comments.total = counts.comments;
    // Menus count will be fetched during menus phase

    await ctx.db.patch("wordpressSyncJobs", jobId, {
      progress,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update progress for a specific phase.
 */
const updatePhaseProgressArgs = {
    jobId: v.id("wordpressSyncJobs"),
    phase: v.string(),
    progress: phaseProgressValidator,
  };
export const updatePhaseProgress: RegisteredMutation<"internal", ObjectType<typeof updatePhaseProgressArgs>, void> = internalMutation({
  args: updatePhaseProgressArgs,
  returns: v.null(),
  handler: async (ctx, { jobId, phase, progress }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    const updatedProgress = { ...job.progress };
    (updatedProgress as Record<string, PhaseProgress>)[phase] = progress;

    await ctx.db.patch("wordpressSyncJobs", jobId, {
      progress: updatedProgress,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Add errors to a job.
 */
const addErrorsArgs = {
    jobId: v.id("wordpressSyncJobs"),
    errors: v.array(syncErrorValidator),
  };
export const addErrors: RegisteredMutation<"internal", { jobId: Id<"wordpressSyncJobs">; errors: SyncError[] }, void> = internalMutation({
  args: addErrorsArgs,
  returns: v.null(),
  handler: async (ctx, { jobId, errors }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    await ctx.db.patch("wordpressSyncJobs", jobId, {
      errors: [...job.errors, ...errors],
      updatedAt: Date.now(),
    });
  },
});

/**
 * Advance to the next phase.
 */
const advancePhaseArgs = {
    jobId: v.id("wordpressSyncJobs"),
    phase: syncPhaseValidator,
  };
export const advancePhase: RegisteredMutation<"internal", ObjectType<typeof advancePhaseArgs>, void> = internalMutation({
  args: advancePhaseArgs,
  returns: v.null(),
  handler: async (ctx, { jobId, phase }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    await ctx.db.patch("wordpressSyncJobs", jobId, {
      currentPhase: phase,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark job as completed.
 */
const completeJobArgs = {
    jobId: v.id("wordpressSyncJobs"),
  };
export const completeJob: RegisteredMutation<"internal", ObjectType<typeof completeJobArgs>, void> = internalMutation({
  args: completeJobArgs,
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== "running") return;

    const now = Date.now();
    const failed = job.errors.length > 0 || Object.values(job.progress).some(phase => phase && phase.failed > 0);

    await ctx.db.patch("wordpressSyncJobs", jobId, {
      status: failed ? "failed" : "completed",
      completedAt: now,
      updatedAt: now,
    });

    // Update site's lastSyncAt
    if (!failed) await ctx.db.patch("wordpressSites", job.siteId, {
      lastSyncAt: now,
      updatedAt: now,
    });

    // Schedule report generation
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.generateFinalReport, { jobId });
  },
});

/**
 * Upsert a sync report for a completed job.
 * Creates on first call, patches on subsequent calls.
 */
const upsertReportArgs = {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    finalStatus: v.string(),
    detectedCapabilities: v.object({
      wpRest: v.boolean(),
      wpAuthValid: v.boolean(),
      wooRest: v.boolean(),
      wooAuthValid: v.boolean(),
      menusApi: v.boolean(),
      customMetaEndpoint: v.boolean(),
      elementorDetected: v.boolean(),
      mediaAccessible: v.boolean(),
    }),
    importConfig: v.string(),
    phaseCounts: v.string(),
    totalCounts: v.object({
      created: v.number(),
      updated: v.number(),
      skipped: v.number(),
      conflicted: v.number(),
      failed: v.number(),
    }),
    findingSummary: v.string(),
    operatorSummary: v.string(),
  };
export const upsertReport: RegisteredMutation<"internal", Omit<Doc<"wordpressSyncReports">, "_id" | "_creationTime" | "createdAt">, Id<"wordpressSyncReports">> = internalMutation({
  args: upsertReportArgs,
  returns: v.id("wordpressSyncReports"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_job", (q: any) => q.eq("jobId", args.jobId))
      .first();

    if (existing) {
      await ctx.db.patch("wordpressSyncReports", existing._id, {
        completedAt: args.completedAt,
        finalStatus: args.finalStatus,
        phaseCounts: args.phaseCounts,
        totalCounts: args.totalCounts,
        findingSummary: args.findingSummary,
        operatorSummary: args.operatorSummary,
      });
      return existing._id;
    }

    return await ctx.db.insert("wordpressSyncReports", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Insert a single reconciliation finding.
 */
const insertFindingArgs = {
    siteId: v.id("wordpressSites"),
    jobId: v.id("wordpressSyncJobs"),
    severity: v.union(v.literal("error"), v.literal("warning"), v.literal("info")),
    phase: v.string(),
    code: v.optional(v.string()),
    message: v.string(),
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    destinationTable: v.optional(v.string()),
    wpId: v.optional(v.number()),
    objectType: v.optional(v.string()),
    convexId: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  };
export const insertFinding: RegisteredMutation<"internal", Omit<Doc<"wordpressSyncReconciliationFindings">, "_id" | "_creationTime">, void> = internalMutation({
  args: insertFindingArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("wordpressSyncReconciliationFindings", args);
  },
});

/**
 * Mark job as failed.
 */
const failJobArgs = {
    jobId: v.id("wordpressSyncJobs"),
    error: v.string(),
  };
export const failJob: RegisteredMutation<"internal", ObjectType<typeof failJobArgs>, void> = internalMutation({
  args: failJobArgs,
  returns: v.null(),
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    const now = Date.now();

    // Add the fatal error
    const fatalError: SyncError = {
      phase: job.currentPhase,
      wpId: 0,
      message: error,
      timestamp: now,
    };

    await ctx.db.patch("wordpressSyncJobs", jobId, {
      status: "failed",
      errors: [...job.errors, fatalError],
      completedAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.generateFinalReport, { jobId });
  },
});

// ─── Phase Orchestration ───────────────────────────────────────────────────

/**
 * Main sync phase executor.
 * Runs the current phase, then schedules the next iteration or advances.
 */
export const runSyncPhase = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    // Get current job state
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });

    if (!job) {
      console.error(`[WP Sync] Job ${jobId} not found`);
      return;
    }

    // Check if job should continue
    if (job.status !== "running") {
      console.log(`[WP Sync] Job ${jobId} is ${job.status}, stopping`);
      return;
    }

    // Get site credentials
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, {
      siteId: job.siteId,
    });

    if (!site) {
      await ctx.runMutation(internal.wordpressSync.internals.failJob, {
        jobId,
        error: "Site not found",
      });
      return;
    }

    const decryptedPassword = await decryptStoredSecret(site.applicationPassword) ?? site.applicationPassword;
    const decryptedWooKey = await decryptStoredSecret(site.wooConsumerKey);
    const decryptedWooSecret = await decryptStoredSecret(site.wooConsumerSecret);
    const decryptedUserPasswordExportSecret = await decryptStoredSecret(
      site.userPasswordExportSecret,
    );

    const credentials: SiteCredentials = {
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: decryptedPassword,
      wooConsumerKey: decryptedWooKey,
      wooConsumerSecret: decryptedWooSecret,
      wooAuthMode: site.wooAuthMode ?? "shared",
      userPasswordExportPath: site.userPasswordExportPath,
      userPasswordExportSecret: decryptedUserPasswordExportSecret,
    };

    const phase = job.currentPhase;
    console.log(`[WP Sync] Running phase: ${phase} for job ${jobId}`);

    // Get import config (default to all-enabled if not set)
    const importConfig = normalizeImportConfig(job.importConfig);

    // Skip phases not in scope
    if (!shouldRunPhase(phase, importConfig.scope)) {
      console.log(`[WP Sync] Skipping phase ${phase} (not in scope) for job ${jobId}`);
      const nextPhase = getNextPhase(phase);
      if (nextPhase) {
        await ctx.runMutation(internal.wordpressSync.internals.advancePhase, { jobId, phase: nextPhase });
        await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.wordpressSync.internals.runSyncPhase, { jobId });
      } else {
        await ctx.runMutation(internal.wordpressSync.internals.completeJob, { jobId });
      }
      return;
    }

    try {
      // Run the appropriate phase handler
      let result: PhaseResult;

      switch (phase) {
        case "users":
          result = await ctx.runAction(internal.wordpressSync.phases.users.importBatch, {
            jobId,
            siteId: job.siteId,
            credentials,
          });
          break;

        case "taxonomies":
          result = await ctx.runAction(internal.wordpressSync.phases.taxonomies.importBatch, {
            jobId,
            siteId: job.siteId,
            credentials,
          });
          break;

        case "media":
          result = await ctx.runAction(internal.wordpressSync.phases.media.importBatch, {
            jobId,
            siteId: job.siteId,
            credentials,
          });
          break;

        case "posts":
          result = await ctx.runAction(internal.wordpressSync.phases.posts.importBatch, {
            jobId,
            siteId: job.siteId,
            credentials,
          });
          break;

        case "pages":
          result = await ctx.runAction(internal.wordpressSync.phases.pages.importBatch, {
            jobId,
            siteId: job.siteId,
            credentials,
          });
          break;

        case "comments":
          result = await ctx.runAction(internal.wordpressSync.phases.comments.importBatch, {
            jobId,
            siteId: job.siteId,
            credentials,
          });
          break;

        case "menus":
          result = await ctx.runAction(internal.wordpressSync.phases.menus.importBatch, {
            jobId,
            siteId: job.siteId,
            credentials,
          });
          break;

        case "commerceCatalog":
          result = await ctx.runAction(
            internal.wordpressSync.phases.commerceCatalog.importBatch,
            { jobId, siteId: job.siteId, credentials }
          );
          break;

        case "commerceTransactions":
          result = await ctx.runAction(
            internal.wordpressSync.phases.commerceTransactions.importBatch,
            { jobId, siteId: job.siteId, credentials }
          );
          break;

        case "reconciliation":
          result = await ctx.runAction(
            internal.wordpressSync.phases.reconciliation.runBatch,
            { jobId, siteId: job.siteId, credentials }
          );
          break;

        case "cleanup":
          result = await runCleanup(ctx, job);
          break;

        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      // Update progress
      await ctx.runMutation(internal.wordpressSync.internals.updatePhaseProgress, {
        jobId,
        phase: getProgressKey(phase),
        progress: result.progress,
      });

      // Add any errors
      if (result.errors.length > 0) {
        await ctx.runMutation(internal.wordpressSync.internals.addErrors, {
          jobId,
          errors: result.errors,
        });
      }

      // Check if we should stop due to too many errors
      const updatedJob = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
      if (updatedJob && updatedJob.errors.length >= MAX_PHASE_ERRORS * PHASE_ORDER.length) {
        await ctx.runMutation(internal.wordpressSync.internals.failJob, {
          jobId,
          error: "Too many errors, stopping sync",
        });
        return;
      }

      // Decide next action
      if (result.hasMore) {
        // Continue current phase after a brief delay
        await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.wordpressSync.internals.runSyncPhase, {
          jobId,
        });
      } else {
        // Advance to next phase
        const nextPhase = getNextPhase(phase);

        if (nextPhase) {
          await ctx.runMutation(internal.wordpressSync.internals.advancePhase, {
            jobId,
            phase: nextPhase,
          });
          await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.wordpressSync.internals.runSyncPhase, {
            jobId,
          });
        } else {
          // All phases complete
          await ctx.runMutation(internal.wordpressSync.internals.completeJob, { jobId });
        }
      }
    } catch (error) {
      console.error(`[WP Sync] Phase ${phase} failed:`, error);
      await ctx.runMutation(internal.wordpressSync.internals.failJob, {
        jobId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

// ─── Phase Result Type ─────────────────────────────────────────────────────

export interface PhaseResult {
  progress: PhaseProgress;
  errors: SyncError[];
  hasMore: boolean;
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Map phase name to progress key (handles taxonomies split).
 */
function getProgressKey(phase: SyncPhase): string {
  // Most phases map directly
  return phase;
}

/**
 * Run cleanup phase (finalization).
 */
async function runCleanup(
  ctx: { runMutation: typeof internalAction.prototype.handler },
  job: Doc<"wordpressSyncJobs">
): Promise<PhaseResult> {
  const tableForType: Record<string, string> = {
    user: "users",
    post: "posts",
    page: "posts",
    category: "terms",
    tag: "terms",
    media: "media",
    comment: "comments",
    menu: "menus",
    menuItem: "menuItems",
    commerceCategory: "commerce_product_categories",
    commerceProduct: "commerce_products",
    commerceProductVariant: "commerce_product_variants",
    commerceCustomer: "commerce_customer_profiles",
    commerceOrder: "commerce_orders",
    commerceOrderItem: "commerce_order_items",
    commercePaymentTransaction: "commerce_payment_transactions",
    commerceDiscount: "commerce_discount_codes",
    commerceReview: "commerce_review_items",
    commerceRefund: "commerce_payment_refunds",
  };

  const objectTypes = Object.keys(tableForType);
  const cursorBucket = 100_000_000;
  const batchSize = 100;
  const progress = { ...job.progress.cleanup };
  const cursor = progress.cursor ?? -1;
  const typeIndex = cursor < 0 ? 0 : Math.floor(cursor / cursorBucket);
  const innerWpId = cursor < 0 ? -1 : cursor % cursorBucket;

  if (typeIndex >= objectTypes.length) {
    progress.total = Math.max(progress.total, progress.imported + progress.failed);
    return { progress, errors: [], hasMore: false };
  }

  const objectType = objectTypes[typeIndex];
  const mappings = await (ctx as any).runQuery(
    internal.wordpressSync.internals.getMappingsBatch,
    {
      siteId: job.siteId,
      objectType,
      afterWpId: innerWpId,
      limit: batchSize,
    },
  );

  let checked = 0;
  let missing = 0;

  for (const mapping of mappings) {
    const table = tableForType[mapping.objectType];
    if (!table) continue;
    checked++;

    const entity = await (ctx as any).runQuery(internal.wordpressSync.internals.getEntityById, {
      table,
      id: mapping.convexId,
    });

    if (!entity) {
      missing++;
      await (ctx as any).runMutation(internal.wordpressSync.internals.insertFinding, {
        siteId: job.siteId,
        jobId: job._id,
        severity: "warning",
        phase: "cleanup",
        code: FINDING_CODES.SOURCE_OBJECT_MISSING,
        message: `Mapping for ${mapping.objectType} WP#${mapping.wpId} points to missing ${table} row ${mapping.convexId}`,
        sourceType: mapping.objectType,
        sourceId: String(mapping.wpId),
        destinationTable: table,
        wpId: mapping.wpId,
        objectType: mapping.objectType,
        convexId: mapping.convexId,
        createdAt: Date.now(),
      });
    }
  }

  let nextTypeIndex = typeIndex;
  let nextInnerWpId = innerWpId;
  if (mappings.length < batchSize) {
    nextTypeIndex++;
    nextInnerWpId = -1;
  } else {
    nextInnerWpId = mappings[mappings.length - 1].wpId;
  }

  const hasMore = nextTypeIndex < objectTypes.length;
  progress.imported += checked - missing;
  progress.failed += missing;
  progress.cursor = hasMore
    ? nextTypeIndex * cursorBucket + Math.max(0, nextInnerWpId)
    : cursor;
  progress.total = Math.max(
    progress.total,
    progress.imported + progress.failed + (hasMore ? 1 : 0),
  );

  return {
    progress,
    errors: [],
    hasMore,
  };
}

// ─── Report Generation ───────────────────────────────────────────────────────

/**
 * Generate final sync report after job completion.
 * Aggregates findings, computes totals, and stores an operator summary.
 */
export const generateFinalReport = internalAction({
  args: { jobId: v.id("wordpressSyncJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    if (!job) return;

    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId: job.siteId });
    if (!site) return;

    // Count findings by severity and code
    const findingCounts: Record<string, number> = { error: 0, warning: 0, info: 0 };
    const codeCounts: Record<string, number> = {};
    const SCAN_LIMIT = 10000;

    const findings = await ctx.runQuery(internal.wordpressSync.internals.countFindings, {
      jobId, limit: SCAN_LIMIT,
    });

    for (const f of findings) {
      findingCounts[f.severity] = (findingCounts[f.severity] || 0) + 1;
      if (f.code) codeCounts[f.code] = (codeCounts[f.code] || 0) + 1;
    }

    // Compute total counts from progress
    const progress = job.progress;
    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, totalConflicted = 0, totalFailed = 0;
    for (const p of Object.values(progress)) {
      totalCreated += (p as PhaseProgress).created || 0;
      totalUpdated += (p as PhaseProgress).updated || 0;
      totalSkipped += (p as PhaseProgress).skipped || 0;
      totalConflicted += (p as PhaseProgress).conflicted || 0;
      totalFailed += (p as PhaseProgress).failed || 0;
    }

    const importConfig = normalizeImportConfig(job.importConfig);
    const isDryRun = importConfig.behavior.dryRun;

    const summary = isDryRun
      ? `Dry run complete. Would create ${totalCreated}, update ${totalUpdated}, skip ${totalSkipped}. ${findingCounts.error} errors, ${findingCounts.warning} warnings.`
      : `Import complete. Created ${totalCreated}, updated ${totalUpdated}, skipped ${totalSkipped}, failed ${totalFailed}. ${findingCounts.error} errors, ${findingCounts.warning} warnings.`;

    const capabilities = site.capabilities ?? {
      wpRest: false, wpAuthValid: false, menusApi: false,
      woocommerceApi: false, wooAuthValid: false,
      customMetaEndpointConfigured: false, customMetaEndpointDetected: false,
      elementorDetected: false, mediaAccessible: false,
    };

    await ctx.runMutation(internal.wordpressSync.internals.upsertReport, {
      jobId,
      siteId: job.siteId,
      startedAt: job.startedAt || job.createdAt,
      completedAt: job.completedAt || Date.now(),
      finalStatus: job.status,
      detectedCapabilities: {
        wpRest: capabilities.wpRest ?? false,
        wpAuthValid: capabilities.wpAuthValid ?? false,
        wooRest: capabilities.woocommerceApi ?? false,
        wooAuthValid: capabilities.wooAuthValid ?? false,
        menusApi: capabilities.menusApi ?? false,
        customMetaEndpoint: capabilities.customMetaEndpointDetected ?? false,
        elementorDetected: capabilities.elementorDetected ?? false,
        mediaAccessible: capabilities.mediaAccessible ?? false,
      },
      importConfig: JSON.stringify(importConfig),
      phaseCounts: JSON.stringify(progress),
      totalCounts: { created: totalCreated, updated: totalUpdated, skipped: totalSkipped, conflicted: totalConflicted, failed: totalFailed },
      findingSummary: JSON.stringify({ bySeverity: findingCounts, byCode: codeCounts }),
      operatorSummary: summary,
    });
  },
});

// ─── Cron Cleanup Functions ─────────────────────────────────────────────────

/**
 * Clean up old completed/failed/cancelled jobs.
 * Jobs older than 30 days are deleted to prevent unbounded growth.
 * Runs daily.
 */
export const cleanupOldJobs = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const RETENTION_DAYS = 30;
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const BATCH_SIZE = 100;
    let deleted = 0;

    // Find old completed jobs
    const oldJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q: any) => q.eq("status", "completed"))
      .take(BATCH_SIZE);

    for (const job of oldJobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        await deleteImportArtifactsForJob(ctx, job._id);
        await ctx.db.delete("wordpressSyncJobs", job._id);
        deleted++;
      }
    }

    // Find old failed jobs
    const failedJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q: any) => q.eq("status", "failed"))
      .take(BATCH_SIZE);

    for (const job of failedJobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        await deleteImportArtifactsForJob(ctx, job._id);
        await ctx.db.delete("wordpressSyncJobs", job._id);
        deleted++;
      }
    }

    // Find old cancelled jobs
    const cancelledJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q: any) => q.eq("status", "cancelled"))
      .take(BATCH_SIZE);

    for (const job of cancelledJobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        await deleteImportArtifactsForJob(ctx, job._id);
        await ctx.db.delete("wordpressSyncJobs", job._id);
        deleted++;
      }
    }

    console.log(`[WP Sync Cleanup] Deleted ${deleted} old jobs`);
    return { deleted };
  },
});

/**
 * Clean up orphaned mappings.
 * Mappings for deleted sites are removed.
 * Runs weekly.
 */
export const cleanupOrphanedMappings = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const BATCH_SIZE = 500;
    let deleted = 0;

    // Get all site IDs
    const sites = await ctx.db.query("wordpressSites").take(1000);
    const siteIds = new Set(sites.map((s: any) => s._id));

    // Find mappings and check if their site still exists
    const mappings = await ctx.db.query("wpIdMappings").take(BATCH_SIZE);

    for (const mapping of mappings) {
      if (!siteIds.has(mapping.siteId)) {
        await ctx.db.delete("wpIdMappings", mapping._id);
        deleted++;
      }
    }

    console.log(`[WP Sync Cleanup] Deleted ${deleted} orphaned mappings`);
    return { deleted };
  },
});

/**
 * Check for stale running jobs.
 * Jobs stuck in "running" for more than 1 hour without updates are marked as failed.
 * Runs hourly.
 */
export const checkStaleJobs = internalMutation({
  args: {},
  returns: v.object({ marked: v.number() }),
  handler: async (ctx) => {
    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
    const cutoff = Date.now() - STALE_THRESHOLD_MS;
    let marked = 0;

    const runningJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q: any) => q.eq("status", "running"))
      .take(50);

    for (const job of runningJobs) {
      if (job.updatedAt < cutoff) {
        await ctx.db.patch("wordpressSyncJobs", job._id, {
          status: "failed",
          errors: [
            ...job.errors,
            {
              phase: job.currentPhase,
              wpId: 0,
              message: "Job stalled - no progress for over 1 hour",
              timestamp: Date.now(),
            },
          ],
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.generateFinalReport, {
          jobId: job._id,
        });
        marked++;
      }
    }

    console.log(`[WP Sync Cleanup] Marked ${marked} stale jobs as failed`);
    return { marked };
  },
});
