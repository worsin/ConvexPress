// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { query } from "../_generated/server";
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

function applyFilters(rows: any[], args: any) {
  let out = rows;
  if (args.search?.trim()) {
    const needle = args.search.trim().toLowerCase();
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
  if (args.userId) out = out.filter((row) => String(row.userId) === String(args.userId));
  if (args.customerId) out = out.filter((row) => String(row.customerId) === String(args.customerId));
  if (args.email?.trim()) {
    const email = args.email.trim().toLowerCase();
    out = out.filter((row) => String(row.email ?? "").toLowerCase() === email);
  }
  if (args.dateFrom) out = out.filter((row) => Number(row.createdAt ?? 0) >= args.dateFrom);
  if (args.dateTo) out = out.filter((row) => Number(row.createdAt ?? 0) <= args.dateTo);
  return out;
}

function sortPurchases(rows: any[], orderBy?: string, orderDir?: "asc" | "desc") {
  const direction = orderDir === "asc" ? 1 : -1;
  const key = orderBy ?? "createdAt";
  rows.sort((a, b) => {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (av < bv) return -1 * direction;
    if (av > bv) return 1 * direction;
    return 0;
  });
}

async function withCounts(ctx: any, purchase: any) {
  const lines = await ctx.db
    .query("purchase_order_lines")
    .withIndex("by_purchase_order", (q: any) => q.eq("purchaseOrderId", purchase._id))
    .collect();
  return {
    ...purchase,
    lineCount: lines.length,
    itemTotalQuantity: lines.reduce((sum: number, line: any) => sum + Number(line.quantity ?? 0), 0),
  };
}

async function enrich(ctx: any, purchase: any) {
  const [lines, payments, refunds, events] = await Promise.all([
    ctx.db
      .query("purchase_order_lines")
      .withIndex("by_purchase_order", (q: any) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
    ctx.db
      .query("purchase_payments")
      .withIndex("by_purchase_order", (q: any) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
    ctx.db
      .query("purchase_refunds")
      .withIndex("by_purchase_order", (q: any) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
    ctx.db
      .query("purchase_order_events")
      .withIndex("by_purchase_order", (q: any) => q.eq("purchaseOrderId", purchase._id))
      .collect(),
  ]);

  return {
    ...purchase,
    lines: lines.sort((a: any, b: any) => a.createdAt - b.createdAt),
    payments: payments.sort((a: any, b: any) => b.createdAt - a.createdAt),
    refunds: refunds.sort((a: any, b: any) => b.createdAt - a.createdAt),
    events: events.sort((a: any, b: any) => a.createdAt - b.createdAt),
  };
}

export const list = query({
  args: listArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE));

    let rows: any[] = [];
    if (args.search?.trim()) {
      const term = args.search.trim();
      const searchResults = await ctx.db
        .query("purchase_orders")
        .withSearchIndex("search_purchase_orders", (q: any) => {
          let sq = q.search("orderNumber", term);
          if (args.sourceType) sq = sq.eq("sourceType", args.sourceType);
          if (args.status) sq = sq.eq("status", args.status);
          if (args.paymentStatus) sq = sq.eq("paymentStatus", args.paymentStatus);
          return sq;
        })
        .take(2000);
      const emailMatches = term.includes("@")
        ? await ctx.db
            .query("purchase_orders")
            .withIndex("by_email", (q: any) => q.eq("email", term.toLowerCase()))
            .take(500)
        : [];
      const seen = new Set<string>();
      rows = [...searchResults, ...emailMatches].filter((row: any) => {
        const key = String(row._id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else if (args.sourceType) {
      rows = await ctx.db
        .query("purchase_orders")
        .withIndex("by_source_type", (q: any) => q.eq("sourceType", args.sourceType))
        .order("desc")
        .take(20000);
    } else if (args.status) {
      rows = await ctx.db
        .query("purchase_orders")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .order("desc")
        .take(20000);
    } else if (args.paymentStatus) {
      rows = await ctx.db
        .query("purchase_orders")
        .withIndex("by_payment_status", (q: any) => q.eq("paymentStatus", args.paymentStatus))
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
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const purchase = await ctx.db.get(args.purchaseOrderId);
    return purchase ? enrich(ctx, purchase) : null;
  },
});

export const getByAnyId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const purchase = await findPurchaseByAnyId(ctx, args.id);
    return purchase ? enrich(ctx, purchase) : null;
  },
});

async function findPurchaseByAnyId(ctx: any, id: string) {
  try {
    const direct = await ctx.db.get(id as any);
    if (direct && direct.sourceType && direct.sourceId) return direct;
  } catch {
    // Continue to source lookups.
  }

  const sourceTypes = [
    "storefront_order",
    "form_order",
    "subscription_signup",
    "subscription_invoice",
  ];
  for (const sourceType of sourceTypes) {
    const row = await ctx.db
      .query("purchase_orders")
      .withIndex("by_source", (q: any) => q.eq("sourceType", sourceType).eq("sourceId", id))
      .first();
    if (row) return row;
  }
  return null;
}

function ownsPurchase(user: any, purchase: any): boolean {
  if (purchase.userId && String(purchase.userId) === String(user._id)) return true;
  if (purchase.email && user.email) {
    return String(purchase.email).toLowerCase() === String(user.email).toLowerCase();
  }
  return false;
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const byUser = await ctx.db
      .query("purchase_orders")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    const byEmail = user.email
      ? await ctx.db
          .query("purchase_orders")
          .withIndex("by_email", (q: any) => q.eq("email", user.email.toLowerCase()))
          .collect()
      : [];

    const seen = new Set<string>();
    const rows = [...byUser, ...byEmail].filter((row: any) => {
      const key = String(row._id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    rows.sort((a: any, b: any) => b.createdAt - a.createdAt);
    return Promise.all(rows.map((row: any) => withCounts(ctx, row)));
  },
});

export const getMineByAnyId = query({
  args: { id: v.string() },
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
