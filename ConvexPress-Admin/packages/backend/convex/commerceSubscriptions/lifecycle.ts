/**
 * Commerce Subscriptions — contract lifecycle.
 *
 * The one implementation of a contract's status machine and what follows from
 * a status change: entitlements (and the membership bridge) follow the status,
 * a contract that ends has its unpaid billing closed, history is written and
 * lifecycle events are emitted. Renewals, dunning and expiry (`internals.ts`)
 * and admin and owner actions (`mutations.ts`) all move contracts through
 * `transitionSubscription`, so a contract behaves the same whichever path
 * moved it.
 *
 * Terms come from the contract itself first (its billing interval and
 * template), then a store product's subscription override when the contract
 * has a product. A contract sold from a custom offer has no product and
 * resolves from its template alone.
 */
import type { WithoutSystemFields } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SUBSCRIPTION_EVENTS } from "../events/constants";
import { emitEvent } from "../helpers/events";
import { isPluginEnabled } from "../helpers/plugins";
import { readMergedSettingsSection } from "../settings/read";
import { decideBridgeCall } from "./bridgeDecisions";

export type SubscriptionDoc = Doc<"commerce_subscriptions">;
export type SubscriptionStatus = SubscriptionDoc["status"];
export type BillingInterval = NonNullable<SubscriptionDoc["billingInterval"]>;
export type SubscriptionPatch = Partial<WithoutSystemFields<SubscriptionDoc>>;

export const STATUS_TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
	draft: ["trialing", "active", "cancelled"],
	trialing: ["active", "past_due", "paused", "pending_cancel", "cancelled", "expired"],
	active: ["past_due", "paused", "pending_cancel", "cancelled", "expired"],
	past_due: ["active", "paused", "pending_cancel", "cancelled", "expired"],
	paused: ["active", "pending_cancel", "cancelled", "expired"],
	pending_cancel: ["active", "cancelled", "expired"],
	cancelled: [],
	expired: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
	return STATUS_TRANSITIONS[from].includes(to);
}

/** A contract that has ended: no access, nothing further to bill. */
export function isEnded(status: SubscriptionStatus): status is "cancelled" | "expired" {
	return status === "cancelled" || status === "expired";
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(timestamp: number, days: number): number {
	return timestamp + days * DAY_MS;
}

/**
 * The end of a billing period that starts at `timestamp`, in UTC. Months and
 * years keep the start's day of the month, clamped to the target month's last
 * day: a period from Jan 31 ends Feb 28 (29), never rolling over into March.
 */
export function addBillingPeriod(timestamp: number, interval: BillingInterval, intervalCount: number): number {
	if (interval === "day") return timestamp + intervalCount * DAY_MS;
	if (interval === "week") return timestamp + 7 * intervalCount * DAY_MS;
	const months = interval === "month" ? intervalCount : 12 * intervalCount;
	const date = new Date(timestamp);
	const day = date.getUTCDate();
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() + months);
	const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
	date.setUTCDate(Math.min(day, lastDay));
	return date.getTime();
}

export function createCorrelationId(): string {
	return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── History ────────────────────────────────────────────────────────────────

export type HistoryEntry = {
	subscriptionId: Id<"commerce_subscriptions">;
	eventType: string;
	message?: string;
	actorUserId?: Id<"users">;
	fromStatus?: SubscriptionStatus;
	toStatus?: SubscriptionStatus;
	reason?: string;
	data?: Record<string, unknown>;
	correlationId?: string;
};

export async function writeHistory(ctx: MutationCtx, entry: HistoryEntry): Promise<void> {
	await ctx.db.insert("commerce_subscription_history", {
		subscriptionId: entry.subscriptionId,
		eventType: entry.eventType,
		message: entry.message ?? entry.eventType,
		actorUserId: entry.actorUserId,
		metadata: {
			fromStatus: entry.fromStatus,
			toStatus: entry.toStatus,
			reason: entry.reason,
			data: entry.data,
			correlationId: entry.correlationId,
		},
		createdAt: Date.now(),
	});
}

// ─── Terms ──────────────────────────────────────────────────────────────────

export type DunningPolicy = {
	/** Days after each failed charge until the next retry. One entry per retry. */
	retryIntervalsDays: readonly number[];
	/** Cancel the contract when the last retry fails. */
	cancelAfterFinalFailure: boolean;
};

/**
 * Retry 1, 3 and 7 days after a failed renewal charge (four charges in all over
 * eleven days), then cancel.
 */
export const DEFAULT_DUNNING_POLICY: DunningPolicy = {
	retryIntervalsDays: [1, 3, 7],
	cancelAfterFinalFailure: true,
};

export const DEFAULT_GRACE_PERIOD_DAYS = 3;

export const MAX_DUNNING_RETRIES = 8;
export const MAX_DUNNING_RETRY_GAP_DAYS = 30;

/** A template's retry schedule, checked: whole days, 1–30 apart, at most 8 retries. */
export function assertValidRetryDays(days: readonly number[]): void {
	if (days.length > MAX_DUNNING_RETRIES) {
		throw new ConvexError({ code: "VALIDATION_ERROR", message: `At most ${MAX_DUNNING_RETRIES} retries.` });
	}
	for (const gap of days) {
		if (!Number.isInteger(gap) || gap < 1 || gap > MAX_DUNNING_RETRY_GAP_DAYS) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: `Each retry waits a whole number of days, 1 to ${MAX_DUNNING_RETRY_GAP_DAYS}.`,
			});
		}
	}
}

/** The retry policy a template sets, or the default. */
export function dunningPolicyFor(template: Doc<"commerce_subscription_templates"> | null): DunningPolicy {
	return {
		retryIntervalsDays: template?.dunningRetryDays ?? DEFAULT_DUNNING_POLICY.retryIntervalsDays,
		cancelAfterFinalFailure: template?.cancelAfterFinalFailure ?? DEFAULT_DUNNING_POLICY.cancelAfterFinalFailure,
	};
}

export type LifecycleTerms = {
	billingInterval: BillingInterval;
	billingIntervalCount: number;
	gracePeriodDays: number;
	pausable: boolean;
	dunningPolicy: DunningPolicy;
};

export async function resolveLifecycleTerms(
	ctx: { db: QueryCtx["db"] },
	subscription: SubscriptionDoc,
): Promise<LifecycleTerms> {
	const productId = subscription.productId;
	const override = productId
		? await ctx.db
				.query("commerce_product_subscription_overrides")
				.withIndex("by_product", (q) => q.eq("productId", productId))
				.first()
		: null;
	const templateId = subscription.templateId ?? override?.templateId;
	const template = templateId ? await ctx.db.get(templateId) : null;
	return {
		billingInterval:
			subscription.billingInterval ?? override?.overrideBillingInterval ?? template?.billingInterval ?? "month",
		billingIntervalCount:
			subscription.billingIntervalCount ??
			override?.overrideBillingIntervalCount ??
			template?.billingIntervalCount ??
			1,
		gracePeriodDays: override?.overrideGracePeriodDays ?? template?.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS,
		pausable: override?.overridePausable ?? template?.pausable ?? true,
		dunningPolicy: dunningPolicyFor(template),
	};
}

// ─── Entitlements ───────────────────────────────────────────────────────────

/**
 * Whether subscription grants reach membership: both plugins on and
 * `membership.acceptSubscriptionGrants` not switched off.
 */
async function isBridgeEnabled(ctx: QueryCtx | MutationCtx): Promise<boolean> {
	if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return false;
	if (!(await isPluginEnabled(ctx, "membership"))) return false;
	const values = await readMergedSettingsSection(ctx, "membership.general");
	return values.acceptSubscriptionGrants !== false;
}

type EntitlementDoc = Doc<"commerce_subscription_entitlements">;
type EntitlementPatch = Partial<WithoutSystemFields<EntitlementDoc>>;

/**
 * The entitlement change a contract status calls for, or null when the row
 * already says it. Grace is anchored to the moment access first left `active`:
 * a later failure or retry never extends it.
 */
function entitlementPatchFor(
	status: SubscriptionStatus,
	entitlement: EntitlementDoc,
	now: number,
	gracePeriodDays: number,
): EntitlementPatch | null {
	if (status === "active" || status === "trialing") {
		// Revoked stays revoked: an operator or a plan change removed it, and a
		// contract that ended never serves again.
		if (entitlement.status === "revoked") return null;
		if (entitlement.status === "active" && entitlement.endsAt === undefined && entitlement.graceEndsAt === undefined) {
			return null;
		}
		return { status: "active", endsAt: undefined, graceEndsAt: undefined, updatedAt: now };
	}
	if (status === "past_due" || status === "paused") {
		if (entitlement.status !== "active") return null;
		return { status: "grace", graceEndsAt: addDays(now, gracePeriodDays), updatedAt: now };
	}
	if (isEnded(status)) {
		if (entitlement.status === "revoked") return null;
		return { status: "revoked", endsAt: now, updatedAt: now };
	}
	// draft and pending_cancel: access is unchanged (a scheduled cancellation
	// keeps serving until the period ends).
	return null;
}

export async function syncEntitlementsForStatus(
	ctx: MutationCtx,
	subscription: SubscriptionDoc,
	now: number,
	gracePeriodDays: number,
): Promise<void> {
	const entitlements = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
		.collect();

	for (const entitlement of entitlements) {
		const patch = entitlementPatchFor(subscription.status, entitlement, now, gracePeriodDays);
		if (patch) await ctx.db.patch("commerce_subscription_entitlements", entitlement._id, patch);
	}

	if (!(await isBridgeEnabled(ctx))) return;

	// One entitlement's bridge failure must not block the others or the status
	// change itself; it is recorded in the contract's history instead.
	for (const entitlement of entitlements) {
		const decision = decideBridgeCall({ subscription, entitlement, gracePeriodDays });
		if (decision.action === "noop") continue;
		try {
			if (decision.action === "grant") {
				await ctx.runMutation(internal.membership.internals.grantFromSubscription, decision.args);
			} else if (decision.action === "moveToGrace") {
				await ctx.runMutation(internal.membership.internals.moveGrantToGrace, decision.args);
			} else {
				await ctx.runMutation(internal.membership.internals.revokeFromSubscription, decision.args);
			}
		} catch (err) {
			const code = entitlement.entitlementCode || "(no-code)";
			const error = err instanceof Error ? err.message : String(err);
			console.error(
				`[bridge] membership propagation failed for subscription ${String(subscription._id)}, entitlement ${code}: ${error}`,
			);
			await writeHistory(ctx, {
				subscriptionId: subscription._id,
				eventType: "subscription.bridge_failed",
				message: `Membership bridge call failed for entitlement ${code}`,
				fromStatus: subscription.status,
				toStatus: subscription.status,
				reason: "bridge_error",
				data: { entitlementCode: code, action: decision.action, error },
			});
		}
	}
}

// ─── Billing closure ────────────────────────────────────────────────────────

const UNPAID_INVOICE_STATUSES: ReadonlySet<Doc<"commerce_subscription_invoices">["status"]> = new Set([
	"draft",
	"open",
	"failed",
]);

/** An ended contract's live items end with it (cancelled or expired, as the contract). */
async function endLiveItems(
	ctx: MutationCtx,
	subscriptionId: Id<"commerce_subscriptions">,
	status: "cancelled" | "expired",
	now: number,
): Promise<void> {
	const items = await ctx.db
		.query("commerce_subscription_items")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscriptionId))
		.collect();
	for (const item of items) {
		if (item.status === "cancelled" || item.status === "expired") continue;
		await ctx.db.patch("commerce_subscription_items", item._id, { status, cancelledAt: now, updatedAt: now });
	}
}

/**
 * A contract that ended owes nothing further: its unpaid invoices are voided
 * and its pending dunning retries aborted, so no sweep charges it again.
 */
export async function closeUnpaidBilling(
	ctx: MutationCtx,
	subscriptionId: Id<"commerce_subscriptions">,
	reason: string,
	now: number,
): Promise<{ voidedInvoices: number; abortedRetries: number }> {
	let voidedInvoices = 0;
	let abortedRetries = 0;
	const invoices = await ctx.db
		.query("commerce_subscription_invoices")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscriptionId))
		.collect();
	for (const invoice of invoices) {
		if (!UNPAID_INVOICE_STATUSES.has(invoice.status)) continue;
		await ctx.db.patch("commerce_subscription_invoices", invoice._id, {
			status: "void",
			dueAt: undefined,
			updatedAt: now,
		});
		voidedInvoices++;
	}
	const attempts = await ctx.db
		.query("commerce_subscription_dunning_attempts")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscriptionId))
		.collect();
	for (const attempt of attempts) {
		if (attempt.status !== "scheduled" && attempt.status !== "processing") continue;
		await ctx.db.patch("commerce_subscription_dunning_attempts", attempt._id, {
			status: "aborted",
			processedAt: now,
			errorMessage: reason,
			updatedAt: now,
		});
		abortedRetries++;
	}
	return { voidedInvoices, abortedRetries };
}

// ─── Transitions ────────────────────────────────────────────────────────────

/** The lifecycle event a transition emits, by target status. */
function transitionEventCode(from: SubscriptionStatus, to: SubscriptionStatus): string | null {
	switch (to) {
		case "paused":
			return SUBSCRIPTION_EVENTS.PAUSED;
		case "pending_cancel":
			return SUBSCRIPTION_EVENTS.CANCEL_SCHEDULED;
		case "cancelled":
			return SUBSCRIPTION_EVENTS.CANCELLED;
		case "expired":
			return SUBSCRIPTION_EVENTS.EXPIRED;
		case "active":
			// Recovery from past_due is a renewal: the billing path emits
			// `commerce.subscription_renewed` with the invoice.
			return from === "paused" || from === "pending_cancel" ? SUBSCRIPTION_EVENTS.RESUMED : null;
		default:
			// past_due is emitted by the billing path with the failed attempt;
			// trialing/draft have no lifecycle event.
			return null;
	}
}

export type TransitionArgs = {
	subscription: SubscriptionDoc;
	toStatus: SubscriptionStatus;
	reason?: string;
	correlationId?: string;
	actorUserId?: Id<"users">;
	patch?: SubscriptionPatch;
	/** Extra fields for the lifecycle event payload. */
	eventData?: Record<string, unknown>;
};

/**
 * Move a contract to `toStatus`, validated against `STATUS_TRANSITIONS`.
 * Entitlements follow the new status; an ended contract has its unpaid billing
 * closed. A no-op when the contract is already in `toStatus`.
 */
export async function transitionSubscription(ctx: MutationCtx, args: TransitionArgs): Promise<SubscriptionDoc> {
	const from = args.subscription.status;
	if (from === args.toStatus) return args.subscription;
	if (!canTransition(from, args.toStatus)) {
		throw new ConvexError({
			code: "INVALID_TRANSITION",
			message: `Invalid status transition: ${from} -> ${args.toStatus}`,
		});
	}

	const now = Date.now();
	const patch: SubscriptionPatch = {
		...args.patch,
		status: args.toStatus,
		updatedAt: now,
		...(isEnded(args.toStatus) ? { cancelledAt: now } : {}),
	};
	await ctx.db.patch("commerce_subscriptions", args.subscription._id, patch);
	const updated = await ctx.db.get(args.subscription._id);
	if (!updated) throw new ConvexError({ code: "NOT_FOUND", message: "Subscription not found after transition." });

	await writeHistory(ctx, {
		subscriptionId: updated._id,
		eventType: "subscription.status_changed",
		actorUserId: args.actorUserId,
		fromStatus: from,
		toStatus: args.toStatus,
		reason: args.reason,
		data: { patch },
		correlationId: args.correlationId,
	});

	const terms = await resolveLifecycleTerms(ctx, updated);
	await syncEntitlementsForStatus(ctx, updated, now, terms.gracePeriodDays);

	if (isEnded(args.toStatus)) {
		await endLiveItems(ctx, updated._id, args.toStatus, now);
		const closed = await closeUnpaidBilling(ctx, updated._id, `subscription_${args.toStatus}`, now);
		if (closed.voidedInvoices > 0 || closed.abortedRetries > 0) {
			await writeHistory(ctx, {
				subscriptionId: updated._id,
				eventType: "subscription.billing_closed",
				fromStatus: from,
				toStatus: args.toStatus,
				reason: args.reason,
				data: closed,
				correlationId: args.correlationId,
			});
		}
	}

	const code = transitionEventCode(from, args.toStatus);
	if (code) {
		await emitEvent(ctx, code, "commerce", {
			subscriptionId: updated._id,
			userId: updated.userId,
			fromStatus: from,
			toStatus: args.toStatus,
			reason: args.reason,
			...args.eventData,
		});
	}

	return updated;
}

// ─── Offer changes ──────────────────────────────────────────────────────────

/**
 * Bring a contract's entitlements in line with an offer's codes: codes the
 * offer adds are granted, codes it no longer includes are revoked. Used when a
 * plan change takes effect on a serving contract.
 */
export async function reconcileOfferEntitlements(
	ctx: MutationCtx,
	subscription: SubscriptionDoc,
	entitlementCodes: readonly string[],
	now: number,
): Promise<{ granted: string[]; revoked: string[] }> {
	const wanted = new Set(entitlementCodes.filter((code) => code.length > 0));
	const rows = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
		.collect();
	const held = new Set(rows.filter((row) => row.status !== "revoked").map((row) => row.entitlementCode));

	const granted: string[] = [];
	for (const code of wanted) {
		if (held.has(code)) continue;
		await ctx.db.insert("commerce_subscription_entitlements", {
			subscriptionId: subscription._id,
			userId: subscription.userId,
			entitlementCode: code,
			status: "active",
			startsAt: now,
			metadata: { fromPlanChange: true },
			createdAt: now,
			updatedAt: now,
		});
		granted.push(code);
	}

	const revoked: string[] = [];
	for (const row of rows) {
		if (row.status === "revoked" || wanted.has(row.entitlementCode)) continue;
		await ctx.db.patch("commerce_subscription_entitlements", row._id, { status: "revoked", endsAt: now, updatedAt: now });
		revoked.push(row.entitlementCode);
	}

	const userId = subscription.userId;
	if (userId && granted.length > 0 && (await isBridgeEnabled(ctx))) {
		for (const code of granted) {
			await ctx.runMutation(internal.membership.internals.grantFromSubscription, {
				userId,
				entitlementCode: code,
				subscriptionId: String(subscription._id),
				...(subscription.currentPeriodEndAt !== undefined ? { endsAt: subscription.currentPeriodEndAt } : {}),
			});
		}
	}
	return { granted, revoked };
}

/**
 * Move a contract onto `toOffer`. The current item ends and an item for the new
 * offer starts within the same billing period; the recurring amount and offer
 * history follow, and entitlements are reconciled with the new offer's codes.
 * The period itself is unchanged: the next renewal bills the new price.
 */
export async function swapToOffer(
	ctx: MutationCtx,
	subscription: SubscriptionDoc,
	toOffer: Doc<"commerce_subscription_offers">,
	reason: string,
	now: number,
): Promise<{ granted: string[]; revoked: string[] }> {
	const items = await ctx.db
		.query("commerce_subscription_items")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
		.collect();
	const fromItem = items.find((item) => item.status === "active" || item.status === "pending_cancel");
	for (const item of items) {
		if (item.status !== "active" && item.status !== "pending_cancel") continue;
		await ctx.db.patch("commerce_subscription_items", item._id, { status: "cancelled", cancelledAt: now, updatedAt: now });
	}

	await ctx.db.insert("commerce_subscription_items", {
		subscriptionId: subscription._id,
		sourceOfferId: toOffer._id,
		productId: toOffer.productId,
		variantId: toOffer.variantId,
		bundleId: toOffer.bundleId,
		titleSnapshot: toOffer.title,
		quantity: 1,
		unitAmount: toOffer.recurringAmount,
		unitRecurringAmount: toOffer.recurringAmount,
		unitSetupFeeAmount: toOffer.setupFeeAmount ?? 0,
		currencyCode: toOffer.currencyCode,
		status: "active",
		startsAt: now,
		currentPeriodEndAt: subscription.currentPeriodEndAt,
		cancelAtPeriodEnd: false,
		entitlementCodes: toOffer.entitlementCodes,
		priceSnapshot: {
			offerId: toOffer._id,
			offerSlug: toOffer.slug,
			recurringAmount: toOffer.recurringAmount,
			currencyCode: toOffer.currencyCode,
		},
		metadata: { fromPlanChange: true, fromOfferId: fromItem?.sourceOfferId, reason },
		createdAt: now,
		updatedAt: now,
	});

	await ctx.db.patch("commerce_subscriptions", subscription._id, {
		recurringAmount: toOffer.recurringAmount,
		currencyCode: toOffer.currencyCode,
		scheduledOfferChange: undefined,
		offerHistory: [...(subscription.offerHistory ?? []), { offerId: toOffer._id, effectiveAt: now, reason }],
		updatedAt: now,
	});

	return await reconcileOfferEntitlements(ctx, subscription, toOffer.entitlementCodes ?? [], now);
}
