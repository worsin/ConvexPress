/**
 * RSS/Feed System - Internal Functions
 *
 * Internal helper queries used by feed HTTP actions and the fetchExternal action.
 * These are NOT client-callable -- they are only called from other server-side
 * functions via ctx.runQuery(internal.feeds.internals.xxx).
 *
 * Functions:
 *   - getSettingsForFeed      - Get feed settings (for use in actions)
 *   - getUserByIdentifier     - Look up a user by identifier string (for auth in actions)
 *   - getUserRoleLevel        - Get a user's role level (for capability checks in actions)
 *
 * WordPress equivalent: Internal helper functions called by feed template files
 */

import { lookupUserByIdentifier } from "../helpers/permissions";
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { FEED_SETTINGS_DEFAULTS, MAX_FEED_ITEM_COUNT } from "./validators";

import { tableDocs } from "../schema/tableDocs.generated";
// ─── getSettingsForFeed ─────────────────────────────────────────────────────

/**
 * Internal query to fetch feed-related settings.
 * Used by feed actions that need settings but can't use ctx.db directly.
 *
 * Returns the same merged defaults + stored values as the public
 * getFeedSettings query, but callable from internal actions.
 */
export const getSettingsForFeed = internalQuery({
  args: {},
  returns: v.object({
    siteTitle: v.string(),
    siteDescription: v.string(),
    siteUrl: v.string(),
    language: v.string(),
    feedItemCount: v.number(),
    feedContentDisplay: v.union(v.literal("full"), v.literal("summary")),
  }),
  handler: async (ctx) => {
    const general = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();

    const reading = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "reading"))
      .unique();

    const generalValues = general?.values as Record<string, unknown> | undefined;
    const readingValues = reading?.values as Record<string, unknown> | undefined;

    return {
      siteTitle:
        (generalValues?.siteTitle as string) ?? FEED_SETTINGS_DEFAULTS.siteTitle,
      siteDescription:
        (generalValues?.tagline as string) ?? FEED_SETTINGS_DEFAULTS.siteDescription,
      siteUrl:
        (generalValues?.siteUrl as string) ?? FEED_SETTINGS_DEFAULTS.siteUrl,
      language:
        (generalValues?.siteLanguage as string) ?? FEED_SETTINGS_DEFAULTS.language,
      feedItemCount: Math.min(
        MAX_FEED_ITEM_COUNT,
        Math.max(
          1,
          (readingValues?.feedItemCount as number) ?? FEED_SETTINGS_DEFAULTS.feedItemCount,
        ),
      ),
      feedContentDisplay:
        ((readingValues?.feedContentDisplay as string) === "summary" ? "summary" : "full") as
          | "full"
          | "summary",
    };
  },
});

// ─── getUserByIdentifier ────────────────────────────────────────────────────

/**
 * Look up a user by their identifier (clerkUserId or Convex _id).
 * Used by the fetchExternal action for authentication.
 */
export const getUserByIdentifier = internalQuery({
  args: { userId: v.string() },
  returns: v.union(v.null(), tableDocs.posts, tableDocs.users, tableDocs.contentPromotion_mediaUploads, tableDocs.contentPromotion_mediaRecoveryGrants, tableDocs.contentPromotion_receipts, tableDocs.locale_translation_groups, tableDocs.media, tableDocs.roles, tableDocs.wordpressSites, tableDocs.capabilities, tableDocs.events, tableDocs.eventListeners, tableDocs.terms, tableDocs.fieldGroups, tableDocs.settings, tableDocs.fieldDefinitions, tableDocs.mailingLists, tableDocs.mailingListSubscribers, tableDocs.leadMagnetDeliveries, tableDocs.forms, tableDocs.syncedBlocks, tableDocs.convexpress_managementSessions, tableDocs.syncedBlockRefreshJobs, tableDocs.reusableBlocks, tableDocs.blockDefinitions, tableDocs.comments, tableDocs.menus, tableDocs.menuItems, tableDocs.redirects, tableDocs.webhooks, tableDocs.wordpressSyncJobs, tableDocs.kb_articles, tableDocs.kb_categories, tableDocs.kb_category_deletions, tableDocs.kb_tags, tableDocs.kb_collections, tableDocs.kb_workflows, tableDocs.kb_comments, tableDocs.ticket_tickets, tableDocs.support_channels, tableDocs.recipe_categories, tableDocs.gallery_categories, tableDocs.gallery_albums, tableDocs.commerce_orders, tableDocs.form_submissions, tableDocs.form_orders, tableDocs.commerce_subscriptions, tableDocs.commerce_subscription_checkout_intents, tableDocs.commerce_subscription_invoices, tableDocs.commerce_customer_profiles, tableDocs.purchase_orders, tableDocs.commerce_products, tableDocs.commerce_product_variants, tableDocs.lms_courses, tableDocs.purchase_payments, tableDocs.commerce_product_categories, tableDocs.commerce_product_brands, tableDocs.commerce_product_tags, tableDocs.commerce_shipping_classes, tableDocs.commerce_shipping_packages, tableDocs.commerce_regions, tableDocs.commerce_sales_channels, tableDocs.commerce_customer_groups, tableDocs.commerce_dynamic_pricing_rules, tableDocs.commerce_carts, tableDocs.commerce_checkout_sessions, tableDocs.commerce_shipping_rate_quotes, tableDocs.commerce_customer_addresses, tableDocs.commerce_payment_collections, tableDocs.commerce_ship_from_locations, tableDocs.commerce_order_items, tableDocs.commerce_discount_codes, tableDocs.commerce_price_sets, tableDocs.commerce_price_lists, tableDocs.commerce_prices, tableDocs.commerce_payment_sessions, tableDocs.commerce_payment_transactions, tableDocs.commerce_cart_items, tableDocs.commerce_checkout_shipping_methods, tableDocs.commerce_payment_captures, tableDocs.commerce_return_requests, tableDocs.commerce_draft_orders, tableDocs.commerce_order_changes, tableDocs.commerce_tax_rules, tableDocs.commerce_assistant_sessions, tableDocs.commerce_assistant_messages, tableDocs.shipping_provider_connections, tableDocs.shipping_provider_accounts, tableDocs.commerce_shipments, tableDocs.commerce_shipment_labels, tableDocs.commerce_shipping_zones, tableDocs.commerce_shipping_rules, tableDocs.commerce_subscription_templates, tableDocs.commerce_bundles, tableDocs.membership_plan_benefits, tableDocs.commerce_subscription_offers, tableDocs.commerce_subscription_order_forms, tableDocs.fieldValues, tableDocs.commerce_subscription_form_submissions, tableDocs.commerce_subscription_offer_items, tableDocs.commerce_subscription_proration_events, tableDocs.commerce_subscription_items, tableDocs.commerce_subscription_coupons, tableDocs.membership_plans, tableDocs.commerce_download_tokens, tableDocs.commerce_digital_files, tableDocs.commerce_license_keys, tableDocs.commerce_review_items, tableDocs.commerce_wishlists, tableDocs.commerce_bundle_components, tableDocs.commerce_product_attributes, tableDocs.lms_certificates, tableDocs.lms_nodes, tableDocs.lms_ai_generations, tableDocs.convexpress_managementAuthorities, tableDocs.convexpress_managementBindings, tableDocs.extension_events, tableDocs.extension_event_categories, tableDocs.form_notifications, tableDocs.form_confirmations, tableDocs.form_actions, tableDocs.form_poll_rate_limits, tableDocs.form_poll_tallies, tableDocs.form_poll_votes, tableDocs.formSubmissionCounts, tableDocs.form_submission_notes, tableDocs.form_action_runs, tableDocs.form_funnel_stats, tableDocs.form_funnel_public_events, tableDocs.form_submission_attempts, tableDocs.form_security_settings, tableDocs.event_rsvp_totals, tableDocs.event_rsvp_entries, tableDocs.event_rsvp_operations, tableDocs.event_rsvp_rate_limits, tableDocs.dashboard_layouts, tableDocs.dashboard_user_layouts, tableDocs.convexpress_siteIdentity, tableDocs.convexpress_managementNonces, tableDocs.lms_course_catalog, tableDocs.lms_course_prerequisites, tableDocs.lms_curriculum_counts, tableDocs.lms_lessonVersions, tableDocs.lms_enrollments, tableDocs.lms_progress_maintenance, tableDocs.lms_progress_counts, tableDocs.lms_progress, tableDocs.lms_course_completions, tableDocs.lms_certificate_issues, tableDocs.lms_jobs, tableDocs.commerce_product_attribute_terms, tableDocs.commerce_return_items, tableDocs.commerce_return_labels, tableDocs.commerce_return_history, tableDocs.commerce_return_reasons, tableDocs.commerce_store_credit_ledger, tableDocs.commerce_bundle_selections, tableDocs.commerce_wishlist_owner_totals, tableDocs.commerce_wishlist_counts, tableDocs.commerce_wishlist_deletions, tableDocs.commerce_wishlist_items, tableDocs.commerce_review_ratings, tableDocs.commerce_review_helpful_votes, tableDocs.commerce_download_leases, tableDocs.commerce_download_log, tableDocs.commerce_license_activations, tableDocs.membership_grants, tableDocs.membership_restriction_rules, tableDocs.membership_enrollment_repairs, tableDocs.membership_access_log, tableDocs.commerce_product_subscription_overrides, tableDocs.commerce_subscription_invoice_items, tableDocs.commerce_subscription_history, tableDocs.commerce_subscription_entitlements, tableDocs.commerce_subscription_dunning_attempts, tableDocs.commerce_subscription_idempotency_keys, tableDocs.commerce_subscription_coupon_redemptions, tableDocs.commerce_subscription_pricing_card_config, tableDocs.shipping_provider_oauth_tokens, tableDocs.shipping_webhook_deliveries, tableDocs.shipping_provider_secrets, tableDocs.shipping_provider_services, tableDocs.commerce_label_batch_jobs, tableDocs.commerce_shipment_tracking_events, tableDocs.commerce_shipment_manifests, tableDocs.commerce_shipping_method_flat_rate, tableDocs.commerce_shipping_method_weight_based, tableDocs.commerce_shipping_method_dimensional, tableDocs.commerce_shipping_method_price_based, tableDocs.commerce_shipping_method_quantity_based, tableDocs.commerce_shipping_method_free, tableDocs.commerce_shipping_method_local_pickup, tableDocs.commerce_shipping_method_local_delivery, tableDocs.commerce_shipping_method_table_rate, tableDocs.commerce_rate_pipeline_runs, tableDocs.commerce_tracking_sync_log, tableDocs.commerce_address_validations, tableDocs.commerce_product_location_fulfillment, tableDocs.commerce_shipping_profiles, tableDocs.commerce_shipping_zone_methods, tableDocs.shipping_quote_diagnostics, tableDocs.commerce_product_relations, tableDocs.commerce_assistant_requests, tableDocs.commerce_shopper_memory, tableDocs.commerce_assistant_briefs, tableDocs.commerce_search_facets, tableDocs.commerce_recommendation_events, tableDocs.commerce_catalog_revisions, tableDocs.commerce_product_sales, tableDocs.commerce_product_discovery, tableDocs.commerce_order_history, tableDocs.commerce_discount_usages, tableDocs.commerce_product_sales_channels, tableDocs.commerce_customer_group_members, tableDocs.commerce_price_rules, tableDocs.commerce_applied_adjustments, tableDocs.commerce_payment_refunds, tableDocs.commerce_order_change_actions, tableDocs.commerce_shipping_methods, tableDocs.commerce_tax_classes, tableDocs.commerce_order_tax_lines, tableDocs.commerce_tax_rate_history, tableDocs.commerce_inventory_adjustments, tableDocs.commerce_inventory_levels, tableDocs.commerce_low_stock_alerts, tableDocs.commerce_stock_reservations, tableDocs.commerce_draft_order_items, tableDocs.commerce_workflow_runs, tableDocs.commerce_saved_payment_methods, tableDocs.commerce_webhook_events, tableDocs.purchase_order_lines, tableDocs.purchase_refunds, tableDocs.purchase_order_events, tableDocs.gallery_albumItems, tableDocs.recipes, tableDocs.support_deflectionLogs, tableDocs.support_inbound_events, tableDocs.ticket_messages, tableDocs.ticket_counters, tableDocs.ticket_cannedResponses, tableDocs.ticket_sessions, tableDocs.ticket_rateLimits, tableDocs.kb_search_jobs, tableDocs.kb_articleVersions, tableDocs.kb_article_category_guards, tableDocs.kb_articleTags, tableDocs.kb_relatedArticles, tableDocs.kb_collectionArticles, tableDocs.kb_templates, tableDocs.kb_articleFeedback, tableDocs.kb_bookmarks, tableDocs.kb_userProgress, tableDocs.kb_pageViews, tableDocs.kb_searchQueries, tableDocs.kb_articleWorkflows, tableDocs.kb_commentVotes, tableDocs.kb_ragChunks, tableDocs.gaCache, tableDocs.pageEvents, tableDocs.pageAnalyticsDaily, tableDocs.websiteOperatorHandoffs, tableDocs.refreshTokens, tableDocs.authSetupState, tableDocs.wpIdMappings, tableDocs.wordpressSyncReconciliationFindings, tableDocs.wordpressSyncReports, tableDocs.failedLoginAttempts, tableDocs.siteNotificationDefinitions, tableDocs.routeDefinitions, tableDocs.eventDefinitions, tableDocs.dashboardPreferences, tableDocs.apiKeys, tableDocs.webhookDeliveries, tableDocs.apiRateLimitWindows, tableDocs.sitemapCache, tableDocs.sitemapGenerationLog, tableDocs.sitemapPingLog, tableDocs.seoSettings, tableDocs.searchReindexState, tableDocs.searchIndex, tableDocs.searchQueries, tableDocs.searchSynonyms, tableDocs.notFound, tableDocs.menuLocations, tableDocs.invitations, tableDocs.revisions, tableDocs.editorLocks, tableDocs.commentMeta, tableDocs.commentLikes, tableDocs.commentFlags, tableDocs.siteNotifications, tableDocs.notificationPreferences, tableDocs.blockDefinitionVersions, tableDocs.blockDefinitionApprovals, tableDocs.syncedBlockConsumerDirty, tableDocs.syncedBlockConsumerIndex, tableDocs.syncedBlockRefreshFailures, tableDocs.syncedBlockConsumers, tableDocs.syncedBlockRevisions, tableDocs.socialFeedSources, tableDocs.mailingListConsentEvents, tableDocs.emailTemplates, tableDocs.emailQueue, tableDocs.emailUnsubscribes, tableDocs.newsletterSubscribers, tableDocs.postMeta, tableDocs.auditEntries, tableDocs.termRelationships, tableDocs.mediaMaintenance, tableDocs.mediaSizes, tableDocs.mediaMeta, tableDocs.media_reference_edges, tableDocs.media_epoch_import_receipts, tableDocs.media_epoch_claim, tableDocs.media_reference_state, tableDocs.integration_checks, tableDocs.legacyAppearanceArchives, tableDocs.appearance_drafts, tableDocs.eventListenerExecutions, tableDocs.roleChanges, tableDocs.authorPostCounts, tableDocs.locale_routing, tableDocs.locale_translations, tableDocs.contentPromotion_mediaRecoveryAudit, tableDocs.contentPromotion_mappings, tableDocs.contentPromotion_backups, tableDocs.canonicalDocumentDrafts),
  handler: async (ctx, args) => {
    const byClerk = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.userId))
      .unique();
    if (byClerk) return byClerk;

    try {
      return await ctx.db.get(args.userId as any);
    } catch {
      return null;
    }
  },
});

// ─── getUserRoleLevel ───────────────────────────────────────────────────────

/**
 * Get a user's role level (0-100) for capability checks in actions.
 * Used by the fetchExternal action to verify Administrator access.
 *
 * Resolution order:
 *   1. Direct roleId reference (new system)
 *   2. Legacy internalRole string (migration path)
 *   3. Returns 0 if no role found
 */
export const getUserRoleLevel = internalQuery({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user || user.status !== "active") return 0;

    // Try direct roleId
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (role && role.status === "active") {
        return role.level;
      }
    }

    // Try legacy internalRole
    if (user.internalRole) {
      // Map legacy roles to approximate levels
      const legacyMap: Record<string, number> = {
        administrator: 100,
        admin: 100,
        editor: 80,
        author: 60,
        contributor: 40,
        subscriber: 20,
      };
      return legacyMap[user.internalRole.toLowerCase()] ?? 0;
    }

    return 0;
  },
});
