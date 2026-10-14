/**
 * Commerce Subscriptions — one live subscription per customer.
 *
 * An offer marked `limitOnePerCustomer` cannot be bought by a customer who
 * already holds a live contract (not cancelled or expired) carrying any of the
 * offer's entitlement codes. They change plan from their account instead, so a
 * customer is never billed twice for the same access. Checked when checkout
 * starts and again before the card is charged; a duplicate that still slips
 * through (two checkouts paid at the same moment) is activated — the money was
 * taken — and flagged for an operator.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isEnded } from "./lifecycle";

/** The message a refused buyer sees. Stable: the Forms checkout status matches it. */
export const ALREADY_SUBSCRIBED_MESSAGE =
	"You already have an active subscription that includes this. To switch packages, change your plan from your account.";

type Reader = { db: QueryCtx["db"] };

/**
 * A live contract of `userId` that carries any of `codes`, other than `except`.
 * Revoked entitlements do not count; grace and expired-grace ones do (the
 * contract is still the customer's, waiting on payment).
 */
export async function findLiveContractWithCodes(
	ctx: Reader,
	userId: Id<"users">,
	codes: readonly string[],
	except?: Id<"commerce_subscriptions">,
): Promise<Doc<"commerce_subscriptions"> | null> {
	const wanted = new Set(codes.filter((code) => code.length > 0));
	if (wanted.size === 0) return null;
	const contracts = await ctx.db
		.query("commerce_subscriptions")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	for (const contract of contracts) {
		if (contract._id === except || contract.status === "draft" || isEnded(contract.status)) continue;
		const entitlements = await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
			.collect();
		if (entitlements.some((row) => row.status !== "revoked" && wanted.has(row.entitlementCode))) return contract;
	}
	return null;
}

/**
 * Refuse a purchase of a one-per-customer offer by a customer who already has
 * it: the signed-in buyer, or (signed out) every verified account owning the
 * checkout email.
 */
export async function assertNotAlreadySubscribed(
	ctx: Reader,
	offer: Doc<"commerce_subscription_offers">,
	buyer: { userId?: Id<"users">; email?: string },
): Promise<void> {
	if (offer.limitOnePerCustomer !== true) return;
	const codes = offer.entitlementCodes ?? [];
	const userIds: Id<"users">[] = [];
	if (buyer.userId) userIds.push(buyer.userId);
	const email = buyer.email?.trim().toLowerCase();
	if (email) {
		const owners = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", email))
			.collect();
		for (const owner of owners) if (owner.emailVerified && !userIds.includes(owner._id)) userIds.push(owner._id);
	}
	for (const userId of userIds) {
		if (await findLiveContractWithCodes(ctx, userId, codes)) {
			throw new ConvexError({ code: "ALREADY_SUBSCRIBED", message: ALREADY_SUBSCRIBED_MESSAGE });
		}
	}
}
