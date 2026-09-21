import { paginationOptsValidator } from "convex/server";
import type { PaginationOptions, PaginationResult, RegisteredMutation, RegisteredQuery } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { assistantScope } from "./assistant/scope";
import { mergeCartForSession } from "./cart";
import { isClosedCart } from "./cartLifecycle";
import { emitEvent } from "../helpers/events";
import { CART_EVENTS, SYSTEM } from "../events/constants";

const savedStatus = v.union(v.literal("active"), v.literal("abandoned"), v.literal("pending_payment"));
type SavedStatus = "active" | "abandoned" | "pending_payment";
type SavedCart = { id: Id<"commerce_carts">; itemCount: number; currencyCode: string; status: SavedStatus; updatedAt: number };
type ListArgs = { sessionToken: string; status: SavedStatus; paginationOpts: PaginationOptions };
type SelectArgs = { sessionToken: string; cartId: Id<"commerce_carts"> };

/** Saved baskets are owner-only. Never expose their bearer tokens in a list. */
export const listSaved: RegisteredQuery<"public", ListArgs, PaginationResult<SavedCart>> = query({
  args: { sessionToken: v.string(), status: savedStatus, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.object({ id: v.id("commerce_carts"), itemCount: v.number(), currencyCode: v.string(), status: savedStatus, updatedAt: v.number() })),
    isDone: v.boolean(), continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx: QueryCtx, args: ListArgs): Promise<PaginationResult<SavedCart>> => {
    const scope = await assistantScope(ctx, args.sessionToken);
    if (!scope.user) throw new ConvexError({ code: "UNAUTHORIZED", message: "Sign in to view saved baskets." });
    const userId = scope.user._id;
    const result = await ctx.db.query("commerce_carts")
      .withIndex("by_user_status", q => q.eq("userId", userId).eq("status", args.status))
      .order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(20, args.paginationOpts.numItems) });
    return { ...result, page: result.page.filter(cart => cart._id !== scope.cart?._id).map(cart => ({
      id: cart._id, itemCount: cart.itemCount, currencyCode: cart.currencyCode,
      status: args.status, updatedAt: cart.updatedAt,
    })) };
  },
});

const selectArgs = { sessionToken: v.string(), cartId: v.id("commerce_carts") };

/** Selecting a basket preserves its token, checkout and assistant history. */
export const selectSaved: RegisteredMutation<"public", SelectArgs, string> = mutation({
  args: selectArgs,
  returns: v.string(),
  handler: async (ctx: MutationCtx, args: SelectArgs): Promise<string> => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const cart = await ctx.db.get("commerce_carts", args.cartId);
    if (!scope.user || !cart || cart.userId !== scope.user._id || isClosedCart(cart)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "This saved basket is no longer available." });
    }
    await assistantScope(ctx, cart.sessionToken);
    if (cart.status === "abandoned") {
      await ctx.db.patch("commerce_carts", cart._id, { status: "active", recoveredAt: Date.now(), updatedAt: Date.now() });
      await emitEvent(ctx, CART_EVENTS.RECOVERED, SYSTEM.CART, { cartId: cart._id, userId: scope.user._id });
    }
    return cart.sessionToken;
  },
});

/** An explicit retry either combines both baskets atomically or changes neither. */
export const combineSaved: RegisteredMutation<"public", SelectArgs, string> = mutation({
  args: selectArgs,
  returns: v.string(),
  handler: async (ctx: MutationCtx, args: SelectArgs): Promise<string> => {
    const scope = await assistantScope(ctx, args.sessionToken);
    if (!scope.user || !scope.cart || (isClosedCart(scope.cart) && !(scope.cart.status === "merged" && scope.cart.mergedIntoCartId === args.cartId && scope.cart.userId === scope.user._id))) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Open your current basket before combining it." });
    }
    const cartId = await mergeCartForSession(ctx, args, args.cartId);
    const cart = cartId ? await ctx.db.get("commerce_carts", cartId) : null;
    if (!cart) throw new ConvexError({ code: "NOT_FOUND", message: "The saved basket is no longer available." });
    await assistantScope(ctx, cart.sessionToken);
    return cart.sessionToken;
  },
});
