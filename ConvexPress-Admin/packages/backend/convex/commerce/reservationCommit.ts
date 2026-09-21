import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { readCheckoutReservations, readRecordedStockTarget } from "./stockTarget";

type StockTarget = Awaited<ReturnType<typeof readRecordedStockTarget>>;
export type ReservationCommitEntry = {
  reservation: Doc<"commerce_stock_reservations">;
  target: StockTarget;
  locationLevel: Doc<"commerce_inventory_levels"> | null;
  nextStock: number;
};

/** Validate the complete allocation before any writes, including shared owners.
 * Paid callers may turn these domain conflicts into fulfillment review without
 * consuming some stock and silently retrying the rest through a different path.
 */
export async function prepareReservationCommit(
  ctx: Pick<QueryCtx,"db">,
  checkoutSessionId: Id<"commerce_checkout_sessions">,
  orderId: Id<"commerce_orders">,
  now = Date.now(),
): Promise<{alreadyCommitted:boolean; entries:ReservationCommitEntry[]}> {
  const order:Doc<"commerce_orders">|null = await ctx.db.get(orderId);
  if (!order || (order.checkoutSessionId && order.checkoutSessionId !== checkoutSessionId)) {
    throw new ConvexError({code:"INVENTORY_ORDER_MISMATCH",message:"The inventory checkout does not belong to this order."});
  }
  if (order.inventoryCommittedAt !== undefined) return {alreadyCommitted:true,entries:[]};
  if (order.inventoryReleasedAt !== undefined) {
    throw new ConvexError({code:"INVENTORY_ALREADY_RELEASED",message:"This order's inventory was already released."});
  }
  const reservations = await readCheckoutReservations(ctx,checkoutSessionId);
  if (order.inventoryReservationCount !== undefined && reservations.length !== order.inventoryReservationCount) {
    throw new ConvexError({code:"INVENTORY_RESERVATION_MISSING",message:"The original checkout stock reservations are no longer complete."});
  }
  const entries:ReservationCommitEntry[] = [];
  const remaining = new Map<string,number>();
  for (const reservation of reservations) {
    if (reservation.expiresAt <= now) {
      throw new ConvexError({code:"INVENTORY_RESERVATION_EXPIRED",message:"The checkout stock reservation expired before commitment."});
    }
    if (!Number.isSafeInteger(reservation.quantity) || reservation.quantity <= 0) {
      throw new ConvexError({code:"INVALID_STOCK",message:"The reserved quantity must be a positive whole number."});
    }
    const target = await readRecordedStockTarget(ctx,reservation.productId,reservation.variantId);
    let locationLevel:Doc<"commerce_inventory_levels">|null = null;
    if (reservation.locationId) {
      const levels:Doc<"commerce_inventory_levels">[] = await ctx.db.query("commerce_inventory_levels")
        .withIndex("by_product_location",q=>q.eq("productId",reservation.productId).eq("locationId",reservation.locationId!)).take(201);
      if (levels.length > 200) throw new ConvexError({code:"INVENTORY_CAPACITY",message:"Inventory location exceeds the supported request budget."});
      const matching = levels.filter(level=>level.variantId === reservation.variantId);
      if (matching.length !== 1 || matching[0].isActive === false) {
        throw new ConvexError({code:"INVENTORY_TARGET_MISSING",message:"The reserved inventory location needs review."});
      }
      locationLevel = matching[0];
    }
    const owner = String(locationLevel?._id ?? target.patchId);
    const previousStock = remaining.get(owner) ?? locationLevel?.stockQuantity ?? target.stockQuantity;
    const safety = locationLevel?.safetyStockQuantity ?? 0;
    const nextStock = previousStock - reservation.quantity;
    if (!Number.isSafeInteger(previousStock) || !Number.isSafeInteger(nextStock) || !Number.isSafeInteger(safety) || safety < 0) {
      throw new ConvexError({code:"INVALID_STOCK",message:"Inventory quantities must be safe whole numbers."});
    }
    // Legacy holds did not record permission: never infer a new backorder grant
    // from today's settings after the order was placed.
    if (!reservation.allowBackorders && nextStock < safety) {
      throw new ConvexError({code:"INSUFFICIENT_STOCK",message:"Reserved inventory changed before commitment and needs review."});
    }
    remaining.set(owner,nextStock);
    entries.push({reservation,target,locationLevel,nextStock});
  }
  return {alreadyCommitted:false,entries};
}

export function isInventoryCommitConflict(error: unknown): boolean {
  return error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "code" in error.data && [
    "INVENTORY_ORDER_MISMATCH","INVENTORY_ALREADY_RELEASED","INVENTORY_RESERVATION_MISSING",
    "INVENTORY_RESERVATION_EXPIRED","INVENTORY_TARGET_MISSING","INSUFFICIENT_STOCK","INVALID_STOCK",
  ].includes(String(error.data.code));
}
