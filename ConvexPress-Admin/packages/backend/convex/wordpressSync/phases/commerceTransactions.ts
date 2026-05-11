// @ts-nocheck
/**
 * WordPress Sync - WooCommerce Customers and Orders Import Phase
 *
 * Imports WooCommerce customers, customer default addresses, orders, and order
 * items into the ConvexPress commerce tables as a single resumable phase.
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { PhaseResult } from "../internals";
import type { PhaseProgress, SyncError } from "../validators";
import { normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";


// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHashCT(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields); let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h.toString(36);
}
import {
  fetchWooCoupons,
  fetchWooCustomers,
  fetchWooOrderRefunds,
  fetchWooOrders,
  fetchWooProductReviews,
  type WooAddress,
  type WooCoupon,
  type WooCustomer,
  type WooOrder,
  type WooOrderLineItem,
  type WooOrderRefund,
  type WooProductReview,
} from "../helpers/wooClient";

const TRANSACTION_BATCH_SIZE = 25;

function getOrderDateWindow(importConfig: any, site: any, job: any) {
  const afterMs =
    typeof importConfig.filters?.dateRangeStart === "number"
      ? importConfig.filters.dateRangeStart
      : importConfig.behavior.importHistoricalOrders
        ? undefined
        : site.lastSyncAt ?? job.createdAt ?? Date.now();
  const beforeMs =
    typeof importConfig.filters?.dateRangeEnd === "number"
      ? importConfig.filters.dateRangeEnd
      : undefined;

  return {
    after: typeof afterMs === "number" ? new Date(afterMs).toISOString() : undefined,
    before: typeof beforeMs === "number" ? new Date(beforeMs).toISOString() : undefined,
  };
}

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    credentials: siteCredentialsValidator,
  },
  handler: async (ctx, { jobId, siteId, credentials }): Promise<PhaseResult> => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    // Get import config
    const importConfig = normalizeImportConfig(job?.importConfig);
    const isDryRun = importConfig.behavior.dryRun;

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{
          phase: "commerceTransactions",
          wpId: 0,
          message: !job ? "Job not found" : "Site not found",
          timestamp: Date.now(),
        }],
        hasMore: false,
      };
    }

    const progress: PhaseProgress = { ...job.progress.commerceTransactions };

    if (site.capabilities?.woocommerceApi !== true) {
      return {
        progress,
        errors: [],
        hasMore: false,
      };
    }

    const orderDateWindow = getOrderDateWindow(importConfig, site, job);
    const [customerCountResult, orderCountResult, couponCountResult, reviewCountResult] = await Promise.all([
      fetchWooCustomers(credentials, 1, 1).catch(() => ({ total: 0 })),
      fetchWooOrders(credentials, 1, 1, orderDateWindow).catch(() => ({ total: 0 })),
      fetchWooCoupons(credentials, 1, 1).catch(() => ({ total: 0 })),
      fetchWooProductReviews(credentials, 1, 1).catch(() => ({ total: 0 })),
    ]);

    const entityLimit =
      typeof importConfig.filters.entityLimit === "number"
        ? importConfig.filters.entityLimit
        : undefined;
    const customerTotal = importConfig.scope.wooCustomers
      ? entityLimit !== undefined
        ? Math.min(customerCountResult.total ?? 0, entityLimit)
        : (customerCountResult.total ?? 0)
      : 0;
    const orderTotal = importConfig.scope.wooOrders
      ? entityLimit !== undefined
        ? Math.min(orderCountResult.total ?? 0, entityLimit)
        : (orderCountResult.total ?? 0)
      : 0;
    const couponTotal = importConfig.scope.wooCoupons && importConfig.behavior.importCoupons
      ? entityLimit !== undefined
        ? Math.min(couponCountResult.total ?? 0, entityLimit)
        : (couponCountResult.total ?? 0)
      : 0;
    const reviewTotal = importConfig.scope.wooReviews && importConfig.behavior.importReviews
      ? entityLimit !== undefined
        ? Math.min(reviewCountResult.total ?? 0, entityLimit)
        : (reviewCountResult.total ?? 0)
      : 0;
    if (progress.total < customerTotal + orderTotal + couponTotal + reviewTotal) {
      progress.total = customerTotal + orderTotal + couponTotal + reviewTotal;
    }

    const cursor = progress.cursor || 0;
    // Each sub-phase returns hasMore based on its own bucket only. We OR in
    // whether subsequent sub-phases still have work so the orchestrator
    // doesn't prematurely advance to reconciliation when, e.g., customers
    // complete but orders haven't started.
    const hasMoreOuter = (): boolean =>
      orderTotal > 0 || couponTotal > 0 || reviewTotal > 0;

    if (cursor < customerTotal) {
      const result = await importCustomerBatch(ctx, {
        siteId,
        jobId,
        credentials,
        progress,
        customerTotal,
        isDryRun,
        importConfig,
        orderDateWindow,
      });
      return { ...result, hasMore: result.hasMore || hasMoreOuter() };
    }

    if (cursor < customerTotal + orderTotal) {
      const result = await importOrderBatch(ctx, {
        siteId,
        jobId,
        credentials,
        progress,
        orderTotal,
        customerTotal,
        isDryRun,
        importConfig,
        orderDateWindow,
      });
      return {
        ...result,
        hasMore: result.hasMore || couponTotal > 0 || reviewTotal > 0,
      };
    }

    if (cursor < customerTotal + orderTotal + couponTotal) {
      const result = await importCouponBatch(ctx, {
        siteId,
        jobId,
        credentials,
        progress,
        customerTotal,
        orderTotal,
        couponTotal,
        isDryRun,
        importConfig,
      });
      return { ...result, hasMore: result.hasMore || reviewTotal > 0 };
    }

    return await importReviewBatch(ctx, {
      siteId,
      jobId,
      credentials,
      progress,
      customerTotal,
      orderTotal,
      couponTotal,
      reviewTotal,
      isDryRun,
      importConfig,
    });
  },
});

async function importCustomerBatch(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    jobId: Id<"wordpressSyncJobs">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    progress: PhaseProgress;
    customerTotal: number;
    isDryRun: boolean;
    importConfig: any;
    orderDateWindow: { after?: string; before?: string };
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const page = Math.floor(cursor / TRANSACTION_BATCH_SIZE) + 1;
  const { data: fetchedCustomers } = await fetchWooCustomers(
    args.credentials,
    page,
    TRANSACTION_BATCH_SIZE
  );
  const customers = fetchedCustomers.slice(
    0,
    Math.max(0, args.customerTotal - cursor),
  );

  for (const customer of customers) {
    try {
      const sourceHash = computeSourceHashCT({
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        billing: customer.billing,
        shipping: customer.shipping,
      });
      const existingMapping = await ctx.runQuery(
        internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
        { siteId: args.siteId, objectType: "commerceCustomer", wpId: customer.id }
      );

      if (existingMapping && !args.isDryRun) {
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
          siteId: args.siteId,
          objectType: "commerceCustomer",
          wpId: customer.id,
          jobId: args.jobId,
        });
      }

      if (existingMapping?.sourceHash === sourceHash && !args.importConfig.behavior.importRefunds) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      if (existingMapping && !args.importConfig.behavior.updateExisting) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      // Email collision detection for customers
      const customerEmail = customer.email?.trim().toLowerCase();
      let existingByEmail: any = null;
      if (customerEmail && args.jobId) {
        existingByEmail = await ctx.runQuery(
          internal.wordpressSync.internals.findCustomerByEmail,
          { email: customerEmail }
        );
        if (existingByEmail && !existingMapping) {
          await createFinding(ctx, {
            siteId: args.siteId, jobId: args.jobId, severity: "warning",
            phase: "commerceTransactions",
            code: FINDING_CODES.EMAIL_COLLISION,
            message: `Customer with email "${customerEmail}" already exists locally (ID: ${existingByEmail._id})`,
            sourceType: "customer", sourceId: String(customer.id),
            destinationTable: "commerce_customer_profiles", wpId: customer.id,
            convexId: existingByEmail._id,
          });
          if (!args.importConfig.behavior.updateExisting) {
            skipped++;
            args.progress.imported++;
            continue;
          }
        }
      }

      if (!args.isDryRun) {
        const customerId = await importCustomerProfile(ctx, args.siteId, customer, sourceHash, args.jobId);
        await importCustomerDefaultAddress(ctx, customerId, "billing", customer.billing);
        await importCustomerDefaultAddress(ctx, customerId, "shipping", customer.shipping);
      }
      if (existingMapping || existingByEmail) updated++;
      else created++;
      args.progress.imported++;
    } catch (error) {
      errors.push({
        phase: "commerceTransactions",
        wpId: customer.id,
        message: `Customer: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      args.progress.failed++;
    }
  }

  args.progress.cursor = cursor + customers.length;

  return {
    progress: {
      ...args.progress,
      created,
      updated,
      skipped,
      conflicted: 0,
    },
    errors,
    hasMore: (args.progress.cursor || 0) < args.customerTotal,
  };
}

async function importOrderBatch(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    jobId: Id<"wordpressSyncJobs">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    progress: PhaseProgress;
    orderTotal: number;
    customerTotal: number;
    isDryRun: boolean;
    importConfig: any;
    orderDateWindow: { after?: string; before?: string };
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const orderCursor = Math.max(0, cursor - args.customerTotal);
  const page = Math.floor(orderCursor / TRANSACTION_BATCH_SIZE) + 1;
  const { data: fetchedOrders } = await fetchWooOrders(
    args.credentials,
    page,
    TRANSACTION_BATCH_SIZE,
    args.orderDateWindow
  );
  const orders = fetchedOrders.slice(
    0,
    Math.max(0, args.orderTotal - orderCursor),
  );

  for (const order of orders) {
    try {
      const sourceHash = computeOrderSourceHash(order);
      // Order number collision detection
      const orderNumber = buildImportedOrderNumber(args.siteId, order);
      const existingMapping = await ctx.runQuery(
        internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
        { siteId: args.siteId, objectType: "commerceOrder", wpId: order.id }
      );

      if (existingMapping && !args.isDryRun) {
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
          siteId: args.siteId,
          objectType: "commerceOrder",
          wpId: order.id,
          jobId: args.jobId,
        });
      }

      if (existingMapping?.sourceHash === sourceHash) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      if (existingMapping && !args.importConfig.behavior.updateExisting) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      let forcedExistingId: string | undefined;
      if (!existingMapping) {
        const existingByNumber = await ctx.runQuery(
          internal.wordpressSync.internals.findOrderByNumber,
          { orderNumber }
        );
        if (existingByNumber) {
          await createFinding(ctx, {
            siteId: args.siteId, jobId: args.jobId, severity: "warning",
            phase: "commerceTransactions",
            code: FINDING_CODES.ORDER_NUMBER_COLLISION,
            message: `Order with number "${orderNumber}" already exists locally (ID: ${existingByNumber._id})`,
            sourceType: "order", sourceId: String(order.id),
            destinationTable: "commerce_orders", wpId: order.id,
            convexId: existingByNumber._id,
          });
          if (args.importConfig.behavior.updateExisting) {
            forcedExistingId = existingByNumber._id;
          } else {
            skipped++;
            args.progress.imported++;
            continue;
          }
        }
      }

      if (!args.isDryRun) {
        await importSingleOrder(ctx, args.siteId, args.credentials, order, {
          existingId: forcedExistingId ?? existingMapping?.convexId,
          sourceHash,
          importRefunds: args.importConfig.behavior.importRefunds,
          jobId: args.jobId,
        });
      }
      if (existingMapping || forcedExistingId) updated++;
      else created++;
      args.progress.imported++;
    } catch (error) {
      errors.push({
        phase: "commerceTransactions",
        wpId: order.id,
        message: `Order: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      args.progress.failed++;
    }
  }

  args.progress.cursor = args.customerTotal + orderCursor + orders.length;

  return {
    progress: {
      ...args.progress,
      created,
      updated,
      skipped,
      conflicted: 0,
    },
    errors,
    hasMore: orderCursor + orders.length < args.orderTotal,
  };
}

async function importCouponBatch(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    jobId: Id<"wordpressSyncJobs">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    progress: PhaseProgress;
    customerTotal: number;
    orderTotal: number;
    couponTotal: number;
    isDryRun: boolean;
    importConfig: any;
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const couponCursor = Math.max(0, cursor - args.customerTotal - args.orderTotal);
  const page = Math.floor(couponCursor / TRANSACTION_BATCH_SIZE) + 1;
  const { data: fetchedCoupons } = await fetchWooCoupons(
    args.credentials,
    page,
    TRANSACTION_BATCH_SIZE
  );
  const coupons = fetchedCoupons.slice(
    0,
    Math.max(0, args.couponTotal - couponCursor),
  );

  for (const coupon of coupons) {
    try {
      const sourceHash = computeSourceHashCT({
        code: coupon.code,
        amount: coupon.amount,
        discount_type: coupon.discount_type,
        description: coupon.description,
        date_expires: coupon.date_expires,
        usage_limit: coupon.usage_limit,
        usage_count: coupon.usage_count,
        product_ids: coupon.product_ids,
        excluded_product_ids: coupon.excluded_product_ids,
        product_categories: coupon.product_categories,
        excluded_product_categories: coupon.excluded_product_categories,
        email_restrictions: coupon.email_restrictions,
        meta_data: coupon.meta_data,
      });
      const existingMapping = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getFullMappingByWpId, {
        siteId: args.siteId,
        objectType: "commerceDiscount",
        wpId: coupon.id,
      });
      const existingId = existingMapping?.convexId;

      if (existingMapping && !args.isDryRun) {
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
          siteId: args.siteId,
          objectType: "commerceDiscount",
          wpId: coupon.id,
          jobId: args.jobId,
        });
      }

      if (existingMapping?.sourceHash === sourceHash) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      if (existingMapping && !args.importConfig.behavior.updateExisting) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      // Coupon code collision detection
      const couponCode = coupon.code?.trim().toUpperCase() || `COUPON-${coupon.id}`;
      const existingByCode = await ctx.runQuery(
        internal.wordpressSync.internals.findDiscountByCode,
        { code: couponCode }
      );
      if (existingByCode) {
        await createFinding(ctx, {
          siteId: args.siteId, jobId: args.jobId, severity: "warning",
          phase: "commerceTransactions",
          code: FINDING_CODES.COUPON_CODE_COLLISION,
          message: `Coupon with code "${couponCode}" already exists locally (ID: ${existingByCode._id})`,
          sourceType: "coupon", sourceId: String(coupon.id),
          destinationTable: "commerce_discount_codes", wpId: coupon.id,
          convexId: existingByCode._id,
        });
        if (!existingMapping && !args.importConfig.behavior.updateExisting) {
          skipped++;
          args.progress.imported++;
          continue;
        }
      }

      if (!args.isDryRun) {
        const couponRawMeta = {
          usageLimitPerUser: coupon.usage_limit_per_user,
          limitUsageToXItems: coupon.limit_usage_to_x_items,
          productIds: coupon.product_ids,
          excludedProductIds: coupon.excluded_product_ids,
          productCategories: coupon.product_categories,
          excludedProductCategories: coupon.excluded_product_categories,
          minimumAmount: coupon.minimum_amount,
          maximumAmount: coupon.maximum_amount,
          freeShipping: coupon.free_shipping,
          individualUse: coupon.individual_use,
          excludeSaleItems: coupon.exclude_sale_items,
          emailRestrictions: coupon.email_restrictions,
          metaData: coupon.meta_data,
        };

        // Only include if at least one value is defined
        const hasMeta = Object.values(couponRawMeta).some(
          (v) => v !== undefined && v !== null
        );
        const rawSourceMeta = hasMeta ? JSON.stringify(couponRawMeta) : undefined;

        const discountId = await ctx.runMutation(
          internal.wordpressSync.phases.commerceTransactions.upsertDiscountCode,
          {
            existingId: existingId ?? undefined,
            discount: {
              code: coupon.code?.trim().toUpperCase() || `COUPON-${coupon.id}`,
              description: coupon.description?.trim() || undefined,
              status: coupon.date_expires && new Date(coupon.date_expires).getTime() < Date.now()
                ? "inactive"
                : "active",
              discountType: mapWooDiscountType(coupon.discount_type),
              amount: normalizeCouponAmount(coupon),
              usageCount: Number(coupon.usage_count || 0),
              usageLimit: typeof coupon.usage_limit === "number" ? coupon.usage_limit : undefined,
              startsAt: coupon.date_created ? new Date(coupon.date_created).getTime() : undefined,
              endsAt: coupon.date_expires ? new Date(coupon.date_expires).getTime() : undefined,
              rawSourceMeta,
            },
          }
        );

        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId: args.siteId,
          objectType: "commerceDiscount",
          wpId: coupon.id,
          convexId: discountId,
          sourceHash,
          jobId: args.jobId,
        });
      }

      if (existingId) updated++;
      else created++;
      args.progress.imported++;
    } catch (error) {
      errors.push({
        phase: "commerceTransactions",
        wpId: coupon.id,
        message: `Coupon: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      args.progress.failed++;
    }
  }

  args.progress.cursor = args.customerTotal + args.orderTotal + couponCursor + coupons.length;

  return {
    progress: {
      ...args.progress,
      created,
      updated,
      skipped,
      conflicted: 0,
    },
    errors,
    hasMore: couponCursor + coupons.length < args.couponTotal,
  };
}

async function importReviewBatch(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    jobId: Id<"wordpressSyncJobs">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    progress: PhaseProgress;
    customerTotal: number;
    orderTotal: number;
    couponTotal: number;
    reviewTotal: number;
    isDryRun: boolean;
    importConfig: any;
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const reviewCursor = Math.max(
    0,
    cursor - args.customerTotal - args.orderTotal - args.couponTotal
  );
  const page = Math.floor(reviewCursor / TRANSACTION_BATCH_SIZE) + 1;
  const { data: fetchedReviews } = await fetchWooProductReviews(
    args.credentials,
    page,
    TRANSACTION_BATCH_SIZE
  );
  const reviews = fetchedReviews.slice(
    0,
    Math.max(0, args.reviewTotal - reviewCursor),
  );

  for (const review of reviews) {
    try {
      const sourceHash = computeSourceHashCT({
        product_id: review.product_id,
        reviewer: review.reviewer,
        reviewer_email: review.reviewer_email,
        review: review.review,
        rating: review.rating,
        verified: review.verified,
        status: review.status,
        date_created: review.date_created,
      });
      const existingMapping = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getFullMappingByWpId, {
        siteId: args.siteId,
        objectType: "commerceReview",
        wpId: review.id,
      });
      const existingId = existingMapping?.convexId;

      if (existingMapping && !args.isDryRun) {
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
          siteId: args.siteId,
          objectType: "commerceReview",
          wpId: review.id,
          jobId: args.jobId,
        });
      }

      if (existingMapping?.sourceHash === sourceHash) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      if (existingMapping && !args.importConfig.behavior.updateExisting) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      if (!args.isDryRun) {
        const productId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
          siteId: args.siteId,
          objectType: "commerceProduct",
          wpId: review.product_id,
        });
        if (!productId) {
          throw new Error(`Missing product mapping for review product ${review.product_id}`);
        }

        const reviewerUserId = await resolveReviewUserId(ctx, args.siteId, review);
        if (!reviewerUserId) {
          throw new Error("Could not resolve review author");
        }

        const reviewerEmail = review.reviewer_email?.trim().toLowerCase() || undefined;
        const orderId = review.verified
          ? await findVerifiedPurchaseOrder(ctx, productId, reviewerUserId, reviewerEmail)
          : undefined;

        const reviewId = await ctx.runMutation(
          internal.wordpressSync.phases.commerceTransactions.upsertCommerceReview,
          {
            existingId: existingId ?? undefined,
            review: {
              productId,
              userId: reviewerUserId,
              orderId,
              rating: clampRating(review.rating),
              title: deriveReviewTitle(review.review),
              content: review.review?.trim() || undefined,
              status: mapWooReviewStatus(review.status),
              isVerifiedPurchase: Boolean(review.verified),
              helpfulCount: 0,
              createdAtSource: review.date_created ? new Date(review.date_created).getTime() : undefined,
            },
          }
        );

        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId: args.siteId,
          objectType: "commerceReview",
          wpId: review.id,
          convexId: reviewId,
          sourceHash,
          jobId: args.jobId,
        });
      }

      if (existingId) updated++;
      else created++;
      args.progress.imported++;
    } catch (error) {
      errors.push({
        phase: "commerceTransactions",
        wpId: review.id,
        message: `Review: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      args.progress.failed++;
    }
  }

  args.progress.cursor =
    args.customerTotal + args.orderTotal + args.couponTotal + reviewCursor + reviews.length;

  return {
    progress: {
      ...args.progress,
      created,
      updated,
      skipped,
      conflicted: 0,
    },
    errors,
    hasMore: reviewCursor + reviews.length < args.reviewTotal,
  };
}

async function importCustomerProfile(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  customer: WooCustomer,
  sourceHash?: string,
  jobId?: Id<"wordpressSyncJobs">,
): Promise<Id<"commerce_customer_profiles">> {
  const existingMapping = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
    siteId,
    objectType: "commerceCustomer",
    wpId: customer.id,
  });

  const linkedUserId =
    customer.id > 0
      ? await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
          siteId,
          objectType: "user",
          wpId: customer.id,
        })
      : null;

  const customerId = await ctx.runMutation(
    internal.wordpressSync.phases.commerceTransactions.upsertCustomerProfile,
    {
      existingId: existingMapping ?? undefined,
      customer: {
        userId: linkedUserId ?? undefined,
        email: normalizeEmail(customer.email, customer.billing?.email),
        phone: normalizePhone(customer.billing?.phone),
        firstName: customer.first_name?.trim() || customer.billing?.first_name?.trim() || undefined,
        lastName: customer.last_name?.trim() || customer.billing?.last_name?.trim() || undefined,
        isGuest: false,  // Real WooCommerce customer account
        totalOrders: 0,
        totalSpentAmount: 0,
        currencyCode: "USD",
      },
    }
  );

  await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
    siteId,
    objectType: "commerceCustomer",
    wpId: customer.id,
    convexId: customerId,
    sourceHash,
    jobId,
  });

  return customerId as Id<"commerce_customer_profiles">;
}

async function importSingleOrder(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  credentials: { siteUrl: string; username: string; applicationPassword: string },
  order: WooOrder,
  options: {
    existingId?: string;
    sourceHash: string;
    importRefunds: boolean;
    jobId: Id<"wordpressSyncJobs">;
  },
): Promise<void> {
  const customerId = await ensureOrderCustomer(ctx, siteId, order, options.jobId);

  const linkedUserId =
    order.customer_id && order.customer_id > 0
      ? await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
          siteId,
          objectType: "user",
          wpId: order.customer_id,
        })
      : null;

  const normalizedStatus = mapWooOrderStatus(order.status);
  const orderId = await ctx.runMutation(
    internal.wordpressSync.phases.commerceTransactions.upsertOrder,
    {
      existingId: options.existingId,
      order: {
        orderNumber: buildImportedOrderNumber(siteId, order),
        trackingToken: buildTrackingToken(siteId, order),
        customerId: customerId ?? undefined,
        userId: linkedUserId ?? undefined,
        status: normalizedStatus.status,
        currencyCode: (order.currency || "USD").toUpperCase(),
        email: normalizeOrderEmail(siteId, order),
        billingAddress: normalizeAddress(order.billing),
        shippingAddress: hasMeaningfulAddress(order.shipping)
          ? normalizeAddress(order.shipping)
          : undefined,
        selectedShippingMethodCode: order.shipping_lines?.[0]?.method_id || undefined,
        selectedShippingMethodLabel: order.shipping_lines?.[0]?.method_title || undefined,
        selectedPaymentMethodCode: order.payment_method || undefined,
        selectedPaymentMethodLabel: order.payment_method_title || undefined,
        appliedDiscountCode: order.coupon_lines?.[0]?.code || undefined,
        appliedDiscountDescription: order.coupon_lines?.[0]?.code || undefined,
        subtotalAmount: toMinorUnits(sumLineSubtotal(order.line_items), order.currency),
        discountAmount: toMinorUnits(order.discount_total, order.currency),
        shippingAmount: toMinorUnits(order.shipping_total, order.currency),
        taxAmount: toMinorUnits(order.total_tax || order.cart_tax, order.currency),
        totalAmount: toMinorUnits(order.total, order.currency),
        paymentStatus: normalizedStatus.paymentStatus,
        fulfillmentStatus: normalizedStatus.fulfillmentStatus,
        notes: order.customer_note?.trim() || undefined,
        paidAt: order.date_paid ? new Date(order.date_paid).getTime() : undefined,
        createdAtSource: order.date_created ? new Date(order.date_created).getTime() : undefined,
      },
    }
  );

  await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
    siteId,
    objectType: "commerceOrder",
    wpId: order.id,
    convexId: orderId,
    sourceHash: options.sourceHash,
    jobId: options.jobId,
  });

  const transactionId = await importOrderPaymentTransaction(
    ctx,
    siteId,
    order,
    orderId as Id<"commerce_orders">,
    options.jobId
  );

  for (const lineItem of order.line_items ?? []) {
    // product_id can be 0 (deleted product) or reference a Woo product that
    // was hard-deleted at some point. Both are common in long-running stores.
    // Skip the line item rather than failing the whole order — the rest of
    // the order (header, shipping, totals, refunds) is still useful.
    if (!lineItem.product_id) continue;

    const productId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
      siteId,
      objectType: "commerceProduct",
      wpId: lineItem.product_id,
    });

    if (!productId) {
      // Product was in WP but not in our import scope (or already deleted).
      // Keep the order, drop just this line item.
      continue;
    }

    const variantId =
      lineItem.variation_id && lineItem.variation_id > 0
        ? await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
            siteId,
            objectType: "commerceProductVariant",
            wpId: lineItem.variation_id,
          })
        : null;

    const existingItemId = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      {
        siteId,
        objectType: "commerceOrderItem",
        wpId: lineItem.id,
      }
    );

    const orderItemId = await ctx.runMutation(
      internal.wordpressSync.phases.commerceTransactions.upsertOrderItem,
      {
        existingId: existingItemId ?? undefined,
        orderId,
        item: {
          productId,
          variantId: variantId ?? undefined,
          productTitle: lineItem.name || `Item ${lineItem.id}`,
          sku: lineItem.sku || undefined,
          quantity: Math.max(1, Number(lineItem.quantity || 1)),
          unitPriceAmount: resolveUnitPrice(lineItem, order.currency),
          lineSubtotalAmount: toMinorUnits(lineItem.subtotal, order.currency),
          lineTotalAmount: toMinorUnits(lineItem.total, order.currency),
          metadata: {
            source: "woocommerce",
            wooOrderId: order.id,
            wooLineItemId: lineItem.id,
          },
        },
      }
    );

    await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
      siteId,
      objectType: "commerceOrderItem",
      wpId: lineItem.id,
      convexId: orderItemId,
      jobId: options.jobId,
    });
  }

  if (options.importRefunds) {
    await importOrderRefunds(
      ctx,
      siteId,
      credentials,
      order,
      orderId as Id<"commerce_orders">,
      transactionId,
      options.jobId
    );
  }

  if (customerId) {
    await ctx.runMutation(
      internal.wordpressSync.phases.commerceTransactions.recomputeCustomerTotals,
      {
        customerId,
      }
    );
  }
}

async function importOrderPaymentTransaction(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  order: WooOrder,
  orderId: Id<"commerce_orders">,
  jobId?: Id<"wordpressSyncJobs">,
): Promise<Id<"commerce_payment_transactions"> | undefined> {
  const status = mapWooPaymentTransactionStatus(order.status);
  if (!status) return undefined;

  const existingTransactionId = await ctx.runQuery(
    internal.wordpressSync.helpers.idMapping.getByWpId,
    {
      siteId,
      objectType: "commercePaymentTransaction",
      wpId: order.id,
    }
  );

  const transactionId = await ctx.runMutation(
    internal.wordpressSync.phases.commerceTransactions.upsertPaymentTransaction,
    {
      existingId: existingTransactionId ?? undefined,
      transaction: {
        orderId,
        provider: normalizePaymentProvider(order.payment_method),
        providerTransactionId: order.transaction_id?.trim() || buildImportedTransactionId(siteId, order),
        status,
        amount: {
          amount: toMinorUnits(order.total, order.currency),
          currencyCode: (order.currency || "USD").toUpperCase(),
        },
        metadata: {
          source: "woocommerce",
          wooOrderId: order.id,
          wooOrderNumber: order.number,
          paymentMethod: order.payment_method,
          paymentMethodTitle: order.payment_method_title,
          transactionIdWasSynthesized: !order.transaction_id?.trim(),
        },
        completedAt: resolveWooDate(order.date_paid, order.date_created),
        createdAtSource: resolveWooDate(order.date_paid, order.date_created),
      },
    }
  );

  await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
    siteId,
    objectType: "commercePaymentTransaction",
    wpId: order.id,
    convexId: transactionId,
    jobId,
  });

  return transactionId as Id<"commerce_payment_transactions">;
}

async function importOrderRefunds(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  credentials: { siteUrl: string; username: string; applicationPassword: string },
  order: WooOrder,
  orderId: Id<"commerce_orders">,
  transactionId: Id<"commerce_payment_transactions"> | undefined,
  jobId?: Id<"wordpressSyncJobs">,
): Promise<void> {
  const refunds: WooOrderRefund[] = [];
  let page = 1;

  while (true) {
    const { data } = await fetchWooOrderRefunds(
      credentials,
      order.id,
      page,
      100
    ).catch(() => ({ data: [], total: 0 }));

    if (!data.length) break;
    refunds.push(...data);
    if (data.length < 100) break;
    page += 1;
  }

  for (const refund of refunds) {
    const existingRefundId = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      {
        siteId,
        objectType: "commerceRefund",
        wpId: refund.id,
      }
    );

    const createdBy =
      typeof refund.refunded_by === "number" && refund.refunded_by > 0
        ? await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
            siteId,
            objectType: "user",
            wpId: refund.refunded_by,
          })
        : null;

    const refundId = await ctx.runMutation(
      internal.wordpressSync.phases.commerceTransactions.upsertPaymentRefund,
      {
        existingId: existingRefundId ?? undefined,
        refund: {
          orderId,
          transactionId,
          amount: {
            amount: toMinorUnits(refund.amount, order.currency),
            currencyCode: (order.currency || "USD").toUpperCase(),
          },
          reason: refund.reason?.trim() || undefined,
          status: refund.refunded_payment ? "succeeded" : "completed",
          createdBy: createdBy ?? undefined,
          createdAtSource: resolveWooDate(refund.date_created_gmt, refund.date_created),
        },
      }
    );

    await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
      siteId,
      objectType: "commerceRefund",
      wpId: refund.id,
      convexId: refundId,
      jobId,
    });
  }

  await ctx.runMutation(
    internal.wordpressSync.phases.commerceTransactions.reconcileOrderRefundStatus,
    { orderId }
  );
}

async function ensureOrderCustomer(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  order: WooOrder,
  jobId?: Id<"wordpressSyncJobs">,
): Promise<string | undefined> {
  const sourceCustomerId = order.customer_id && order.customer_id > 0 ? order.customer_id : undefined;
  const billingEmail = normalizeOptionalEmail(order.billing?.email);

  if (sourceCustomerId) {
    const existingCustomerId = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      {
        siteId,
        objectType: "commerceCustomer",
        wpId: sourceCustomerId,
      }
    );

    if (existingCustomerId) {
      return existingCustomerId;
    }
  }

  if (!billingEmail) {
    return undefined;
  }

  const existingByEmail = await ctx.runQuery(
    internal.wordpressSync.internals.findCustomerByEmail,
    { email: billingEmail }
  );
  if (existingByEmail) {
    if (sourceCustomerId) {
      await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
        siteId,
        objectType: "commerceCustomer",
        wpId: sourceCustomerId,
        convexId: existingByEmail._id,
        jobId,
      });
    }
    return existingByEmail._id;
  }

  const linkedUserId = sourceCustomerId
    ? await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
        siteId,
        objectType: "user",
        wpId: sourceCustomerId,
      })
    : (await ctx.runQuery(internal.wordpressSync.internals.findUserByEmail, { email: billingEmail }))?._id;

  const customerId = await ctx.runMutation(
    internal.wordpressSync.phases.commerceTransactions.upsertCustomerProfile,
    {
      customer: {
        email: billingEmail,
        phone: normalizePhone(order.billing?.phone),
        firstName: order.billing?.first_name?.trim() || undefined,
        lastName: order.billing?.last_name?.trim() || undefined,
        isGuest: !sourceCustomerId,
        totalOrders: 0,
        totalSpentAmount: 0,
        currencyCode: (order.currency || "USD").toUpperCase(),
        userId: linkedUserId ?? undefined,
      },
    }
  );

  if (sourceCustomerId) {
    await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
      siteId,
      objectType: "commerceCustomer",
      wpId: sourceCustomerId,
      convexId: customerId,
      jobId,
    });
  }

  await importCustomerDefaultAddress(ctx, customerId as Id<"commerce_customer_profiles">, "billing", order.billing);
  await importCustomerDefaultAddress(ctx, customerId as Id<"commerce_customer_profiles">, "shipping", order.shipping);

  return customerId;
}

async function importCustomerDefaultAddress(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  customerId: Id<"commerce_customer_profiles">,
  addressType: "billing" | "shipping",
  address: WooAddress | undefined,
): Promise<void> {
  if (!hasMeaningfulAddress(address)) return;

  await ctx.runMutation(
    internal.wordpressSync.phases.commerceTransactions.upsertCustomerDefaultAddress,
    {
      customerId,
      addressType,
      address: normalizeAddress(address),
      phone: normalizePhone(address?.phone),
    }
  );
}

function normalizeAddress(address: WooAddress | undefined) {
  return {
    firstName: address?.first_name?.trim() || undefined,
    lastName: address?.last_name?.trim() || undefined,
    company: address?.company?.trim() || undefined,
    line1: address?.address_1?.trim() || "",
    line2: address?.address_2?.trim() || undefined,
    city: address?.city?.trim() || "",
    state: address?.state?.trim() || undefined,
    postalCode: address?.postcode?.trim() || "",
    countryCode: (address?.country?.trim() || "US").toUpperCase(),
    phone: normalizePhone(address?.phone),
  };
}

function hasMeaningfulAddress(address: WooAddress | undefined) {
  if (!address) return false;
  return Boolean(
    address.address_1 ||
      address.city ||
      address.postcode ||
      address.country ||
      address.first_name ||
      address.last_name
  );
}

function normalizeEmail(primary: string | undefined, fallback: string | undefined) {
  const email = (primary || fallback || "").trim().toLowerCase();
  if (!email) {
    throw new Error("Missing customer email");
  }
  return email;
}

function normalizeOptionalEmail(email: string | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeOrderEmail(siteId: Id<"wordpressSites">, order: WooOrder) {
  const email = normalizeOptionalEmail(order.billing?.email);
  if (email) return email;

  const sitePart = siteId.toString().slice(-8).toLowerCase();
  return `woo-order-${sitePart}-${order.id}@missing-email.wp-import.local`;
}

function normalizePhone(phone: string | undefined) {
  return phone?.trim() || undefined;
}

function mapWooDiscountType(type: string | undefined) {
  switch (type) {
    case "percent":
      return "percent" as const;
    case "fixed_product":
      return "fixed_product" as const;
    default:
      return "fixed_cart" as const;
  }
}

function normalizeCouponAmount(coupon: WooCoupon) {
  const parsed = Number.parseFloat((coupon.amount || "0").toString());
  if (!Number.isFinite(parsed)) return 0;
  if (coupon.discount_type === "percent") {
    return parsed;
  }
  return Math.round(parsed * 100);
}

function toMinorUnits(raw: string | number | undefined, _currency: string | undefined) {
  const parsed =
    typeof raw === "number" ? raw : Number.parseFloat((raw || "0").toString().trim() || "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function sumLineSubtotal(lineItems: WooOrderLineItem[] | undefined) {
  return (lineItems ?? []).reduce((sum, item) => {
    const subtotal = Number.parseFloat((item.subtotal || "0").toString());
    return sum + (Number.isFinite(subtotal) ? subtotal : 0);
  }, 0);
}

function computeOrderSourceHash(order: WooOrder) {
  return computeSourceHashCT({
    number: order.number,
    status: order.status,
    currency: order.currency,
    customer_id: order.customer_id,
    billing: order.billing,
    shipping: order.shipping,
    line_items: order.line_items,
    shipping_lines: order.shipping_lines,
    coupon_lines: order.coupon_lines,
    discount_total: order.discount_total,
    shipping_total: order.shipping_total,
    total_tax: order.total_tax,
    cart_tax: order.cart_tax,
    total: order.total,
    payment_method: order.payment_method,
    transaction_id: order.transaction_id,
    date_paid: order.date_paid,
    date_created: order.date_created,
    customer_note: order.customer_note,
  });
}

function resolveUnitPrice(item: WooOrderLineItem, currency: string | undefined) {
  if (typeof item.price === "number" && Number.isFinite(item.price)) {
    return Math.round(item.price * 100);
  }
  const totalAmount = toMinorUnits(item.total, currency);
  const quantity = Math.max(1, Number(item.quantity || 1));
  return Math.round(totalAmount / quantity);
}

function mapWooOrderStatus(status: string | undefined) {
  switch (status) {
    case "processing":
      return { status: "processing" as const, paymentStatus: "paid", fulfillmentStatus: "unfulfilled" };
    case "completed":
      return { status: "completed" as const, paymentStatus: "paid", fulfillmentStatus: "fulfilled" };
    case "cancelled":
      return { status: "cancelled" as const, paymentStatus: "cancelled", fulfillmentStatus: "unfulfilled" };
    case "refunded":
      return { status: "refunded" as const, paymentStatus: "refunded", fulfillmentStatus: "fulfilled" };
    case "failed":
      return { status: "failed" as const, paymentStatus: "failed", fulfillmentStatus: "unfulfilled" };
    default:
      return { status: "pending" as const, paymentStatus: "pending", fulfillmentStatus: "unfulfilled" };
  }
}

function mapWooPaymentTransactionStatus(status: string | undefined) {
  switch (status) {
    case "processing":
    case "completed":
      return "succeeded";
    case "refunded":
      return "refunded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "pending":
    case "on-hold":
      return "pending";
    default:
      return undefined;
  }
}

function normalizePaymentProvider(provider: string | undefined) {
  return provider?.trim() || "woocommerce";
}

function mapWooReviewStatus(status: string | undefined) {
  switch (status) {
    case "approved":
      return "approved" as const;
    case "spam":
      return "spam" as const;
    case "trash":
      return "deleted" as const;
    case "hold":
      return "pending" as const;
    default:
      return "pending" as const;
  }
}

function clampRating(rating: number | undefined) {
  const rounded = Math.round(Number(rating || 0));
  return Math.min(5, Math.max(1, rounded || 1));
}

function deriveReviewTitle(content: string | undefined) {
  const trimmed = content?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 80);
}

function resolveWooDate(primary: string | undefined, fallback: string | undefined) {
  const value = primary || fallback;
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function buildImportedOrderNumber(siteId: Id<"wordpressSites">, order: WooOrder) {
  const sitePart = siteId.toString().slice(-6);
  return `WC-${sitePart}-${order.number || order.id}`;
}

function buildTrackingToken(siteId: Id<"wordpressSites">, order: WooOrder) {
  const sitePart = siteId.toString().slice(-8);
  return `woo-${sitePart}-${order.id}`;
}

function buildImportedTransactionId(siteId: Id<"wordpressSites">, order: WooOrder) {
  const sitePart = siteId.toString().slice(-8);
  return `woo-${sitePart}-order-${order.id}`;
}

async function resolveReviewUserId(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  review: WooProductReview,
) {
  const reviewerEmail = review.reviewer_email?.trim().toLowerCase();
  if (!reviewerEmail) return undefined;

  const existingCustomer = await ctx.db
    .query("commerce_customer_profiles")
    .withIndex("by_email", (q) => q.eq("email", reviewerEmail))
    .unique();
  if (existingCustomer?.userId) {
    return existingCustomer.userId;
  }

  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", reviewerEmail))
    .unique();
  if (existingUser?._id) {
    return existingUser._id;
  }

  return await ctx.runMutation(
    internal.wordpressSync.phases.commerceTransactions.upsertImportedReviewUser,
    {
      siteId,
      email: reviewerEmail,
      reviewerName: review.reviewer?.trim() || undefined,
    }
  );
}

async function findVerifiedPurchaseOrder(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  productId: string,
  userId?: Id<"users">,
  reviewerEmail?: string,
) {
  const normalizedEmail = reviewerEmail?.trim().toLowerCase();
  const orders = userId
    ? await ctx.db
        .query("commerce_orders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    : await ctx.db.query("commerce_orders").collect();

  for (const order of orders) {
    if (!userId && normalizedEmail && order.email?.trim().toLowerCase() !== normalizedEmail) {
      continue;
    }
    const items = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    if (items.some((item) => item.productId.toString() === productId.toString())) {
      return order._id;
    }
  }

  return undefined;
}

export const upsertCustomerProfile = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    customer: v.object({
      userId: v.optional(v.string()),
      email: v.string(),
      phone: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      isGuest: v.optional(v.boolean()),
      totalOrders: v.number(),
      totalSpentAmount: v.number(),
      currencyCode: v.string(),
    }),
  },
  handler: async (ctx, { existingId, customer }) => {
    const now = Date.now();
    let targetId = existingId as Id<"commerce_customer_profiles"> | undefined;

    if (!targetId) {
      const byEmail = await ctx.db
        .query("commerce_customer_profiles")
        .withIndex("by_email", (q) => q.eq("email", customer.email))
        .unique();
      targetId = byEmail?._id;
    }

    if (targetId) {
      // For updates, conditionally include only defined optional fields to
      // avoid clearing existing values when a later import passes undefined.
      const patch: any = {
        email: customer.email,
        phone: customer.phone,
        totalOrders: customer.totalOrders,
        totalSpentAmount: customer.totalSpentAmount,
        currencyCode: customer.currencyCode,
        updatedAt: now,
      };
      if (customer.userId) patch.userId = customer.userId as Id<"users">;
      if (customer.firstName !== undefined) patch.firstName = customer.firstName;
      if (customer.lastName !== undefined) patch.lastName = customer.lastName;
      if (customer.isGuest !== undefined) patch.isGuest = customer.isGuest;

      await ctx.db.patch(targetId, patch);
      return targetId;
    }

    // For inserts, pass all fields directly (undefined is fine for new docs).
    return await ctx.db.insert("commerce_customer_profiles", {
      userId: customer.userId ? (customer.userId as Id<"users">) : undefined,
      email: customer.email,
      phone: customer.phone,
      firstName: customer.firstName,
      lastName: customer.lastName,
      isGuest: customer.isGuest,
      totalOrders: customer.totalOrders,
      totalSpentAmount: customer.totalSpentAmount,
      currencyCode: customer.currencyCode,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertCustomerDefaultAddress = internalMutation({
  args: {
    customerId: v.id("commerce_customer_profiles"),
    addressType: v.union(v.literal("billing"), v.literal("shipping")),
    address: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      company: v.optional(v.string()),
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      state: v.optional(v.string()),
      postalCode: v.string(),
      countryCode: v.string(),
      phone: v.optional(v.string()),
    }),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, { customerId, addressType, address, phone }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("commerce_customer_addresses")
      .withIndex("by_customer_default", (q) =>
        q.eq("customerId", customerId).eq("isDefault", true)
      )
      .collect();

    const target = existing.find((entry) => entry.addressType === addressType);
    const patch = {
      label: addressType === "billing" ? "Imported Billing" : "Imported Shipping",
      addressType,
      isDefault: true,
      address,
      updatedAt: now,
    };

    let addressId: Id<"commerce_customer_addresses">;
    if (target) {
      await ctx.db.patch(target._id, patch);
      addressId = target._id;
    } else {
      addressId = await ctx.db.insert("commerce_customer_addresses", {
        customerId,
        ...patch,
        createdAt: now,
      });
    }

    for (const entry of existing) {
      if (entry.addressType === addressType && entry._id !== addressId) {
        await ctx.db.patch(entry._id, { isDefault: false, updatedAt: now });
      }
    }

    await ctx.db.patch(customerId, {
      phone: phone ?? undefined,
      defaultBillingAddressId:
        addressType === "billing" ? addressId : (await ctx.db.get(customerId))?.defaultBillingAddressId,
      defaultShippingAddressId:
        addressType === "shipping" ? addressId : (await ctx.db.get(customerId))?.defaultShippingAddressId,
      updatedAt: now,
    });

    return addressId;
  },
});

export const upsertOrder = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    order: v.object({
      orderNumber: v.string(),
      trackingToken: v.string(),
      customerId: v.optional(v.string()),
      userId: v.optional(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("paid"),
        v.literal("fulfilled"),
        v.literal("completed"),
        v.literal("cancelled"),
        v.literal("refunded"),
        v.literal("failed")
      ),
      currencyCode: v.string(),
      email: v.string(),
      billingAddress: v.object({
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        company: v.optional(v.string()),
        line1: v.string(),
        line2: v.optional(v.string()),
        city: v.string(),
        state: v.optional(v.string()),
        postalCode: v.string(),
        countryCode: v.string(),
        phone: v.optional(v.string()),
      }),
      shippingAddress: v.optional(v.object({
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        company: v.optional(v.string()),
        line1: v.string(),
        line2: v.optional(v.string()),
        city: v.string(),
        state: v.optional(v.string()),
        postalCode: v.string(),
        countryCode: v.string(),
        phone: v.optional(v.string()),
      })),
      selectedShippingMethodCode: v.optional(v.string()),
      selectedShippingMethodLabel: v.optional(v.string()),
      selectedPaymentMethodCode: v.optional(v.string()),
      selectedPaymentMethodLabel: v.optional(v.string()),
      appliedDiscountCode: v.optional(v.string()),
      appliedDiscountDescription: v.optional(v.string()),
      subtotalAmount: v.number(),
      discountAmount: v.number(),
      shippingAmount: v.number(),
      taxAmount: v.number(),
      totalAmount: v.number(),
      paymentStatus: v.string(),
      fulfillmentStatus: v.string(),
      notes: v.optional(v.string()),
      paidAt: v.optional(v.number()),
      createdAtSource: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { existingId, order }) => {
    const now = Date.now();
    let targetId = existingId as Id<"commerce_orders"> | undefined;

    if (!targetId) {
      const byTracking = await ctx.db
        .query("commerce_orders")
        .withIndex("by_trackingToken", (q) => q.eq("trackingToken", order.trackingToken))
        .unique();
      targetId = byTracking?._id;
    }

    const patch = {
      orderNumber: order.orderNumber,
      trackingToken: order.trackingToken,
      customerId: order.customerId ? (order.customerId as Id<"commerce_customer_profiles">) : undefined,
      userId: order.userId ? (order.userId as Id<"users">) : undefined,
      status: order.status,
      currencyCode: order.currencyCode,
      email: order.email,
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
      selectedShippingMethodCode: order.selectedShippingMethodCode,
      selectedShippingMethodLabel: order.selectedShippingMethodLabel,
      selectedPaymentMethodCode: order.selectedPaymentMethodCode,
      selectedPaymentMethodLabel: order.selectedPaymentMethodLabel,
      appliedDiscountCode: order.appliedDiscountCode,
      appliedDiscountDescription: order.appliedDiscountDescription,
      subtotalAmount: order.subtotalAmount,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      notes: order.notes,
      paidAt: order.paidAt,
      updatedAt: now,
    };

    if (targetId) {
      await ctx.db.patch(targetId, patch);
      return targetId;
    }

    const orderId = await ctx.db.insert("commerce_orders", {
      ...patch,
      inventoryCommittedAt: undefined,
      inventoryReleasedAt: undefined,
      createdAt: order.createdAtSource ?? now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId,
      eventType: "order_created",
      message: "Imported from WooCommerce.",
      metadata: {
        source: "woocommerce",
      },
      createdAt: now,
    });

    return orderId;
  },
});

export const upsertOrderItem = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    orderId: v.string(),
    item: v.object({
      productId: v.string(),
      variantId: v.optional(v.string()),
      productTitle: v.string(),
      sku: v.optional(v.string()),
      quantity: v.number(),
      unitPriceAmount: v.number(),
      lineSubtotalAmount: v.number(),
      lineTotalAmount: v.number(),
      metadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { existingId, orderId, item }) => {
    const targetOrderId = orderId as Id<"commerce_orders">;
    const patch = {
      orderId: targetOrderId,
      productId: item.productId as Id<"commerce_products">,
      variantId: item.variantId ? (item.variantId as Id<"commerce_product_variants">) : undefined,
      productTitle: item.productTitle,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceAmount: item.unitPriceAmount,
      lineSubtotalAmount: item.lineSubtotalAmount,
      lineTotalAmount: item.lineTotalAmount,
      metadata: item.metadata,
    };

    if (existingId) {
      await ctx.db.patch(existingId as Id<"commerce_order_items">, patch);
      return existingId;
    }

    return await ctx.db.insert("commerce_order_items", {
      ...patch,
      createdAt: Date.now(),
    });
  },
});

export const upsertPaymentTransaction = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    transaction: v.object({
      orderId: v.string(),
      provider: v.string(),
      providerTransactionId: v.string(),
      status: v.string(),
      amount: v.object({
        amount: v.number(),
        currencyCode: v.string(),
      }),
      metadata: v.optional(v.any()),
      completedAt: v.optional(v.number()),
      createdAtSource: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { existingId, transaction }) => {
    const now = Date.now();
    let targetId = existingId as Id<"commerce_payment_transactions"> | undefined;

    if (!targetId) {
      const existing = await ctx.db
        .query("commerce_payment_transactions")
        .withIndex("by_provider_txn", (q) =>
          q
            .eq("provider", transaction.provider)
            .eq("providerTransactionId", transaction.providerTransactionId)
        )
        .unique();
      targetId = existing?._id;
    }

    const patch = {
      orderId: transaction.orderId as Id<"commerce_orders">,
      provider: transaction.provider,
      providerTransactionId: transaction.providerTransactionId,
      status: transaction.status,
      amount: transaction.amount,
      metadata: transaction.metadata,
      completedAt: transaction.completedAt,
      updatedAt: now,
    };

    if (targetId) {
      await ctx.db.patch(targetId, patch);
      return targetId;
    }

    return await ctx.db.insert("commerce_payment_transactions", {
      ...patch,
      createdAt: transaction.createdAtSource ?? now,
    });
  },
});

export const upsertImportedReviewUser = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    email: v.string(),
    reviewerName: v.optional(v.string()),
  },
  handler: async (ctx, { siteId, email, reviewerName }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();
    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const displayName = reviewerName?.trim() || normalizedEmail.split("@")[0] || "Imported Reviewer";
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

    return await ctx.db.insert("users", {
      authSource: "local",
      email: normalizedEmail,
      emailVerified: false,
      firstName: firstName || undefined,
      lastName,
      username: `woo-review-${normalizedEmail.replace(/[^a-z0-9]+/g, "-")}`,
      displayName,
      slug: `woo-review-${normalizedEmail.split("@")[0]?.replace(/[^a-z0-9]+/g, "-") || "user"}`,
      status: "active",
      registrationMethod: "import",
      createdAt: now,
      updatedAt: now,
      wpSourceSiteId: siteId,
    });
  },
});

export const upsertDiscountCode = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    discount: v.object({
      code: v.string(),
      description: v.optional(v.string()),
      status: v.union(v.literal("active"), v.literal("inactive")),
      discountType: v.union(
        v.literal("fixed_cart"),
        v.literal("percent"),
        v.literal("fixed_product"),
        v.literal("free_shipping"),
      ),
      amount: v.number(),
      usageCount: v.number(),
      usageLimit: v.optional(v.number()),
      startsAt: v.optional(v.number()),
      endsAt: v.optional(v.number()),
      // Wave 12.6: full WooCommerce coupon parity.
      minimumSubtotalAmount: v.optional(v.number()),
      maximumSubtotalAmount: v.optional(v.number()),
      allowedEmails: v.optional(v.array(v.string())),
      individualUse: v.optional(v.boolean()),
      excludeSaleItems: v.optional(v.boolean()),
      perUserUsageLimit: v.optional(v.number()),
      productIds: v.optional(v.array(v.string())),
      excludedProductIds: v.optional(v.array(v.string())),
      rawSourceMeta: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { existingId, discount }) => {
    const now = Date.now();
    let targetId = existingId as Id<"commerce_discount_codes"> | undefined;
    if (!targetId) {
      const byCode = await ctx.db
        .query("commerce_discount_codes")
        .withIndex("by_code", (q) => q.eq("code", discount.code))
        .unique();
      targetId = byCode?._id;
    }

    const patch: Record<string, unknown> = {
      code: discount.code,
      description: discount.description,
      status: discount.status,
      discountType: discount.discountType,
      amount: discount.amount,
      usageCount: discount.usageCount,
      usageLimit: discount.usageLimit,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      minimumSubtotalAmount: discount.minimumSubtotalAmount,
      maximumSubtotalAmount: discount.maximumSubtotalAmount,
      allowedEmails: discount.allowedEmails,
      individualUse: discount.individualUse,
      excludeSaleItems: discount.excludeSaleItems,
      perUserUsageLimit: discount.perUserUsageLimit,
      productIds: discount.productIds as any,
      excludedProductIds: discount.excludedProductIds as any,
      rawSourceMeta: discount.rawSourceMeta,
      updatedAt: now,
    };

    if (targetId) {
      await ctx.db.patch(targetId, patch);
      return targetId;
    }

    return await ctx.db.insert("commerce_discount_codes", {
      ...(patch as any),
      createdAt: now,
    });
  },
});

/**
 * Wave 12.6: Translate a raw WooCommerce coupon API payload into the
 * upsertDiscountCode args shape, preserving every Woo field. Pure —
 * unit-testable.
 */
export function mapWooCouponToUpsertArgs(coupon: any): any {
  const amount = Number(coupon.amount ?? 0);
  const discountType =
    coupon.discount_type === "free_shipping"
      ? "free_shipping"
      : coupon.discount_type === "percent"
        ? "percent"
        : coupon.discount_type === "fixed_product"
          ? "fixed_product"
          : "fixed_cart";
  const minimumSubtotalAmount = coupon.minimum_amount
    ? Math.round(parseFloat(coupon.minimum_amount) * 100)
    : undefined;
  const maximumSubtotalAmount = coupon.maximum_amount
    ? Math.round(parseFloat(coupon.maximum_amount) * 100)
    : undefined;
  return {
    code: (coupon.code ?? "").toString().trim().toUpperCase(),
    description: coupon.description ?? undefined,
    status: "active" as const,
    discountType,
    amount:
      discountType === "percent" ? amount : Math.round(amount * 100),
    usageCount: Number(coupon.usage_count ?? 0),
    usageLimit:
      typeof coupon.usage_limit === "number" ? coupon.usage_limit : undefined,
    startsAt: undefined,
    endsAt: coupon.date_expires
      ? new Date(coupon.date_expires).getTime()
      : undefined,
    minimumSubtotalAmount,
    maximumSubtotalAmount,
    allowedEmails: Array.isArray(coupon.email_restrictions)
      ? coupon.email_restrictions
      : undefined,
    individualUse: coupon.individual_use === true,
    excludeSaleItems: coupon.exclude_sale_items === true,
    perUserUsageLimit:
      typeof coupon.usage_limit_per_user === "number"
        ? coupon.usage_limit_per_user
        : undefined,
    productIds: Array.isArray(coupon.product_ids)
      ? coupon.product_ids.map((id: any) => String(id))
      : undefined,
    excludedProductIds: Array.isArray(coupon.excluded_product_ids)
      ? coupon.excluded_product_ids.map((id: any) => String(id))
      : undefined,
    rawSourceMeta: JSON.stringify({
      wpId: coupon.id,
      product_categories: coupon.product_categories ?? [],
      excluded_product_categories: coupon.excluded_product_categories ?? [],
      meta_data: coupon.meta_data ?? [],
    }),
  };
}

export const upsertPaymentRefund = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    refund: v.object({
      orderId: v.string(),
      transactionId: v.optional(v.string()),
      amount: v.object({
        amount: v.number(),
        currencyCode: v.string(),
      }),
      reason: v.optional(v.string()),
      status: v.string(),
      createdBy: v.optional(v.string()),
      createdAtSource: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { existingId, refund }) => {
    const now = Date.now();
    const patch = {
      orderId: refund.orderId as Id<"commerce_orders">,
      transactionId: refund.transactionId
        ? (refund.transactionId as Id<"commerce_payment_transactions">)
        : undefined,
      amount: refund.amount,
      reason: refund.reason,
      status: refund.status,
      createdBy: refund.createdBy ? (refund.createdBy as Id<"users">) : undefined,
      updatedAt: now,
    };

    if (existingId) {
      await ctx.db.patch(existingId as Id<"commerce_payment_refunds">, patch);
      return existingId;
    }

    return await ctx.db.insert("commerce_payment_refunds", {
      ...patch,
      createdAt: refund.createdAtSource ?? now,
    });
  },
});

export const upsertCommerceReview = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    review: v.object({
      productId: v.string(),
      userId: v.string(),
      orderId: v.optional(v.string()),
      rating: v.number(),
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("spam"),
        v.literal("deleted")
      ),
      isVerifiedPurchase: v.boolean(),
      helpfulCount: v.number(),
      createdAtSource: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { existingId, review }) => {
    const now = Date.now();
    const patch = {
      productId: review.productId as Id<"commerce_products">,
      userId: review.userId as Id<"users">,
      orderId: review.orderId ? (review.orderId as Id<"commerce_orders">) : undefined,
      rating: review.rating,
      title: review.title,
      content: review.content,
      status: review.status,
      isVerifiedPurchase: review.isVerifiedPurchase,
      helpfulCount: review.helpfulCount,
      updatedAt: now,
    };

    let targetId = existingId as Id<"commerce_review_items"> | undefined;
    if (!targetId) {
      const existing = await ctx.db
        .query("commerce_review_items")
        .withIndex("by_product_user", (q) =>
          q.eq("productId", review.productId as Id<"commerce_products">).eq("userId", review.userId as Id<"users">)
        )
        .unique();
      targetId = existing?._id;
    }

    if (targetId) {
      await ctx.db.patch(targetId, patch);
      return targetId;
    }

    return await ctx.db.insert("commerce_review_items", {
      ...patch,
      createdAt: review.createdAtSource ?? now,
    });
  },
});

export const reconcileOrderRefundStatus = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order) return null;

    const refunds = await ctx.db
      .query("commerce_payment_refunds")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();

    const refundedAmount = refunds.reduce(
      (sum, refund) => sum + (refund.amount?.amount ?? 0),
      0
    );

    if (refundedAmount <= 0) {
      return orderId;
    }

    const isFullyRefunded = refundedAmount >= order.totalAmount;
    const transactions = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();

    for (const transaction of transactions) {
      await ctx.db.patch(transaction._id, {
        refundedAmount,
        status:
          refundedAmount >= transaction.amount.amount
            ? "refunded"
            : "partially_refunded",
        updatedAt: Date.now(),
      });
    }

    await ctx.db.patch(orderId, {
      paymentStatus: isFullyRefunded ? "refunded" : "partially_refunded",
      status: isFullyRefunded ? "refunded" : order.status,
      updatedAt: Date.now(),
    });

    return orderId;
  },
});

export const recomputeCustomerTotals = internalMutation({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, { customerId }) => {
    const targetId = customerId as Id<"commerce_customer_profiles">;
    const customer = await ctx.db.get(targetId);
    if (!customer) return null;

    const orders = await ctx.db
      .query("commerce_orders")
      .withIndex("by_customer", (q) => q.eq("customerId", targetId))
      .collect();

    const completedOrders = orders.filter((order) =>
      ["processing", "paid", "fulfilled", "completed", "refunded"].includes(order.status)
    );

    await ctx.db.patch(targetId, {
      totalOrders: completedOrders.length,
      totalSpentAmount: completedOrders.reduce(
        (sum, order) => sum + (order.totalAmount ?? 0),
        0
      ),
      currencyCode: completedOrders[0]?.currencyCode ?? customer.currencyCode,
      updatedAt: Date.now(),
    });

    return targetId;
  },
});
