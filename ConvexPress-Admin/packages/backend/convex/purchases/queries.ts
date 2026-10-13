import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { purchasesDocs } from "../schema/purchases.docs.generated";
import { getCurrentUser, requireCan } from "../helpers/permissions";

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

const sourceTypeArg = v.optional(
  v.union(
    v.literal("storefront_order"),
    v.literal("form_order"),
    v.literal("subscription_signup"),
    v.literal("subscription_invoice"),
    v.literal("manual"),
    v.literal("api"),
  ),
);

const orderStatusArg = v.optional(
  v.union(
    v.literal("draft"),
    v.literal("pending"),
    v.literal("payment_pending"),
    v.literal("paid"),
    v.literal("payment_failed"),
    v.literal("partially_refunded"),
    v.literal("refunded"),
    v.literal("cancelled"),
    v.literal("fulfilled"),
  ),
);

const paymentStatusArg = v.optional(
  v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("requires_action"),
    v.literal("authorized"),
    v.literal("captured"),
    v.literal("paid"),
    v.literal("failed"),
    v.literal("cancelled"),
    v.literal("partially_refunded"),
    v.literal("refunded"),
  ),
);

const listArgs = {
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  search: v.optional(v.string()),
  sourceType: sourceTypeArg,
  status: orderStatusArg,
  paymentStatus: paymentStatusArg,
  userId: v.optional(v.id("users")),
  customerId: v.optional(v.id("commerce_customer_profiles")),
  email: v.optional(v.string()),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  orderBy: v.optional(v.string()),
  orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
};

type PurchaseOrder = Doc<"purchase_orders">;

type PurchaseFilterArgs = {
  search?: string;
  sourceType?: PurchaseOrder["sourceType"];
  status?: PurchaseOrder["status"];
  paymentStatus?: PurchaseOrder["paymentStatus"];
  userId?: Id<"users">;
  customerId?: Id<"commerce_customer_profiles">;
  email?: string;
  dateFrom?: number;
  dateTo?: number;
};

const purchaseWithCountsValidator = purchasesDocs.purchase_orders.extend({
  lineCount: v.number(),
  itemTotalQuantity: v.number(),
});

const purchaseDetailValidator = purchasesDocs.purchase_orders.extend({
  lines: v.array(purchasesDocs.purchase_order_lines),
  payments: v.array(purchasesDocs.purchase_payments),
  refunds: v.array(purchasesDocs.purchase_refunds),
  events: v.array(purchasesDocs.purchase_order_events),
});

function applyFilters(rows: PurchaseOrder[], args: PurchaseFilterArgs): PurchaseOrder[] {
  let out = rows;
  const search = args.search?.trim();
  if (search) {
    const needle = search.toLowerCase();
    out = out.filter((row) =>
      [
        row.orderNumber,
        row.email,
        row.customerName,
        row.sourceLabel,
        row.sourceId,
      ].some((value) => String(value ?? "").toLowerCase().includes(needle)),
    );
  }
  if (args.sourceType) out = out.filter((row) => row.sourceType === args.sourceType);
  if (args.status) out = out.filter((row) => row.status === args.status);
  if (args.paymentStatus) {
    out = out.filter((row) => row.paymentStatus === args.paymentStatus);
  }
  if (args.userId) out = out.filter((row) => row.userId === args.userId);
  if (args.customerId) out = out.filter((row) => row.customerId === args.customerId);
  const email = args.email?.trim().toLowerCase();
  if (email) {
    out = out.filter((row) => (row.email ?? "").toLowerCase() === email);
  }
  const { dateFrom, dateTo } = args;
  if (dateFrom) out = out.filter((row) => row.createdAt >= dateFrom);
  if (dateTo) out = out.filter((row) => row.createdAt <= dateTo);
  return out;
}

/** Orders two field values the way the admin table sorts: numbers numerically, strings lexically. */
function comparePurchaseValues(a: unknown, b: unknown): number {
  const av = a ?? 0;
  const bv = b ?? 0;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  if (typeof av === "boolean" && typeof bv === "boolean") return Number(av) - Number(bv);
  if (typeof av === "string" && typeof bv === "string") {
    return av < bv ? -1 : av > bv ? 1 : 0;
  }
  return 0;
}

function sortPurchases(rows: PurchaseOrder[], orderBy?: string, orderDir?: "asc" | "desc") {
  const direction = orderDir === "asc" ? 1 : -1;
  const key = orderBy ?? "createdAt";
  rows.sort((a, b) => {
    const left: Record<string, unknown> = a;
    const right: Record<string, unknown> = b;
    return Math.sign(comparePurchaseValues(left[key], right[key])) * direction;
  });
}

async function withCounts(ctx: { db: QueryCtx["db"] }, purchase: PurchaseOrder) {
  const lines = await ctx.db
    .query("purchase_order_lines")
    .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", purchase._id))
    .collect();
  return {
    ...purchase,
    lineCount: lines.length,
    itemTotalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

async function enrich(ctx: { db: QueryCtx["db"] }, purchase: PurchaseOrder) {
  const [lines, payments, refunds, events] = await Promise.all([
    ctx.db
      .query("purchase_order_lines")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
    ctx.db
      .query("purchase_payments")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
    ctx.db
      .query("purchase_refunds")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
    ctx.db
      .query("purchase_order_events")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
  ]);

  return {
    ...purchase,
    lines: lines.sort((a, b) => a.createdAt - b.createdAt),
    payments: payments.sort((a, b) => b.createdAt - a.createdAt),
    refunds: refunds.sort((a, b) => b.createdAt - a.createdAt),
    events: events.sort((a, b) => a.createdAt - b.createdAt),
  };
}

export const list = query({
  args: listArgs,
  returns: v.object({
    items: v.array(purchaseWithCountsValidator),
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE));

    const { sourceType, status, paymentStatus } = args;
    let rows: PurchaseOrder[] = [];
    const term = args.search?.trim();
    if (term) {
      const searchResults = await ctx.db
        .query("purchase_orders")
        .withSearchIndex("search_purchase_orders", (q) => {
          let sq = q.search("orderNumber", term);
          if (sourceType) sq = sq.eq("sourceType", sourceType);
          if (status) sq = sq.eq("status", status);
          if (paymentStatus) sq = sq.eq("paymentStatus", paymentStatus);
          return sq;
        })
        .take(2000);
      const emailMatches = term.includes("@")
        ? await ctx.db
            .query("purchase_orders")
            .withIndex("by_email", (q) => q.eq("email", term.toLowerCase()))
            .take(500)
        : [];
      const seen = new Set<string>();
      rows = [...searchResults, ...emailMatches].filter((row) => {
        const key = String(row._id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else if (sourceType) {
      rows = await ctx.db
        .query("purchase_orders")
        .withIndex("by_source_type", (q) => q.eq("sourceType", sourceType))
        .order("desc")
        .take(20000);
    } else if (status) {
      rows = await ctx.db
        .query("purchase_orders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(20000);
    } else if (paymentStatus) {
      rows = await ctx.db
        .query("purchase_orders")
        .withIndex("by_payment_status", (q) => q.eq("paymentStatus", paymentStatus))
        .order("desc")
        .take(20000);
    } else {
      rows = await ctx.db
        .query("purchase_orders")
        .withIndex("by_createdAt")
        .order("desc")
        .take(20000);
    }

    const filtered = applyFilters(rows, args);
    sortPurchases(filtered, args.orderBy, args.orderDir);
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const slice = filtered.slice((page - 1) * perPage, page * perPage);
    const items = await Promise.all(slice.map((row) => withCounts(ctx, row)));
    return { items, total, page, perPage, totalPages };
  },
});

export const counts = query({
  args: {
    sourceType: sourceTypeArg,
    search: v.optional(v.string()),
    email: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    customerId: v.optional(v.id("commerce_customer_profiles")),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const rows = await ctx.db
      .query("purchase_orders")
      .withIndex("by_createdAt")
      .take(20000);
    const filtered = applyFilters(rows, args);
    const out: Record<string, number> = {
      all: filtered.length,
      payment_pending: 0,
      paid: 0,
      payment_failed: 0,
      partially_refunded: 0,
      refunded: 0,
      cancelled: 0,
      fulfilled: 0,
      storefront_order: 0,
      form_order: 0,
      subscription_signup: 0,
      subscription_invoice: 0,
    };
    for (const row of filtered) {
      if (out[row.status] !== undefined) out[row.status]++;
      if (out[row.sourceType] !== undefined) out[row.sourceType]++;
    }
    return out;
  },
});

export const get = query({
  args: { purchaseOrderId: v.id("purchase_orders") },
  returns: v.union(v.null(), purchaseDetailValidator),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const purchase = await ctx.db.get(args.purchaseOrderId);
    return purchase ? enrich(ctx, purchase) : null;
  },
});

export const getByAnyId = query({
  args: { id: v.string() },
  returns: v.union(v.null(), purchaseDetailValidator),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const purchase = await findPurchaseByAnyId(ctx, args.id);
    return purchase ? enrich(ctx, purchase) : null;
  },
});

async function findPurchaseByAnyId(
  ctx: { db: QueryCtx["db"] },
  id: string,
): Promise<PurchaseOrder | null> {
  const directId = ctx.db.normalizeId("purchase_orders", id);
  if (directId) {
    const direct = await ctx.db.get(directId);
    if (direct) return direct;
  }

  const sourceTypes: PurchaseOrder["sourceType"][] = [
    "storefront_order",
    "form_order",
    "subscription_signup",
    "subscription_invoice",
  ];
  for (const sourceType of sourceTypes) {
    const row = await ctx.db
      .query("purchase_orders")
      .withIndex("by_source", (q) => q.eq("sourceType", sourceType).eq("sourceId", id))
      .first();
    if (row) return row;
  }
  return null;
}

function ownsPurchase(
  user: { _id: Id<"users">; email?: string },
  purchase: PurchaseOrder,
): boolean {
  if (purchase.userId && purchase.userId === user._id) return true;
  if (purchase.email && user.email) {
    return purchase.email.toLowerCase() === user.email.toLowerCase();
  }
  return false;
}

export const listMine = query({
  args: {},
  returns: v.array(purchaseWithCountsValidator),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const byUser = await ctx.db
      .query("purchase_orders")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const userEmail = user.email;
    const byEmail = userEmail
      ? await ctx.db
          .query("purchase_orders")
          .withIndex("by_email", (q) => q.eq("email", userEmail.toLowerCase()))
          .collect()
      : [];

    const seen = new Set<string>();
    const rows = [...byUser, ...byEmail].filter((row) => {
      const key = String(row._id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(rows.map((row) => withCounts(ctx, row)));
  },
});

export const getMineByAnyId = query({
  args: { id: v.string() },
  returns: v.union(v.null(), purchaseDetailValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const purchase = await findPurchaseByAnyId(ctx, args.id);
    if (!purchase) return null;
    if (!ownsPurchase(user, purchase)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot access this purchase.",
      });
    }
    return enrich(ctx, purchase);
  },
});
