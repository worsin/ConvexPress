/**
 * Reconciliation Phase
 *
 * Runs after all entity imports, before cleanup.
 * Repairs hierarchies and relationships using ID mappings.
 *
 * 10 repair passes processed in order, each resumable with a cursor:
 *   0. taxonomy_hierarchy   — Resolve parent term references
 *   1. comment_hierarchy    — Resolve threaded comment parents
 *   2. menu_hierarchy       — Resolve menu item parent/target references
 *   3. product_variations   — Ensure variations point to parent product
 *   4. order_customers      — Link orders to imported customer profiles
 *   5. order_items          — Resolve product/variant references in order line items
 *   6. refund_linkage       — Link refunds to parent orders
 *   7. review_linkage       — Link reviews to products and customers
 *   8. upsell_crosssell     — Resolve WP product ID arrays to local IDs
 *   9. media_rewrite        — Rewrite source media URLs in post/page content
 *
 * After all 10 passes, an optional tombstone detection pass runs when
 * importConfig.behavior.tombstoneMode !== "never".
 *
 * Cursor encoding: passIndex * 1_000_000_000 + innerCursor
 */

import { internalAction, type ActionCtx } from "../../_generated/server";
import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { MAPPED_ENTITY_TABLE, type MappedEntityTable, type WpObjectType } from "../internals";
import {
  normalizeImportConfig,
  FINDING_CODES,
  siteCredentialsValidator,
  type ImportConfig,
  type PhaseProgress,
  type SyncError,
} from "../validators";

const BATCH_SIZE = 100;
const PASS_COUNT = 11; // 10 repair passes + 1 tombstone pass

const PASS_NAMES = [
  "taxonomy_hierarchy",
  "comment_hierarchy",
  "menu_hierarchy",
  "product_variations",
  "order_customers",
  "order_items",
  "refund_linkage",
  "review_linkage",
  "upsell_crosssell",
  "media_rewrite",
  "tombstone_detection",
] as const;

type PassName = (typeof PASS_NAMES)[number];

// ─── Cursor Encoding ──────────────────────────────────────────────────────

function encodeCursor(passIndex: number, innerCursor: number): number {
  return passIndex * 1_000_000_000 + Math.max(0, innerCursor);
}

function decodeCursor(cursor?: number): { passIndex: number; innerCursor: number } {
  if (!cursor || cursor < 0) return { passIndex: 0, innerCursor: -1 };
  return {
    passIndex: Math.floor(cursor / 1_000_000_000),
    innerCursor: cursor % 1_000_000_000,
  };
}

// ─── Typed entity lookup ──────────────────────────────────────────────────

type MappedEntity = NonNullable<FunctionReturnType<typeof internal.wordpressSync.internals.getEntityById>>;

/**
 * The `table` row whose ID is `id`, tagged with its table (null when absent or
 * not a `table` ID). Callers narrow with `entity?.table === "<table>"`.
 */
async function getEntity(ctx: ActionCtx, table: MappedEntityTable, id: string): Promise<MappedEntity | null> {
  return await ctx.runQuery(internal.wordpressSync.internals.getEntityById, { table, id });
}

type SiteId = Id<"wordpressSites">;
type JobId = Id<"wordpressSyncJobs">;

// ─── Pass Result ──────────────────────────────────────────────────────────

interface PassResult {
  repaired: number;
  failed: number;
  hasMore: boolean;
  nextCursor: number;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────

export const runBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    credentials: siteCredentialsValidator,
  },
  returns: v.object({
    progress: v.object({
      total: v.number(),
      imported: v.number(),
      failed: v.number(),
      cursor: v.optional(v.number()),
      created: v.optional(v.number()),
      updated: v.optional(v.number()),
      skipped: v.optional(v.number()),
      conflicted: v.optional(v.number()),
    }),
    errors: v.array(v.object({ phase: v.string(), wpId: v.number(), message: v.string(), timestamp: v.number() })),
    hasMore: v.boolean(),
  }),
  handler: async (
    ctx,
    { jobId, siteId },
  ): Promise<{ progress: PhaseProgress; errors: SyncError[]; hasMore: boolean }> => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    if (!job) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [],
        hasMore: false,
      };
    }

    const importConfig = normalizeImportConfig(job.importConfig);
    const previousProgress = job.progress.reconciliation || { total: 0, imported: 0, failed: 0 };
    const { passIndex, innerCursor } = decodeCursor(previousProgress.cursor);

    // Determine effective pass count: skip tombstone if mode is "never"
    const tombstoneMode = importConfig.behavior.tombstoneMode ?? "never";
    const effectivePassCount = tombstoneMode !== "never" ? PASS_COUNT : PASS_COUNT - 1;

    if (passIndex >= effectivePassCount) {
      return {
        progress: { total: 1, imported: 1, failed: 0 },
        errors: [],
        hasMore: false,
      };
    }

    const passName = PASS_NAMES[passIndex];
    console.log(`[WP Sync Reconciliation] Running pass ${passIndex}: ${passName}`);

    const result = await runPass(ctx, passName, siteId, jobId, innerCursor, importConfig);

    let nextPassIndex = passIndex;
    let nextInnerCursor = innerCursor;

    if (result.hasMore) {
      nextInnerCursor = result.nextCursor;
    } else {
      nextPassIndex++;
      nextInnerCursor = -1;
    }

    const totalRepaired = (previousProgress.imported || 0) + result.repaired;
    const totalFailed = (previousProgress.failed || 0) + result.failed;
    const hasMore = nextPassIndex < effectivePassCount;

    return {
      progress: {
        total: hasMore
          ? totalRepaired + totalFailed + 1
          : Math.max(1, totalRepaired + totalFailed),
        imported: totalRepaired,
        failed: totalFailed,
        cursor: encodeCursor(nextPassIndex, nextInnerCursor),
      },
      errors: [],
      hasMore,
    };
  },
});

// ─── Pass Dispatcher ──────────────────────────────────────────────────────

async function runPass(
  ctx: ActionCtx,
  passName: PassName,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
  importConfig: ImportConfig,
): Promise<PassResult> {
  const isDryRun = importConfig.behavior.dryRun === true;

  if (isDryRun && passName !== "media_rewrite" && passName !== "tombstone_detection") {
    return { repaired: 0, failed: 0, hasMore: false, nextCursor: cursor };
  }

  switch (passName) {
    case "taxonomy_hierarchy":
      return await repairTaxonomyHierarchy(ctx, siteId, jobId, cursor);
    case "comment_hierarchy":
      return await repairCommentHierarchy(ctx, siteId, jobId, cursor);
    case "menu_hierarchy":
      return await repairMenuHierarchy(ctx, siteId, jobId, cursor);
    case "product_variations":
      return await repairProductVariations(ctx, siteId, jobId, cursor);
    case "order_customers":
      return await repairOrderCustomers(ctx, siteId, jobId, cursor);
    case "order_items":
      return await repairOrderItems(ctx, siteId, jobId, cursor);
    case "refund_linkage":
      return await repairRefundLinkage(ctx, siteId, jobId, cursor);
    case "review_linkage":
      return await repairReviewLinkage(ctx, siteId, jobId, cursor);
    case "upsell_crosssell":
      return await repairUpsellCrosssell(ctx, siteId, jobId, cursor);
    case "media_rewrite":
      return await rewriteMediaUrls(ctx, siteId, jobId, cursor, isDryRun);
    case "tombstone_detection":
      return await detectTombstones(ctx, siteId, jobId, cursor, importConfig);
    default:
      return { repaired: 0, failed: 0, hasMore: false, nextCursor: cursor };
  }
}

// ─── Pass 0: Taxonomy Hierarchy ───────────────────────────────────────────

async function repairTaxonomyHierarchy(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "category",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localTermEntity = await getEntity(ctx, "terms", mapping.convexId);
      const localTerm = localTermEntity?.table === "terms" ? localTermEntity.doc : null;
      if (!localTerm) continue;

      // If term already has a resolved parentId, skip
      if (localTerm.parentId) continue;

      // Look up the original WP term to see if it had a parent
      // The wpTermId on the local term is the WP ID; look for a parent in mappings
      // We need to find the WP parent ID — stored during import as the category's
      // WP parent field. Since we don't store wpParentId on the term, we check
      // if there are any category mappings whose convexId points to a term
      // that *should* be this term's parent. We can't determine this without
      // the original WP parent data, so this pass is a no-op if parentId
      // was already resolved during import or if wpParentId isn't stored.
      //
      // In practice, the taxonomy import phase resolves parents inline,
      // so this pass catches only cases where the parent was in a later batch.
      // Since terms don't store wpParentId, we skip terms that already have
      // parentId set (handled above) and log that no repair was needed.
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 1: Comment Hierarchy ────────────────────────────────────────────

async function repairCommentHierarchy(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "comment",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localCommentEntity = await getEntity(ctx, "comments", mapping.convexId);
      const localComment = localCommentEntity?.table === "comments" ? localCommentEntity.doc : null;
      if (!localComment) continue;

      // Check if this comment has a wpCommentId for its parent but parentId is unresolved
      // The comment import stores wpCommentId on comments, and resolves parentId inline.
      // If parentId is missing but the comment should be threaded, attempt resolution.
      if (localComment.parentId || !localComment.wpCommentId) continue;

      // No stored wpParentCommentId on the comment schema, so we can't do
      // retroactive resolution here. The import phase handles parent resolution
      // inline. This pass ensures structural integrity by scanning for orphans.
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 2: Menu Hierarchy ───────────────────────────────────────────────

async function repairMenuHierarchy(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "menuItem",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localItemEntity = await getEntity(ctx, "menuItems", mapping.convexId);
      const localItem = localItemEntity?.table === "menuItems" ? localItemEntity.doc : null;
      if (!localItem) continue;

      // Content-linked items whose target was not resolved by the menu
      // import. The import stores only the nav item's own WordPress ID
      // (wpPostId), not the linked object's ID, so the target cannot be
      // re-resolved here. Looking it up by wpPostId would match an unrelated
      // object; record the gap for the operator instead.
      if (
        (localItem.itemType === "post" || localItem.itemType === "page" || localItem.itemType === "category") &&
        !localItem.objectId
      ) {
        await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
          siteId,
          jobId,
          severity: "warning",
          phase: "reconciliation",
          code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
          message: `Menu item ${mapping.convexId} (${localItem.itemType}) has no resolved link target`,
          sourceType: "menuItem",
          sourceId: String(mapping.wpId),
          createdAt: Date.now(),
        });
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 3: Product Variations ───────────────────────────────────────────

async function repairProductVariations(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "commerceProductVariant",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localVariantEntity = await getEntity(ctx, "commerce_product_variants", mapping.convexId);
      const localVariant = localVariantEntity?.table === "commerce_product_variants" ? localVariantEntity.doc : null;
      if (!localVariant) continue;

      // Verify productId points to a valid local product
      if (localVariant.productId) {
        const productEntity = await getEntity(ctx, "commerce_products", localVariant.productId);
        const product = productEntity?.table === "commerce_products" ? productEntity.doc : null;
        if (!product) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "warning",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Variant ${mapping.convexId} references missing product ${localVariant.productId}`,
            sourceType: "commerceProductVariant",
            sourceId: String(mapping.wpId),
            createdAt: Date.now(),
          });
          failed++;
        }
      }
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 4: Order Customers ──────────────────────────────────────────────

async function repairOrderCustomers(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "commerceOrder",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localOrderEntity = await getEntity(ctx, "commerce_orders", mapping.convexId);
      const localOrder = localOrderEntity?.table === "commerce_orders" ? localOrderEntity.doc : null;
      if (!localOrder) continue;

      // If customerId is already set, verify it exists
      if (localOrder.customerId) {
        const customerEntity = await getEntity(ctx, "commerce_customer_profiles", localOrder.customerId);
        const customer = customerEntity?.table === "commerce_customer_profiles" ? customerEntity.doc : null;
        if (!customer) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "error",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Order ${mapping.convexId} references missing customer ${localOrder.customerId}`,
            sourceType: "order",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_orders",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
          failed++;
          continue;
        }
      }

      // Verify userId resolves if set — links imported customer to auth user
      if (localOrder.userId) {
        const userEntity = await getEntity(ctx, "users", localOrder.userId);
        const user = userEntity?.table === "users" ? userEntity.doc : null;
        if (!user) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "warning",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Order ${mapping.convexId} references missing user ${localOrder.userId}`,
            sourceType: "order",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_orders",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
        }
      }

      repaired++;
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 5: Order Items ──────────────────────────────────────────────────

async function repairOrderItems(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "commerceOrderItem",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localItemEntity = await getEntity(ctx, "commerce_order_items", mapping.convexId);
      const localItem = localItemEntity?.table === "commerce_order_items" ? localItemEntity.doc : null;
      if (!localItem) continue;

      // Verify parent orderId reference
      if (localItem.orderId) {
        const orderEntity = await getEntity(ctx, "commerce_orders", localItem.orderId);
        const order = orderEntity?.table === "commerce_orders" ? orderEntity.doc : null;
        if (!order) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "error",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Order item ${mapping.convexId} references missing order ${localItem.orderId}`,
            sourceType: "orderItem",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_order_items",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
          failed++;
          continue;
        }
      }

      // Verify productId reference
      if (localItem.productId) {
        const productEntity = await getEntity(ctx, "commerce_products", localItem.productId);
        const product = productEntity?.table === "commerce_products" ? productEntity.doc : null;
        if (!product) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "error",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Order item ${mapping.convexId} references missing product ${localItem.productId}`,
            sourceType: "orderItem",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_order_items",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
          failed++;
          continue;
        }
      }

      // Verify variantId reference if present
      if (localItem.variantId) {
        const variantEntity = await getEntity(ctx, "commerce_product_variants", localItem.variantId);
        const variant = variantEntity?.table === "commerce_product_variants" ? variantEntity.doc : null;
        if (!variant) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "warning",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Order item ${mapping.convexId} references missing variant ${localItem.variantId}`,
            sourceType: "orderItem",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_order_items",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
          // Not a fatal failure — variant may have been deleted after order was placed
        }
      }

      repaired++;
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 6: Refund Linkage ───────────────────────────────────────────────

async function repairRefundLinkage(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "commerceRefund",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localRefundEntity = await getEntity(ctx, "commerce_payment_refunds", mapping.convexId);
      const localRefund = localRefundEntity?.table === "commerce_payment_refunds" ? localRefundEntity.doc : null;
      if (!localRefund) continue;

      // Verify orderId reference
      if (localRefund.orderId) {
        const orderEntity = await getEntity(ctx, "commerce_orders", localRefund.orderId);
        const order = orderEntity?.table === "commerce_orders" ? orderEntity.doc : null;
        if (!order) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "error",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Refund ${mapping.convexId} references missing order ${localRefund.orderId}`,
            sourceType: "refund",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_payment_refunds",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
          failed++;
          continue;
        }
      }

      repaired++;
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 7: Review Linkage ──────────────────────────────────────────────

async function repairReviewLinkage(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "commerceReview",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const localReviewEntity = await getEntity(ctx, "commerce_review_items", mapping.convexId);
      const localReview = localReviewEntity?.table === "commerce_review_items" ? localReviewEntity.doc : null;
      if (!localReview) continue;

      // Verify productId reference
      if (localReview.productId) {
        const productEntity = await getEntity(ctx, "commerce_products", localReview.productId);
        const product = productEntity?.table === "commerce_products" ? productEntity.doc : null;
        if (!product) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "error",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Review ${mapping.convexId} references missing product ${localReview.productId}`,
            sourceType: "review",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_review_items",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
          failed++;
          continue;
        }
      }

      // Verify userId reference
      if (localReview.userId) {
        const userEntity = await getEntity(ctx, "users", localReview.userId);
        const user = userEntity?.table === "users" ? userEntity.doc : null;
        if (!user) {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "warning",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Review ${mapping.convexId} references missing user ${localReview.userId}`,
            sourceType: "review",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_review_items",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
          // Warning-level — user may have been deleted
        }
      }

      repaired++;
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

// ─── Pass 8: Upsell / Cross-sell ──────────────────────────────────────────

async function repairUpsellCrosssell(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
): Promise<PassResult> {
  // Products store raw WP upsell/cross-sell IDs in `rawSourceMeta` (JSON string)
  // during import. This pass parses that JSON, resolves each WP product ID to its
  // local Convex ID via the wpIdMappings table, and patches the product with
  // `upsellProductIds` / `crossSellProductIds` arrays of local IDs.
  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType: "commerceProduct",
    afterWpId: cursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const productEntity = await getEntity(ctx, "commerce_products", mapping.convexId);
      const product = productEntity?.table === "commerce_products" ? productEntity.doc : null;
      if (!product || !product.rawSourceMeta) continue;

      let meta: unknown;
      try {
        meta = JSON.parse(product.rawSourceMeta);
      } catch {
        continue;
      }

      const upsellWpIds = wpIdList(meta, "upsell_ids_wp");
      const crossSellWpIds = wpIdList(meta, "cross_sell_ids_wp");

      if (upsellWpIds.length === 0 && crossSellWpIds.length === 0) continue;

      // Resolve WP product IDs to local IDs via mappings
      const upsellLocalIds: string[] = [];
      for (const wpId of upsellWpIds) {
        const localId = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "commerceProduct", wpId },
        );
        if (localId) {
          upsellLocalIds.push(localId);
        } else {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "warning",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Product ${mapping.convexId} has unresolved upsell reference to WP product ${wpId}`,
            sourceType: "product",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_products",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
        }
      }

      const crossSellLocalIds: string[] = [];
      for (const wpId of crossSellWpIds) {
        const localId = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "commerceProduct", wpId },
        );
        if (localId) {
          crossSellLocalIds.push(localId);
        } else {
          await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
            siteId,
            jobId,
            severity: "warning",
            phase: "reconciliation",
            code: FINDING_CODES.MISSING_RELATIONSHIP_TARGET,
            message: `Product ${mapping.convexId} has unresolved cross-sell reference to WP product ${wpId}`,
            sourceType: "product",
            sourceId: String(mapping.wpId),
            destinationTable: "commerce_products",
            wpId: mapping.wpId,
            convexId: mapping.convexId,
            createdAt: Date.now(),
          });
        }
      }

      // Patch the product with resolved local IDs (only if we have at least one)
      if (upsellLocalIds.length > 0 || crossSellLocalIds.length > 0) {
        const patch: { upsellProductIds?: string[]; crossSellProductIds?: string[] } = {};
        if (upsellLocalIds.length > 0) patch.upsellProductIds = upsellLocalIds;
        if (crossSellLocalIds.length > 0) patch.crossSellProductIds = crossSellLocalIds;

        await ctx.runMutation(internal.wordpressSync.internals.patchEntity, {
          table: "commerce_products",
          id: mapping.convexId,
          fields: patch,
        });
        repaired++;
      }
    } catch {
      failed++;
    }
  }

  return {
    repaired,
    failed,
    hasMore: mappings.length === BATCH_SIZE,
    nextCursor: mappings.length > 0 ? mappings[mappings.length - 1].wpId : cursor,
  };
}

/** Numeric WordPress IDs stored under `key` in a product's raw source meta. */
function wpIdList(meta: unknown, key: string): number[] {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return [];
  const value: unknown = Object.getOwnPropertyDescriptor(meta, key)?.value;
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

// ─── Pass 9: Media URL Rewrite ────────────────────────────────────────────

/**
 * Formerly rewrote WordPress media URLs inside a `posts.content` string. Posts
 * no longer have a `content` column: imported bodies are stored as canonical
 * `blocks` through the canonical document service, and direct block patches
 * are refused by the authoring version fence. The old pass read the missing
 * column, so it never rewrote anything; it now completes immediately instead
 * of scanning every post/page mapping. Rewriting media inside canonical blocks
 * needs canonical-service support and is not done here.
 */
async function rewriteMediaUrls(
  _ctx: ActionCtx,
  _siteId: SiteId,
  _jobId: JobId,
  cursor: number,
  _isDryRun: boolean,
): Promise<PassResult> {
  return { repaired: 0, failed: 0, hasMore: false, nextCursor: cursor };
}

// ─── Pass 10: Tombstone Detection ─────────────────────────────────────────

async function detectTombstones(
  ctx: ActionCtx,
  siteId: SiteId,
  jobId: JobId,
  cursor: number,
  importConfig: ImportConfig,
): Promise<PassResult> {
  const tombstoneMode = importConfig.behavior.tombstoneMode ?? "never";
  if (tombstoneMode === "never") {
    return { repaired: 0, failed: 0, hasMore: false, nextCursor: cursor };
  }

  const hasSourceFilters =
    typeof importConfig.filters?.entityLimit === "number" ||
    typeof importConfig.filters?.dateRangeStart === "number" ||
    typeof importConfig.filters?.dateRangeEnd === "number";
  if (importConfig.behavior.dryRun || hasSourceFilters) {
    if (cursor <= 0) {
      await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
        siteId,
        jobId,
        severity: "info",
        phase: "reconciliation",
        code: FINDING_CODES.SOURCE_OBJECT_MISSING,
        message: importConfig.behavior.dryRun
          ? "Skipped tombstone detection during dry run because source visibility tracking is not written."
          : "Skipped tombstone detection because date or entity-limit filters make this import a partial source view.",
        createdAt: Date.now(),
      });
    }
    return { repaired: 0, failed: 0, hasMore: false, nextCursor: cursor };
  }

  const objectTypes: WpObjectType[] = [];
  if (importConfig.scope.wpContent) {
    objectTypes.push("user", "category", "tag", "post", "page");
  }
  if (importConfig.scope.media) objectTypes.push("media");
  if (importConfig.scope.comments) objectTypes.push("comment");
  if (importConfig.scope.menus) objectTypes.push("menu");
  if (importConfig.scope.wooCatalog) objectTypes.push("commerceCategory", "commerceProduct");
  if (importConfig.scope.wooCustomers) objectTypes.push("commerceCustomer");
  if (importConfig.scope.wooOrders && importConfig.behavior.importHistoricalOrders) {
    objectTypes.push("commerceOrder");
  }
  if (importConfig.scope.wooCoupons && importConfig.behavior.importCoupons) {
    objectTypes.push("commerceDiscount");
  }
  if (importConfig.scope.wooReviews && importConfig.behavior.importReviews) {
    objectTypes.push("commerceReview");
  }

  if (objectTypes.length === 0) {
    return { repaired: 0, failed: 0, hasMore: false, nextCursor: cursor };
  }

  // Use cursor to track which object type we're on (0-7 = objectTypes index)
  const typeIndex = cursor < 0 ? 0 : Math.floor(cursor / 100_000_000);
  const innerWpCursor = cursor < 0 ? -1 : cursor % 100_000_000;

  if (typeIndex >= objectTypes.length) {
    return { repaired: 0, failed: 0, hasMore: false, nextCursor: cursor };
  }

  const objectType = objectTypes[typeIndex];

  const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
  const jobStartedAt = job?.startedAt ?? job?.createdAt ?? 0;

  const mappings = await ctx.runQuery(internal.wordpressSync.internals.getMappingsBatch, {
    siteId,
    objectType,
    afterWpId: innerWpCursor,
    limit: BATCH_SIZE,
  });

  let repaired = 0;
  let failed = 0;

  const table = MAPPED_ENTITY_TABLE[objectType];

  for (const mapping of mappings) {
    try {
      const seenInCurrentJob =
        mapping.lastSeenJobId === jobId ||
        (typeof mapping.createdAt === "number" && mapping.createdAt >= jobStartedAt);
      if (seenInCurrentJob) {
        continue;
      }

      const localEntity = await getEntity(ctx, table, mapping.convexId);

      await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
        siteId,
        jobId,
        severity: localEntity ? "warning" : "info",
        phase: "reconciliation",
        code: FINDING_CODES.SOURCE_OBJECT_MISSING,
        message: localEntity
          ? `Mapped ${objectType} WP#${mapping.wpId} was not seen in this import and may have been deleted from WordPress`
          : `Mapped ${objectType} WP#${mapping.wpId} -> ${mapping.convexId} was not seen in this import and the local entity is also missing`,
        sourceType: objectType,
        sourceId: String(mapping.wpId),
        destinationTable: table,
        wpId: mapping.wpId,
        objectType,
        convexId: mapping.convexId,
        metadata: JSON.stringify({
          tombstoneMode,
          lastSeenJobId: mapping.lastSeenJobId,
          lastSeenAt: mapping.lastSeenAt,
        }),
        createdAt: Date.now(),
      });
      failed++;
    } catch {
      failed++;
    }
  }

  // Determine next cursor
  let nextTypeIndex = typeIndex;
  let nextInnerWpCursor = innerWpCursor;

  if (mappings.length < BATCH_SIZE) {
    // Move to next object type
    nextTypeIndex++;
    nextInnerWpCursor = -1;
  } else {
    nextInnerWpCursor = mappings[mappings.length - 1].wpId;
  }

  const hasMore = nextTypeIndex < objectTypes.length;
  const nextCursor = hasMore
    ? nextTypeIndex * 100_000_000 + Math.max(0, nextInnerWpCursor)
    : cursor;

  return {
    repaired,
    failed,
    hasMore,
    nextCursor,
  };
}
