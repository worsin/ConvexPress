import { ConvexError } from "convex/values";
import { getCurrentUser } from "../helpers/permissions";
import { evaluateDiscount, type DiscountEvaluation } from "./discountEngine";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";


const invalid = (message: string): DiscountEvaluation => ({ eligible: false, discountAmount: 0, eligibleSubtotalAmount: 0, eligibleQuantity: 0, message });
const countedOrder = (order: any) => !["cancelled", "failed"].includes(order.status);
const MAX_CONTEXT_ROWS = 5000;

async function bounded(query: any) {
  const rows = await query.take(MAX_CONTEXT_ROWS + 1);
  if (rows.length > MAX_CONTEXT_ROWS) throw new ConvexError({ code: "COUPON_CONTEXT_LIMIT", message: "Coupon history requires administrator review." });
  return rows;
}

/** Identity comes from the authenticated user, never a client-supplied user ID/email. */
export async function evaluateCartCoupon(ctx: any, code: string | undefined, items: any[], excludeOrderId?: any) {
  if (!code) return { discount: null, evaluation: null, user: null };
  const discount = await ctx.db.query("commerce_discount_codes").withIndex("by_code", (q: any) => q.eq("code", code.trim().toUpperCase())).unique();
  const user = await getCurrentUser(ctx);
  const now = Date.now();
  if (!discount || discount.status !== "active" || (discount.startsAt != null && discount.startsAt > now) || (discount.endsAt != null && discount.endsAt < now)) {
    return { discount, user, evaluation: invalid("Discount code is invalid or unavailable.") };
  }
  const reserved = await bounded(ctx.db.query("commerce_discount_usages").withIndex("by_discount_status", (q: any) => q.eq("discountId", discount._id).eq("status", "reserved")));
  const reservations = reserved.filter((usage: any) => String(usage.orderId) !== String(excludeOrderId));
  if (typeof discount.usageLimit === "number" && Number(discount.usageCount ?? 0) + reservations.length >= discount.usageLimit) {
    return { discount, user, evaluation: invalid("This discount has reached its usage limit.") };
  }
  const restricted = discount.newCustomersOnly || discount.allowedEmails?.length || typeof discount.perUserUsageLimit === "number";
  if (restricted && (!user || user.status !== "active")) {
    return { discount, user, evaluation: invalid("Sign in to use this customer-specific discount.") };
  }
  let priorOrderCount = 0;
  let priorCodeUsageCount = 0;
  if (restricted && user) {
    const email = user.email.trim().toLowerCase();
    const byUser = await bounded(ctx.db.query("commerce_orders").withIndex("by_user", (q: any) => q.eq("userId", user._id)));
    const byEmail = await bounded(ctx.db.query("commerce_orders").withIndex("by_email", (q: any) => q.eq("email", email)));
    const orders = [...new Map([...byUser, ...byEmail].map((order: any) => [String(order._id), order])).values()]
      .filter((order: any) => String(order._id) !== String(excludeOrderId) && countedOrder(order));
    priorOrderCount = orders.length;
    // Include legacy orders without usage rows, and don't double-count new reservations.
    const usedOrders = new Set(orders.filter((order: any) => order.appliedDiscountCode === discount.code).map((order: any) => String(order._id)));
    let nonOrderUsages = 0;
    const userUsages = await bounded(ctx.db.query("commerce_discount_usages").withIndex("by_discount_user", (q: any) => q.eq("discountId", discount._id).eq("userId", user._id)));
    const emailUsages = await bounded(ctx.db.query("commerce_discount_usages").withIndex("by_discount_email", (q: any) => q.eq("discountId", discount._id).eq("customerEmail", email)));
    const usages = [...new Map([...userUsages, ...emailUsages].map((usage: any) => [String(usage._id), usage])).values()];
    for (const usage of usages) {
      if (usage.status === "released" || String(usage.orderId) === String(excludeOrderId)) continue;
      if (String(usage.userId) !== String(user._id) && usage.customerEmail?.toLowerCase() !== email) continue;
      if (usage.orderId) usedOrders.add(String(usage.orderId)); else nonOrderUsages++;
    }
    priorCodeUsageCount = usedOrders.size + nonOrderUsages;
  }
  return { discount, user, evaluation: evaluateDiscount(discount, items, { userId: user?._id, email: user?.email, priorOrderCount, priorCodeUsageCount }) };
}

/** Called in the same transaction that validates the final cart and creates its order. */
export async function reserveOrderCoupon(ctx: any, orderId: any, discount: any, user: any, email: string, amount: number) {
  if (!discount) return;
  const existing = await ctx.db.query("commerce_discount_usages").withIndex("by_order", (q: any) => q.eq("orderId", orderId)).first();
  if (existing) return;
  const now = Date.now();
  // Updating the shared rule serializes competing last-use checkouts under Convex OCC.
  await patchDynamicWithMediaReferences(ctx, discount._id, { updatedAt: now });
  await ctx.db.insert("commerce_discount_usages", {
    discountId: discount._id, userId: user?._id, customerEmail: (user?.email ?? email).trim().toLowerCase(),
    orderId, appliedAmount: amount, appliedAt: now, context: "order", status: "reserved", createdAt: now,
  });
}

export async function settleOrderCoupon(ctx: any, order: any, outcome: "consume" | "release") {
  if (!order.appliedDiscountCode || (outcome === "consume" && order.discountUsageCountedAt)) return;
  const usages = await bounded(ctx.db.query("commerce_discount_usages").withIndex("by_order", (q: any) => q.eq("orderId", order._id)));
  for (const usage of usages) {
    if (outcome === "release" && usage.status === "reserved") await patchDynamicWithMediaReferences(ctx, usage._id, { status: "released" });
    if (outcome === "consume" && usage.status === "reserved") await patchDynamicWithMediaReferences(ctx, usage._id, { status: "consumed" });
  }
  if (outcome === "consume") {
    const discount = await ctx.db.query("commerce_discount_codes").withIndex("by_code", (q: any) => q.eq("code", order.appliedDiscountCode)).unique();
    if (discount) await patchDynamicWithMediaReferences(ctx, discount._id, { usageCount: Number(discount.usageCount ?? 0) + 1, updatedAt: Date.now() });
    await patchDynamicWithMediaReferences(ctx, order._id, { discountUsageCountedAt: Date.now() });
  }
}
