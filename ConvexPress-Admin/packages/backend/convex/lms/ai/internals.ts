/**
 * AI Course Generation - internal mutations/queries.
 */

import { patchWithMediaReferences } from "../../media/attachmentGuard";
import { insertWithMediaReferences } from "../../media/attachmentGuard";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { cleanGeneratedLessonText, normalizeOutline, outlineStats, textToDoc } from "./helpers";
import { requireCourseAuthorOrEditor, requireNodeCourseAuthorOrEditor } from "../access";
import { docToText } from "../lessons/helpers";

import { tableDocs } from "../../schema/tableDocs.generated";
export const assertCourseGenerationAccess = internalQuery({
  args: { courseId: v.id("lms_courses") },
  returns: v.object({ courseId: v.id("lms_courses"), title: v.string(), authorId: v.id("users") }),
  handler: async (ctx, args) => {
    const { course } = await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.ai.generate");
    return { courseId: args.courseId, title: course.title, authorId: course.authorId };
  },
});

export const assertNodeGenerationAccess = internalQuery({
  args: { nodeId: v.id("lms_nodes") },
  returns: v.object({
    nodeId: v.id("lms_nodes"),
    courseId: v.id("lms_courses"),
    title: v.string(),
    courseTitle: v.string(),
  }),
  handler: async (ctx, args) => {
    const { course, node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.ai.generate");
    if (node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Node is not a lesson" });
    }
    return {
      nodeId: args.nodeId,
      courseId: node.courseId,
      title: node.title,
      courseTitle: course.title,
    };
  },
});

export const createJob = internalMutation({
  args: {
    courseId: v.id("lms_courses"),
    generationId: v.optional(v.id("lms_ai_generations")),
    kind: v.union(
      v.literal("outline"),
      v.literal("lesson_body"),
      v.literal("image"),
      v.literal("voiceover"),
      v.literal("captions"),
      v.literal("video"),
    ),
    targetId: v.optional(v.string()),
  },
  returns: v.id("lms_jobs"),
  handler: async (ctx, args) => {
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.ai.generate");
    return await ctx.db.insert("lms_jobs", {
      courseId: args.courseId,
      generationId: args.generationId,
      kind: args.kind,
      targetId: args.targetId,
      status: "queued",
      progress: 0,
      createdAt: Date.now(),
    });
  },
});

export const updateJob = internalMutation({
  args: {
    jobId: v.id("lms_jobs"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    progress: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: args.status,
    };
    if (args.progress !== undefined) patch.progress = args.progress;
    if (args.error !== undefined) patch.error = args.error;
    if (args.status === "running") patch.startedAt = now;
    if (args.status === "done" || args.status === "failed") patch.finishedAt = now;
    await ctx.db.patch("lms_jobs", args.jobId, patch as never);
    return { ok: true };
  },
});

export const recordOutlineGeneration = internalMutation({
  args: {
    courseId: v.id("lms_courses"),
    prompt: v.string(),
    briefJson: v.any(),
    sourcesJson: v.optional(v.any()),
    topicCount: v.number(),
    lessonCount: v.number(),
  },
  returns: v.id("lms_ai_generations"),
  handler: async (ctx, args) => {
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.ai.generate");
    const generationId = await ctx.db.insert("lms_ai_generations", {
      targetType: "course",
      targetId: String(args.courseId),
      courseId: args.courseId,
      stage: "outline",
      model: "configured-ai-provider",
      prompt: args.prompt,
      briefJson: args.briefJson,
      sourcesJson: args.sourcesJson,
      label: "ai_assisted",
      reviewStatus: "unreviewed",
      createdAt: Date.now(),
    });
    await emitEvent(ctx, LMS_EVENTS.AI_OUTLINE_GENERATED, SYSTEM.LMS, {
      courseId: args.courseId,
      generationId,
      topicCount: args.topicCount,
      lessonCount: args.lessonCount,
    });
    return generationId;
  },
});

export const recordLessonRegeneration = internalMutation({
  args: {
    courseId: v.id("lms_courses"),
    nodeId: v.id("lms_nodes"),
    prompt: v.string(),
    instructions: v.optional(v.string()),
  },
  returns: v.id("lms_ai_generations"),
  handler: async (ctx, args) => {
    await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.ai.generate");
    return await ctx.db.insert("lms_ai_generations", {
      targetType: "node",
      targetId: String(args.nodeId),
      courseId: args.courseId,
      stage: "lesson_body",
      model: "configured-ai-provider",
      prompt: args.prompt,
      briefJson: { regeneration: true, instructions: args.instructions },
      label: "ai_assisted",
      reviewStatus: "unreviewed",
      createdAt: Date.now(),
    });
  },
});

export const getLessonBodyWork = internalQuery({
  args: { generationId: v.id("lms_ai_generations") },
  returns: v.union(v.null(), v.object({
    generation: tableDocs.lms_ai_generations,
    outline: v.object({
      topics: v.array(v.object({
        title: v.optional(v.string()),
        summary: v.optional(v.string()),
        lessons: v.array(v.object({
          title: v.optional(v.string()),
          brief: v.optional(v.string()),
          outcomes: v.optional(v.array(v.string())),
          body: v.optional(v.string()),
        })),
      })),
    }),
    lessonJobs: v.array(v.object({
      job: tableDocs.lms_jobs,
      node: v.union(tableDocs.posts, tableDocs.users, tableDocs.contentPromotion_mediaUploads, tableDocs.contentPromotion_mediaRecoveryGrants, tableDocs.contentPromotion_receipts, tableDocs.locale_translation_groups, tableDocs.media, tableDocs.roles, tableDocs.wordpressSites, tableDocs.capabilities, tableDocs.events, tableDocs.eventListeners, tableDocs.terms, tableDocs.fieldGroups, tableDocs.settings, tableDocs.fieldDefinitions, tableDocs.mailingLists, tableDocs.mailingListSubscribers, tableDocs.leadMagnetDeliveries, tableDocs.forms, tableDocs.syncedBlocks, tableDocs.convexpress_managementSessions, tableDocs.syncedBlockRefreshJobs, tableDocs.reusableBlocks, tableDocs.blockDefinitions, tableDocs.comments, tableDocs.menus, tableDocs.menuItems, tableDocs.redirects, tableDocs.webhooks, tableDocs.wordpressSyncJobs, tableDocs.kb_articles, tableDocs.kb_categories, tableDocs.kb_category_deletions, tableDocs.kb_tags, tableDocs.kb_collections, tableDocs.kb_workflows, tableDocs.kb_comments, tableDocs.ticket_tickets, tableDocs.support_channels, tableDocs.recipe_categories, tableDocs.gallery_categories, tableDocs.gallery_albums, tableDocs.commerce_orders, tableDocs.form_submissions, tableDocs.form_orders, tableDocs.commerce_subscriptions, tableDocs.commerce_subscription_checkout_intents, tableDocs.commerce_subscription_invoices, tableDocs.commerce_customer_profiles, tableDocs.purchase_orders, tableDocs.commerce_products, tableDocs.commerce_product_variants, tableDocs.lms_courses, tableDocs.purchase_payments, tableDocs.commerce_product_categories, tableDocs.commerce_product_brands, tableDocs.commerce_product_tags, tableDocs.commerce_shipping_classes, tableDocs.commerce_shipping_packages, tableDocs.commerce_regions, tableDocs.commerce_sales_channels, tableDocs.commerce_customer_groups, tableDocs.commerce_dynamic_pricing_rules, tableDocs.commerce_carts, tableDocs.commerce_checkout_sessions, tableDocs.commerce_shipping_rate_quotes, tableDocs.commerce_customer_addresses, tableDocs.commerce_payment_collections, tableDocs.commerce_ship_from_locations, tableDocs.commerce_order_items, tableDocs.commerce_discount_codes, tableDocs.commerce_price_sets, tableDocs.commerce_price_lists, tableDocs.commerce_prices, tableDocs.commerce_payment_sessions, tableDocs.commerce_payment_transactions, tableDocs.commerce_cart_items, tableDocs.commerce_checkout_shipping_methods, tableDocs.commerce_payment_captures, tableDocs.commerce_return_requests, tableDocs.commerce_draft_orders, tableDocs.commerce_order_changes, tableDocs.commerce_tax_rules, tableDocs.commerce_assistant_sessions, tableDocs.commerce_assistant_messages, tableDocs.shipping_provider_connections, tableDocs.shipping_provider_accounts, tableDocs.commerce_shipments, tableDocs.commerce_shipment_labels, tableDocs.commerce_shipping_zones, tableDocs.commerce_shipping_rules, tableDocs.commerce_subscription_templates, tableDocs.commerce_bundles, tableDocs.membership_plan_benefits, tableDocs.commerce_subscription_offers, tableDocs.commerce_subscription_order_forms, tableDocs.fieldValues, tableDocs.commerce_subscription_form_submissions, tableDocs.commerce_subscription_offer_items, tableDocs.commerce_subscription_proration_events, tableDocs.commerce_subscription_items, tableDocs.commerce_subscription_coupons, tableDocs.membership_plans, tableDocs.commerce_download_tokens, tableDocs.commerce_digital_files, tableDocs.commerce_license_keys, tableDocs.commerce_review_items, tableDocs.commerce_wishlists, tableDocs.commerce_bundle_components, tableDocs.commerce_product_attributes, tableDocs.lms_certificates, tableDocs.lms_nodes, tableDocs.lms_ai_generations, tableDocs.convexpress_managementAuthorities, tableDocs.convexpress_managementBindings, tableDocs.extension_events, tableDocs.extension_event_categories, tableDocs.form_notifications, tableDocs.form_confirmations, tableDocs.form_actions, tableDocs.form_poll_rate_limits, tableDocs.form_poll_tallies, tableDocs.form_poll_votes, tableDocs.formSubmissionCounts, tableDocs.form_submission_notes, tableDocs.form_action_runs, tableDocs.form_funnel_stats, tableDocs.form_funnel_public_events, tableDocs.form_submission_attempts, tableDocs.form_security_settings, tableDocs.event_rsvp_totals, tableDocs.event_rsvp_entries, tableDocs.event_rsvp_operations, tableDocs.event_rsvp_rate_limits, tableDocs.dashboard_layouts, tableDocs.dashboard_user_layouts, tableDocs.convexpress_siteIdentity, tableDocs.convexpress_managementNonces, tableDocs.lms_course_catalog, tableDocs.lms_course_prerequisites, tableDocs.lms_curriculum_counts, tableDocs.lms_lessonVersions, tableDocs.lms_enrollments, tableDocs.lms_progress_maintenance, tableDocs.lms_progress_counts, tableDocs.lms_progress, tableDocs.lms_course_completions, tableDocs.lms_certificate_issues, tableDocs.lms_jobs, tableDocs.commerce_product_attribute_terms, tableDocs.commerce_return_items, tableDocs.commerce_return_labels, tableDocs.commerce_return_history, tableDocs.commerce_return_reasons, tableDocs.commerce_store_credit_ledger, tableDocs.commerce_bundle_selections, tableDocs.commerce_wishlist_owner_totals, tableDocs.commerce_wishlist_counts, tableDocs.commerce_wishlist_deletions, tableDocs.commerce_wishlist_items, tableDocs.commerce_review_ratings, tableDocs.commerce_review_helpful_votes, tableDocs.commerce_download_leases, tableDocs.commerce_download_log, tableDocs.commerce_license_activations, tableDocs.membership_grants, tableDocs.membership_restriction_rules, tableDocs.membership_enrollment_repairs, tableDocs.membership_access_log, tableDocs.commerce_product_subscription_overrides, tableDocs.commerce_subscription_invoice_items, tableDocs.commerce_subscription_history, tableDocs.commerce_subscription_entitlements, tableDocs.commerce_subscription_dunning_attempts, tableDocs.commerce_subscription_idempotency_keys, tableDocs.commerce_subscription_coupon_redemptions, tableDocs.commerce_subscription_pricing_card_config, tableDocs.shipping_provider_oauth_tokens, tableDocs.shipping_webhook_deliveries, tableDocs.shipping_provider_secrets, tableDocs.shipping_provider_services, tableDocs.commerce_label_batch_jobs, tableDocs.commerce_shipment_tracking_events, tableDocs.commerce_shipment_manifests, tableDocs.commerce_shipping_method_flat_rate, tableDocs.commerce_shipping_method_weight_based, tableDocs.commerce_shipping_method_dimensional, tableDocs.commerce_shipping_method_price_based, tableDocs.commerce_shipping_method_quantity_based, tableDocs.commerce_shipping_method_free, tableDocs.commerce_shipping_method_local_pickup, tableDocs.commerce_shipping_method_local_delivery, tableDocs.commerce_shipping_method_table_rate, tableDocs.commerce_rate_pipeline_runs, tableDocs.commerce_tracking_sync_log, tableDocs.commerce_address_validations, tableDocs.commerce_product_location_fulfillment, tableDocs.commerce_shipping_profiles, tableDocs.commerce_shipping_zone_methods, tableDocs.shipping_quote_diagnostics, tableDocs.commerce_product_relations, tableDocs.commerce_assistant_requests, tableDocs.commerce_shopper_memory, tableDocs.commerce_assistant_briefs, tableDocs.commerce_search_facets, tableDocs.commerce_recommendation_events, tableDocs.commerce_catalog_revisions, tableDocs.commerce_product_sales, tableDocs.commerce_product_discovery, tableDocs.commerce_order_history, tableDocs.commerce_discount_usages, tableDocs.commerce_product_sales_channels, tableDocs.commerce_customer_group_members, tableDocs.commerce_price_rules, tableDocs.commerce_applied_adjustments, tableDocs.commerce_payment_refunds, tableDocs.commerce_order_change_actions, tableDocs.commerce_shipping_methods, tableDocs.commerce_tax_classes, tableDocs.commerce_order_tax_lines, tableDocs.commerce_tax_rate_history, tableDocs.commerce_inventory_adjustments, tableDocs.commerce_inventory_levels, tableDocs.commerce_low_stock_alerts, tableDocs.commerce_stock_reservations, tableDocs.commerce_draft_order_items, tableDocs.commerce_workflow_runs, tableDocs.commerce_saved_payment_methods, tableDocs.commerce_webhook_events, tableDocs.purchase_order_lines, tableDocs.purchase_refunds, tableDocs.purchase_order_events, tableDocs.gallery_albumItems, tableDocs.recipes, tableDocs.support_deflectionLogs, tableDocs.support_inbound_events, tableDocs.ticket_messages, tableDocs.ticket_counters, tableDocs.ticket_cannedResponses, tableDocs.ticket_sessions, tableDocs.ticket_rateLimits, tableDocs.kb_search_jobs, tableDocs.kb_articleVersions, tableDocs.kb_article_category_guards, tableDocs.kb_articleTags, tableDocs.kb_relatedArticles, tableDocs.kb_collectionArticles, tableDocs.kb_templates, tableDocs.kb_articleFeedback, tableDocs.kb_bookmarks, tableDocs.kb_userProgress, tableDocs.kb_pageViews, tableDocs.kb_searchQueries, tableDocs.kb_articleWorkflows, tableDocs.kb_commentVotes, tableDocs.kb_ragChunks, tableDocs.gaCache, tableDocs.pageEvents, tableDocs.pageAnalyticsDaily, tableDocs.websiteOperatorHandoffs, tableDocs.refreshTokens, tableDocs.authSetupState, tableDocs.wpIdMappings, tableDocs.wordpressSyncReconciliationFindings, tableDocs.wordpressSyncReports, tableDocs.failedLoginAttempts, tableDocs.siteNotificationDefinitions, tableDocs.routeDefinitions, tableDocs.eventDefinitions, tableDocs.dashboardPreferences, tableDocs.apiKeys, tableDocs.webhookDeliveries, tableDocs.apiRateLimitWindows, tableDocs.sitemapCache, tableDocs.sitemapGenerationLog, tableDocs.sitemapPingLog, tableDocs.seoSettings, tableDocs.searchReindexState, tableDocs.searchIndex, tableDocs.searchQueries, tableDocs.searchSynonyms, tableDocs.notFound, tableDocs.menuLocations, tableDocs.invitations, tableDocs.revisions, tableDocs.editorLocks, tableDocs.commentMeta, tableDocs.commentLikes, tableDocs.commentFlags, tableDocs.siteNotifications, tableDocs.notificationPreferences, tableDocs.blockDefinitionVersions, tableDocs.blockDefinitionApprovals, tableDocs.syncedBlockConsumerDirty, tableDocs.syncedBlockConsumerIndex, tableDocs.syncedBlockRefreshFailures, tableDocs.syncedBlockConsumers, tableDocs.syncedBlockRevisions, tableDocs.socialFeedSources, tableDocs.mailingListConsentEvents, tableDocs.emailTemplates, tableDocs.emailQueue, tableDocs.emailUnsubscribes, tableDocs.newsletterSubscribers, tableDocs.postMeta, tableDocs.auditEntries, tableDocs.termRelationships, tableDocs.mediaMaintenance, tableDocs.mediaSizes, tableDocs.mediaMeta, tableDocs.media_reference_edges, tableDocs.media_epoch_import_receipts, tableDocs.media_epoch_claim, tableDocs.media_reference_state, tableDocs.integration_checks, tableDocs.legacyAppearanceArchives, tableDocs.appearance_drafts, tableDocs.eventListenerExecutions, tableDocs.roleChanges, tableDocs.authorPostCounts, tableDocs.locale_routing, tableDocs.locale_translations, tableDocs.contentPromotion_mediaRecoveryAudit, tableDocs.contentPromotion_mappings, tableDocs.contentPromotion_backups, tableDocs.canonicalDocumentDrafts),
    })),
  })),
  handler: async (ctx, args) => {
    const generation = await ctx.db.get(args.generationId);
    if (!generation) return null;
    const outline = normalizeOutline((generation.briefJson as any)?.outline);
    const jobs = await ctx.db
      .query("lms_jobs")
      .withIndex("by_generation", (q) => q.eq("generationId", args.generationId))
      .collect();
    const lessonJobs = [];
    for (const job of jobs.filter((job) => job.kind === "lesson_body" && job.targetId)) {
      const node = await ctx.db.get(job.targetId as any);
      if (node && node.kind === "lesson") {
        lessonJobs.push({ job, node });
      }
    }
    return { generation, outline, lessonJobs };
  },
});

export const writeLessonBody = internalMutation({
  args: {
    jobId: v.id("lms_jobs"),
    generationId: v.id("lms_ai_generations"),
    nodeId: v.id("lms_nodes"),
    bodyText: v.string(),
    prompt: v.string(),
    sourcesJson: v.optional(v.any()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    const generation = await ctx.db.get(args.generationId);
    const node = await ctx.db.get(args.nodeId);
    if (!job || !generation || !node || node.kind !== "lesson") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Lesson generation job not found" });
    }
    const now = Date.now();
    const bodyText = cleanGeneratedLessonText(args.bodyText);
    const existingBodyText = docToText(node.bodyDoc).trim();
    const changedAfterQueue =
      typeof job.createdAt === "number" &&
      typeof node.updatedAt === "number" &&
      node.updatedAt > job.createdAt;
    const canAutoApply = !existingBodyText && !changedAfterQueue;
    const childGeneration: Record<string, unknown> = {
      targetType: "node",
      targetId: String(args.nodeId),
      courseId: node.courseId,
      stage: "lesson_body",
      model: "configured-ai-provider",
      prompt: args.prompt,
      briefJson: { parentGenerationId: args.generationId, generatedBody: bodyText },
      sourcesJson: args.sourcesJson,
      label: "ai_assisted",
      reviewStatus: canAutoApply ? "reviewed" : "unreviewed",
      createdAt: now,
    };
    if (canAutoApply) {
      childGeneration.reviewedAt = now;
      if (generation.reviewedBy) childGeneration.reviewedBy = generation.reviewedBy;
      await patchWithMediaReferences<"lms_nodes">(ctx, "lms_nodes", args.nodeId, {
        bodyDoc: textToDoc(bodyText),
        updatedAt: now,
      });
    }
    await ctx.db.insert("lms_ai_generations", childGeneration as never);
    await ctx.db.patch("lms_jobs", args.jobId, {
      status: "done",
      progress: 100,
      finishedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.AI_LESSON_GENERATED, SYSTEM.LMS, {
      courseId: node.courseId,
      nodeId: args.nodeId,
      generationId: args.generationId,
      applied: canAutoApply,
    });
    return { ok: true };
  },
});

export const storeLessonBodyDraft = internalMutation({
  args: {
    jobId: v.id("lms_jobs"),
    generationId: v.id("lms_ai_generations"),
    nodeId: v.id("lms_nodes"),
    bodyText: v.string(),
    prompt: v.string(),
    sourcesJson: v.optional(v.any()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    const generation = await ctx.db.get(args.generationId);
    const node = await ctx.db.get(args.nodeId);
    if (!job || !generation || !node || node.kind !== "lesson") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Lesson generation job not found" });
    }
    if (generation.targetType !== "node" || generation.targetId !== String(args.nodeId)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Generation does not belong to this lesson.",
      });
    }
    await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.ai.generate");
    const now = Date.now();
    const bodyText = cleanGeneratedLessonText(args.bodyText);
    await ctx.db.patch("lms_ai_generations", args.generationId, {
      prompt: args.prompt,
      briefJson: {
        ...(generation.briefJson as Record<string, unknown> | undefined),
        generatedBody: bodyText,
      },
      sourcesJson: args.sourcesJson ?? generation.sourcesJson,
      reviewStatus: "unreviewed",
    });
    await ctx.db.patch("lms_jobs", args.jobId, {
      status: "done",
      progress: 100,
      finishedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.AI_LESSON_GENERATED, SYSTEM.LMS, {
      courseId: node.courseId,
      nodeId: args.nodeId,
      generationId: args.generationId,
      applied: false,
    });
    return { ok: true };
  },
});

// Backward-compatible materializer for any existing caller. New UI uses
// approveOutline, which reviews before materializing and queues lesson jobs.
export const materializeOutline = internalMutation({
  args: { courseId: v.id("lms_courses"), outline: v.any(), prompt: v.string() },
  returns: v.object({ topicCount: v.number(), lessonCount: v.number() }),
  handler: async (ctx, args): Promise<{ topicCount: number; lessonCount: number }> => {
    await requireCourseAuthorOrEditor(ctx, args.courseId, "lms.ai.generate");
    const outline = normalizeOutline(args.outline);
    const now = Date.now();
    const existingTopics = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course_kind", (q) => q.eq("courseId", args.courseId).eq("kind", "topic"))
      .collect();
    const existingLessons = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course_kind", (q) => q.eq("courseId", args.courseId).eq("kind", "lesson"))
      .collect();
    let tPos = Math.max(0, ...existingTopics.map((node) => node.position)) + 1;
    let lessonCount = 0;
    for (const topic of outline.topics) {
      const topicId: import("../../_generated/dataModel").Id<"lms_nodes"> = await insertWithMediaReferences<"lms_nodes">(ctx, "lms_nodes", {
        courseId: args.courseId,
        kind: "topic",
        title: topic.title || "Untitled topic",
        position: tPos++,
        description: topic.summary,
        createdAt: now,
        updatedAt: now,
      });
      let lPos = 1;
      for (const lesson of topic.lessons) {
        await insertWithMediaReferences<"lms_nodes">(ctx, "lms_nodes", {
          courseId: args.courseId,
          parentId: topicId,
          kind: "lesson",
          title: lesson.title || "Untitled lesson",
          position: lPos++,
          bodyDoc: lesson.body ? textToDoc(lesson.body) : undefined,
          showMarkComplete: true,
          createdAt: now,
          updatedAt: now,
        });
        lessonCount++;
      }
    }
    const stats = outlineStats(outline);
    await patchWithMediaReferences<"lms_courses">(ctx, "lms_courses", args.courseId, {
      topicCount: existingTopics.length + stats.topicCount,
      lessonCount: existingLessons.length + lessonCount,
      updatedAt: now,
    });
    await ctx.db.insert("lms_ai_generations", {
      targetType: "course",
      targetId: String(args.courseId),
      courseId: args.courseId,
      stage: "outline",
      model: "configured-ai-provider",
      prompt: args.prompt,
      briefJson: { outline },
      label: "ai_assisted",
      reviewStatus: "reviewed",
      createdAt: now,
      reviewedAt: now,
    });
    return { topicCount: stats.topicCount, lessonCount };
  },
});
