import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";

type OwnedResource = { userId?: Id<"users"> };

export async function getCurrentShopper(ctx: Parameters<typeof getCurrentUser>[0]) {
  const user = await getCurrentUser(ctx);
  if (user && user.status !== "active") {
    throw new ConvexError({ code: "FORBIDDEN", message: "This account cannot shop." });
  }
  return user;
}

/** A browser token is authority only while the resource remains unowned. */
export function assertShopperOwnership(resource: OwnedResource, userId?: Id<"users">) {
  if (resource.userId && resource.userId !== userId) {
    throw new ConvexError({ code: "FORBIDDEN", message: "This shopping session belongs to another account." });
  }
}

export function assertCartAccess(
  cart: OwnedResource & { sessionToken: string },
  sessionToken?: string,
  userId?: Id<"users">,
) {
  assertShopperOwnership(cart, userId);
  if (!cart.userId && (!sessionToken?.trim() || cart.sessionToken !== sessionToken.trim())) {
    throw new ConvexError({ code: "FORBIDDEN", message: "You cannot access this cart." });
  }
}

/** Check the persisted cart too: a guest checkout may predate account adoption. */
export async function assertCheckoutAccess(
  ctx: Parameters<typeof getCurrentUser>[0],
  session: OwnedResource & { cartId: Id<"commerce_carts">; sessionToken: string },
  sessionToken: string,
) {
  const user = await getCurrentShopper(ctx);
  assertShopperOwnership(session, user?._id);
  if (session.sessionToken !== sessionToken.trim()) {
    throw new ConvexError({ code: "FORBIDDEN", message: "You cannot access this checkout." });
  }
  const cart = await ctx.db.get("commerce_carts", session.cartId);
  if (!cart) throw new ConvexError({ code: "NOT_FOUND", message: "Cart not found." });
  // Completed carts can have a retired token; their checkout keeps its own token.
  assertShopperOwnership(cart, user?._id);
  return { user, cart };
}
