import { internalMutation, mutation } from "../_generated/server";
import { DEFAULT_TEMPLATES } from "../emails/templateDefaults";
import { EMAIL_TEMPLATES } from "../helpers/email";
import { requirePluginEnabled } from "../helpers/plugins";
import { requireCan } from "../helpers/permissions";
import { requireCommerceReturnsEnabled } from "./helpers";
import { normalizeStoredReturnItems } from "./itemState";

const RETURN_TEMPLATE_SLUGS = new Set([
  EMAIL_TEMPLATES.RETURN_REQUESTED_ADMIN,
  EMAIL_TEMPLATES.RETURN_APPROVED,
  EMAIL_TEMPLATES.RETURN_REJECTED,
  EMAIL_TEMPLATES.RETURN_LABEL_ADDED,
  EMAIL_TEMPLATES.RETURN_REFUNDED,
  EMAIL_TEMPLATES.RETURN_REFUND_FAILED,
]);

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function getReturnTemplateDefaults() {
  return DEFAULT_TEMPLATES.filter((template) =>
    RETURN_TEMPLATE_SLUGS.has(template.slug as any),
  );
}

export function buildReturnTemplateInsert(
  templateDef: (typeof DEFAULT_TEMPLATES)[number],
  now: number,
) {
  return {
    slug: templateDef.slug,
    name: templateDef.name,
    description: templateDef.description,
    subjectTemplate: templateDef.subjectTemplate,
    bodyHtml: templateDef.bodyHtml,
    preheaderText: templateDef.preheaderText,
    availableVariables: templateDef.availableVariables,
    priority: templateDef.priority,
    recipientType: templateDef.recipientType,
    isActive: true,
    eventCode: templateDef.eventCode,
    isCustomized: false,
    defaultSubjectTemplate: templateDef.subjectTemplate,
    defaultBodyHtml: templateDef.bodyHtml,
    category: templateDef.category,
    lastSentAt: undefined,
    totalSent: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildMissingReturnTemplateInserts(
  existingSlugs: Iterable<string>,
  now: number,
) {
  const existing = new Set(existingSlugs);
  return getReturnTemplateDefaults()
    .filter((templateDef) => !existing.has(templateDef.slug))
    .map((templateDef) => buildReturnTemplateInsert(templateDef, now));
}

export function buildLegacyReturnHistoryEntries(returnRequest: {
  status: string;
  createdAt: number;
  updatedAt: number;
  requestedAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
  receivedAt?: number;
  refundPendingAt?: number;
  refundedAt?: number;
  completedAt?: number;
  reasonDetails?: string;
  notes?: string;
  trackingNumber?: string;
  refundMethod?: string;
  returnShippingLabel?: string;
}) {
  return [
    {
      eventType: "requested",
      fromStatus: undefined,
      toStatus: "requested",
      createdAt: returnRequest.requestedAt ?? returnRequest.createdAt,
      note: returnRequest.reasonDetails,
    },
    returnRequest.approvedAt
      ? {
          eventType: "approved",
          fromStatus: "requested",
          toStatus: "approved",
          createdAt: returnRequest.approvedAt,
          note: returnRequest.notes,
        }
      : null,
    returnRequest.rejectedAt
      ? {
          eventType: "rejected",
          fromStatus: "requested",
          toStatus: "rejected",
          createdAt: returnRequest.rejectedAt,
          note: returnRequest.notes,
        }
      : null,
    returnRequest.receivedAt
      ? {
          eventType: "received",
          fromStatus: "approved",
          toStatus: "received",
          createdAt: returnRequest.receivedAt,
          note: returnRequest.trackingNumber,
        }
      : null,
    returnRequest.refundPendingAt
      ? {
          eventType: "refund_pending",
          fromStatus: "received",
          toStatus: "refund_pending",
          createdAt: returnRequest.refundPendingAt,
          note: returnRequest.refundMethod,
        }
      : null,
    returnRequest.refundedAt
      ? {
          eventType: "refund_succeeded",
          fromStatus: "refund_pending",
          toStatus: "refunded",
          createdAt: returnRequest.refundedAt,
          note: returnRequest.refundMethod,
        }
      : null,
    returnRequest.completedAt
      ? {
          eventType: "completed",
          fromStatus: "refunded",
          toStatus: "completed",
          createdAt: returnRequest.completedAt,
          note: returnRequest.notes,
        }
      : null,
    returnRequest.returnShippingLabel
      ? {
          eventType: "label_added",
          fromStatus: returnRequest.status,
          toStatus: returnRequest.status,
          createdAt: returnRequest.updatedAt,
          note: returnRequest.trackingNumber,
        }
      : null,
  ].filter(isPresent);
}

export function buildLegacyReturnHistoryInserts(returnRequest: {
  _id: string;
  processedBy?: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  requestedAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
  receivedAt?: number;
  refundPendingAt?: number;
  refundedAt?: number;
  completedAt?: number;
  reasonDetails?: string;
  notes?: string;
  trackingNumber?: string;
  refundMethod?: string;
  returnShippingLabel?: string;
}) {
  return buildLegacyReturnHistoryEntries(returnRequest).map((entry) => ({
    returnRequestId: returnRequest._id,
    actorUserId: returnRequest.processedBy,
    actorType: returnRequest.processedBy ? "admin" : "system",
    eventType: entry.eventType,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    note: entry.note,
    createdAt: entry.createdAt,
  }));
}

export function buildLegacyReturnItemInserts(
  returnRequest: {
    _id: string;
    createdAt: number;
    updatedAt: number;
    items?: Array<{
      orderItemId?: string;
      quantity?: number;
      reason?: string;
    }>;
  },
  orderItemsById: Record<
    string,
    {
      _id: string;
      productId: string;
      variantId?: string;
    }
  >,
) {
  const normalizedItems = normalizeStoredReturnItems(returnRequest);

  return normalizedItems.flatMap((item) => {
    const orderItem = item.orderItemId
      ? orderItemsById[item.orderItemId]
      : undefined;
    if (!orderItem) return [];

    return [
      {
        returnRequestId: returnRequest._id,
        orderItemId: orderItem._id,
        productId: orderItem.productId,
        variantId: orderItem.variantId,
        quantityRequested: item.quantityRequested,
        quantityApproved: item.quantityApproved,
        quantityReceived: item.quantityReceived,
        quantityRestocked: item.quantityRestocked,
        reasonText: item.reason,
        createdAt: returnRequest.createdAt,
        updatedAt: returnRequest.updatedAt,
      },
    ];
  });
}

export async function runBackfillLegacyReturns(ctx: any, now = Date.now()) {
  let createdTemplates = 0;
  let createdReturnItems = 0;
  let createdHistoryEntries = 0;

  const existingTemplateSlugs = new Set<string>();
  for (const templateDef of getReturnTemplateDefaults()) {
    const existing = await ctx.db
      .query("emailTemplates")
      .withIndex("by_slug", (q: any) => q.eq("slug", templateDef.slug))
      .unique();

    if (existing) {
      existingTemplateSlugs.add(templateDef.slug);
    }
  }

  for (const templateInsert of buildMissingReturnTemplateInserts(
    existingTemplateSlugs,
    now,
  )) {
    await ctx.db.insert("emailTemplates", templateInsert);
    createdTemplates++;
  }

  const returns = await ctx.db.query("commerce_return_requests").collect();

  for (const returnRequest of returns) {
    const existingItems = await ctx.db
      .query("commerce_return_items")
      .withIndex("by_return_request", (q: any) =>
        q.eq("returnRequestId", returnRequest._id),
      )
      .collect();

    if (existingItems.length === 0) {
      const normalizedItems = normalizeStoredReturnItems(returnRequest);
      const orderItemsById = Object.fromEntries(
        (
          await Promise.all(
            normalizedItems.map(async (item) => {
              const orderItem = item.orderItemId
                ? await ctx.db.get(item.orderItemId)
                : null;
              return orderItem ? [item.orderItemId, orderItem] : null;
            }),
          )
        ).filter(Boolean),
      );

      for (const itemInsert of buildLegacyReturnItemInserts(
        {
          ...returnRequest,
          _id: returnRequest._id.toString(),
        },
        orderItemsById,
      )) {
        await ctx.db.insert("commerce_return_items", itemInsert);
        createdReturnItems++;
      }
    }

    const existingHistory = await ctx.db
      .query("commerce_return_history")
      .withIndex("by_return_request", (q: any) =>
        q.eq("returnRequestId", returnRequest._id),
      )
      .collect();

    if (existingHistory.length > 0) continue;

    for (const historyInsert of buildLegacyReturnHistoryInserts({
      ...returnRequest,
      _id: returnRequest._id.toString(),
      processedBy: returnRequest.processedBy?.toString(),
    })) {
      await ctx.db.insert("commerce_return_history", historyInsert);
      createdHistoryEntries++;
    }
  }

  return {
    totalReturns: returns.length,
    createdTemplates,
    createdReturnItems,
    createdHistoryEntries,
  };
}

const backfillLegacyReturnsConfig: any = {
  args: {},
  handler: async (ctx: any) => {
    await requirePluginEnabled(ctx, "commerceReturns");
    return runBackfillLegacyReturns(ctx);
  },
};

export const backfillLegacyReturns: any = internalMutation(
  backfillLegacyReturnsConfig,
);

/**
 * Admin-exposed entrypoint so the backfill can be run from the admin UI
 * (or by an operator directly) without needing shell access to run an
 * internal mutation. Idempotent: re-running only inserts rows that are
 * still missing.
 */
export const runBackfill: any = mutation({
  args: {},
  handler: async (ctx: any) => {
    await requirePluginEnabled(ctx, "commerceReturns");
    await requireCan(ctx, "commerce.returns.manage");
    await requireCommerceReturnsEnabled(ctx);
    return await runBackfillLegacyReturns(ctx);
  },
});
