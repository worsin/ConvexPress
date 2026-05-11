/**
 * Commerce Subscriptions — Mutations
 *
 * Ported from VexCart subscriptions.ts mutations, adapted to ConvexPress
 * schema (commerce_subscription_* tables) and auth patterns.
 *
 * Functions:
 *   Template & Override CRUD:
 *   - createTemplate           Create subscription template (admin)
 *   - updateTemplate           Update subscription template (admin)
 *   - setProductOverride       Set/update product subscription override (admin)
 *   - removeProductOverride    Remove product subscription override (admin)
 *
 *   Subscription Lifecycle:
 *   - create                   Create subscription (with idempotency, entitlements, history)
 *   - pause                    Pause subscription
 *   - resume                   Resume paused subscription
 *   - scheduleCancel           Schedule cancellation at period end
 *   - cancelNow                Cancel immediately
 *   - updateSubscription       Admin-only subscription field updates
 *
 *   Entitlement Management:
 *   - grantEntitlement         Manually grant entitlement to subscription
 *   - revokeEntitlement        Revoke an entitlement
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { commerceSubscriptionSourceChannelValidator } from "../schema/commerceSubscriptions";
import { decideBridgeCall } from "./bridgeDecisions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import {
	buildSubscriptionPricingSnapshot,
	hasExplicitSubscriptionEnablement,
} from "./pricing";
import { subscriptionIntervalValidator } from "./validators";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

type BillingInterval = "week" | "month" | "year";
type SubscriptionStatus =
	| "draft"
	| "trialing"
	| "active"
	| "past_due"
	| "paused"
	| "pending_cancel"
	| "cancelled"
	| "expired";

const STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
	draft: ["trialing", "active", "cancelled"],
	trialing: [
		"active",
		"past_due",
		"paused",
		"pending_cancel",
		"cancelled",
		"expired",
	],
	active: ["past_due", "paused", "pending_cancel", "cancelled", "expired"],
	past_due: ["active", "paused", "pending_cancel", "cancelled", "expired"],
	paused: ["active", "pending_cancel", "cancelled", "expired"],
	pending_cancel: ["active", "cancelled", "expired"],
	cancelled: [],
	expired: [],
};

const DEFAULT_DUNNING_POLICY = {
	maxAttempts: 3,
	retryIntervalsDays: [1, 3, 7],
	cancelAfterFinalFailure: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function canTransition(
	from: SubscriptionStatus,
	to: SubscriptionStatus,
): boolean {
	return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

function addDays(timestamp: number, days: number): number {
	return timestamp + days * 24 * 60 * 60 * 1000;
}

function addBillingPeriod(
	timestamp: number,
	interval: BillingInterval,
	intervalCount: number,
): number {
	const date = new Date(timestamp);
	if (interval === "week") {
		date.setDate(date.getDate() + 7 * intervalCount);
		return date.getTime();
	}
	if (interval === "month") {
		date.setMonth(date.getMonth() + intervalCount);
		return date.getTime();
	}
	// year
	date.setFullYear(date.getFullYear() + intervalCount);
	return date.getTime();
}

function createCorrelationId(): string {
	return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getProductOverride(ctx: any, productId: any) {
	return ctx.db
		.query("commerce_product_subscription_overrides")
		.withIndex("by_product", (q: any) => q.eq("productId", productId))
		.first();
}

async function resolveEffectiveConfig(
	ctx: any,
	product: any,
	explicitTemplateId?: any,
	variant?: any,
) {
	const override = await getProductOverride(ctx, product._id);
	const configuredTemplateId =
		explicitTemplateId ?? override?.templateId ?? undefined;

	let template: any = null;
	if (configuredTemplateId) {
		template = await ctx.db.get(configuredTemplateId);
	}

	const billingInterval: BillingInterval =
		override?.overrideBillingInterval ?? template?.billingInterval ?? "month";
	const billingIntervalCount =
		override?.overrideBillingIntervalCount ??
		template?.billingIntervalCount ??
		1;
	const trialDays = override?.overrideTrialDays ?? template?.trialDays;
	const gracePeriodDays =
		override?.overrideGracePeriodDays ?? template?.gracePeriodDays ?? 3;
	const pausable = override?.overridePausable ?? template?.pausable ?? true;
	const cancelAtPeriodEndDefault = template?.cancelAtPeriodEndDefault ?? true;

	const pricing = buildSubscriptionPricingSnapshot({
		product,
		variant,
		override,
		quantity: 1,
	});

	return {
		isSubscriptionEnabled: hasExplicitSubscriptionEnablement(override),
		allowOneTimePurchase: override?.allowOneTimePurchase ?? true,
		templateId: template?._id,
		templateVersion: template?.version,
		unitPrice: pricing.unitAmount,
		currencyCode: pricing.currencyCode,
		billingInterval,
		billingIntervalCount,
		trialDays,
		gracePeriodDays,
		pausable,
		cancelAtPeriodEndDefault,
		dunningPolicy: DEFAULT_DUNNING_POLICY,
	};
}

async function writeHistory(ctx: any, args: any) {
	await ctx.db.insert("commerce_subscription_history", {
		subscriptionId: args.subscriptionId,
		eventType: args.eventType,
		message: args.message ?? args.eventType,
		actorUserId: args.actorUserId,
		metadata: {
			fromStatus: args.fromStatus,
			toStatus: args.toStatus,
			reason: args.reason,
			data: args.data,
			correlationId: args.correlationId,
		},
		createdAt: Date.now(),
	});
}

/**
 * Returns true iff both the commerce-subscriptions and membership plugins are
 * enabled AND `membership.acceptSubscriptionGrants` is not explicitly false.
 *
 * See the matching helper in `commerceSubscriptions/internals.ts`. The two
 * are intentionally duplicated because their callers
 * (`syncEntitlementsForStatus`) are also duplicated — that pre-existing smell
 * is out of scope for this task.
 */
async function isBridgeEnabled(ctx: any): Promise<boolean> {
	const commerceOn = await isPluginEnabled(ctx, "commerceSubscriptions");
	if (!commerceOn) return false;
	const membershipOn = await isPluginEnabled(ctx, "membership");
	if (!membershipOn) return false;

	try {
		const settingsRow = await ctx.db
			.query("settings")
			.withIndex("by_section", (q: any) =>
				q.eq("section", "membership.general"),
			)
			.unique();
		const values = (settingsRow?.values ?? {}) as Record<string, unknown>;
		if (values.acceptSubscriptionGrants === false) return false;
	} catch {
		// Settings read failure should not block bridge; fall through to enabled.
	}
	return true;
}

async function syncEntitlementsForStatus(
	ctx: any,
	subscription: any,
	now: number,
	gracePeriodDays = 3,
) {
	const entitlements = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q: any) =>
			q.eq("subscriptionId", subscription._id),
		)
		.collect();

	for (const entitlement of entitlements) {
		if (
			subscription.status === "active" ||
			subscription.status === "trialing"
		) {
			await ctx.db.patch(entitlement._id, {
				status: "active",
				endsAt: undefined,
				updatedAt: now,
			});
		} else if (
			subscription.status === "past_due" ||
			subscription.status === "paused"
		) {
			await ctx.db.patch(entitlement._id, {
				status: "grace",
				graceEndsAt: addDays(now, gracePeriodDays),
				updatedAt: now,
			});
		} else if (
			subscription.status === "cancelled" ||
			subscription.status === "expired"
		) {
			await ctx.db.patch(entitlement._id, {
				status: "revoked",
				endsAt: now,
				updatedAt: now,
			});
		}
	}

	// ── Bridge: propagate status to membership grants ─────────────────────────
	// Soft-gated by `isBridgeEnabled` — plugin flags + acceptSubscriptionGrants.
	// Each entitlement's bridge call is isolated: one failure MUST NOT block the
	// rest of the loop or the status transition itself.
	const bridgeEnabled = await isBridgeEnabled(ctx);
	if (!bridgeEnabled) return;

	for (const entitlement of entitlements) {
		const decision = decideBridgeCall({
			subscription,
			entitlement,
			gracePeriodDays,
		});
		if (decision.action === "noop") continue;

		try {
			if (decision.action === "grant") {
				await ctx.runMutation(
					internal.membership.internals.grantFromSubscription,
					decision.args,
				);
			} else if (decision.action === "moveToGrace") {
				await ctx.runMutation(
					internal.membership.internals.moveGrantToGrace,
					decision.args,
				);
			} else if (decision.action === "revoke") {
				await ctx.runMutation(
					internal.membership.internals.revokeFromSubscription,
					decision.args,
				);
			}
		} catch (err) {
			const subscriptionId = String(subscription._id);
			const code = entitlement.entitlementCode ?? "(no-code)";
			console.error(
				`[bridge] membership propagation failed for subscription ${subscriptionId}, ` +
					`entitlement ${code}: ${err instanceof Error ? err.message : String(err)}`,
			);
			try {
				await writeHistory(ctx, {
					subscriptionId: subscription._id,
					eventType: "subscription.bridge_failed",
					message: `Membership bridge call failed for entitlement ${code}`,
					fromStatus: subscription.status,
					toStatus: subscription.status,
					reason: "bridge_error",
					data: {
						entitlementCode: code,
						action: decision.action,
						error: err instanceof Error ? err.message : String(err),
					},
				});
			} catch {
				// history write failure is non-fatal
			}
			// Continue loop — one entitlement's failure must not block others.
		}
	}
}

async function ensureSubscriptionEntitlement(
	ctx: any,
	subscription: any,
	now: number,
) {
	const existing = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q: any) =>
			q.eq("subscriptionId", subscription._id),
		)
		.first();

	if (existing) return existing._id;

	return ctx.db.insert("commerce_subscription_entitlements", {
		subscriptionId: subscription._id,
		userId: subscription.userId,
		entitlementCode: `product:${subscription.productId}`,
		status:
			subscription.status === "active" || subscription.status === "trialing"
				? "active"
				: "grace",
		startsAt: now,
		endsAt: undefined,
		graceEndsAt: undefined,
		metadata: {
			productId: subscription.productId,
			orderId: subscription.orderId,
		},
		createdAt: now,
		updatedAt: now,
	});
}

async function claimIdempotencyKey(
	ctx: any,
	key: string | undefined,
	scope: string,
) {
	if (!key) return { mode: "none" as const };

	const now = Date.now();
	const existing = await ctx.db
		.query("commerce_subscription_idempotency_keys")
		.withIndex("by_scope_key", (q: any) => q.eq("scope", scope).eq("key", key))
		.first();

	if (existing && existing.expiresAt && existing.expiresAt > now) {
		if (existing.status === "pending") {
			throw new ConvexError({
				code: "DUPLICATE_REQUEST",
				message: "Duplicate request already processing",
			});
		}
		if (existing.status === "completed" && existing.resultRef) {
			return {
				mode: "replay" as const,
				response: JSON.parse(existing.resultRef),
			};
		}
	}

	const id = await ctx.db.insert("commerce_subscription_idempotency_keys", {
		scope,
		key,
		status: "pending",
		payloadHash: undefined,
		resultRef: undefined,
		expiresAt: addDays(now, 2),
		createdAt: now,
		updatedAt: now,
	});

	return { mode: "claimed" as const, id };
}

async function finalizeIdempotency(ctx: any, claim: any, response: any) {
	if (claim.mode !== "claimed") return;
	await ctx.db.patch(claim.id, {
		status: "completed",
		resultRef: JSON.stringify(response),
		updatedAt: Date.now(),
	});
}

async function failIdempotency(ctx: any, claim: any) {
	if (claim.mode !== "claimed") return;
	await ctx.db.patch(claim.id, {
		status: "failed",
		updatedAt: Date.now(),
	});
}

async function transitionSubscription(ctx: any, args: any) {
	const now = Date.now();
	if (args.subscription.status === args.toStatus) return args.subscription;

	if (!canTransition(args.subscription.status, args.toStatus)) {
		throw new ConvexError({
			code: "INVALID_TRANSITION",
			message: `Invalid status transition: ${args.subscription.status} -> ${args.toStatus}`,
		});
	}

	const patch: Record<string, unknown> = {
		status: args.toStatus,
		updatedAt: now,
		...args.patch,
	};

	if (args.toStatus === "paused") {
		// Mark paused timestamp via history; schema doesn't have pausedAt
	}
	if (args.toStatus === "cancelled" || args.toStatus === "expired") {
		patch.cancelledAt = now;
	}

	await ctx.db.patch(args.subscription._id, patch);
	const updated = await ctx.db.get(args.subscription._id);
	if (!updated) throw new Error("Subscription not found after transition");

	await writeHistory(ctx, {
		subscriptionId: updated._id,
		eventType: "subscription.status_changed",
		actorUserId: args.actorUserId,
		fromStatus: args.subscription.status,
		toStatus: args.toStatus,
		reason: args.reason,
		data: { patch },
		correlationId: args.correlationId,
	});

	// Sync entitlements
	const product = updated.productId
		? await ctx.db.get(updated.productId)
		: null;
	if (product) {
		const config = await resolveEffectiveConfig(
			ctx,
			product,
			updated.templateId,
		);
		await syncEntitlementsForStatus(
			ctx,
			updated,
			now,
			config.gracePeriodDays ?? 3,
		);
	}

	// Emit event
	try {
		await emitEvent(ctx, `commerce.subscription_${args.toStatus}`, "commerce", {
			subscriptionId: updated._id,
			userId: updated.userId,
			fromStatus: args.subscription.status,
			toStatus: args.toStatus,
			reason: args.reason,
		});
	} catch {
		// Event emission is best-effort
	}

	return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE & OVERRIDE MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a subscription template (admin).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const createTemplate = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		status: v.optional(
			// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
			v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
		),
		billingInterval: subscriptionIntervalValidator,
		billingIntervalCount: v.number(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		trialDays: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		gracePeriodDays: v.optional(v.number()),
		pausable: v.boolean(),
		cancelAtPeriodEndDefault: v.boolean(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		dunningPolicyCode: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const now = Date.now();

		// Check slug uniqueness and determine version
		const existing = await ctx.db
			.query("commerce_subscription_templates")
			.withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
			.collect();
		const nextVersion =
			existing.reduce(
				(max: number, t: any) => Math.max(max, t.version ?? 0),
				0,
			) + 1;

		return ctx.db.insert("commerce_subscription_templates", {
			title: args.title,
			slug: args.slug,
			status: args.status ?? "draft",
			version: nextVersion,
			billingInterval: args.billingInterval,
			billingIntervalCount: args.billingIntervalCount,
			trialDays: args.trialDays,
			gracePeriodDays: args.gracePeriodDays,
			pausable: args.pausable,
			cancelAtPeriodEndDefault: args.cancelAtPeriodEndDefault,
			dunningPolicyCode: args.dunningPolicyCode,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Update a subscription template (admin).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const updateTemplate = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		templateId: v.id("commerce_subscription_templates"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		title: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		slug: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		status: v.optional(
			// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
			v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
		),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		billingInterval: v.optional(subscriptionIntervalValidator),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		billingIntervalCount: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		trialDays: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		gracePeriodDays: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		pausable: v.optional(v.boolean()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		cancelAtPeriodEndDefault: v.optional(v.boolean()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		dunningPolicyCode: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const template = await ctx.db.get(args.templateId);
		if (!template) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription template not found.",
			});
		}

		const now = Date.now();
		const patch: Record<string, unknown> = { updatedAt: now };

		if (args.title !== undefined) patch.title = args.title;
		if (args.slug !== undefined) patch.slug = args.slug;
		if (args.status !== undefined) patch.status = args.status;
		if (args.billingInterval !== undefined)
			patch.billingInterval = args.billingInterval;
		if (args.billingIntervalCount !== undefined)
			patch.billingIntervalCount = args.billingIntervalCount;
		if (args.trialDays !== undefined) patch.trialDays = args.trialDays;
		if (args.gracePeriodDays !== undefined)
			patch.gracePeriodDays = args.gracePeriodDays;
		if (args.pausable !== undefined) patch.pausable = args.pausable;
		if (args.cancelAtPeriodEndDefault !== undefined)
			patch.cancelAtPeriodEndDefault = args.cancelAtPeriodEndDefault;
		if (args.dunningPolicyCode !== undefined)
			patch.dunningPolicyCode = args.dunningPolicyCode;

		// Increment version on status or billing changes
		if (
			args.status !== undefined ||
			args.billingInterval !== undefined ||
			args.billingIntervalCount !== undefined
		) {
			patch.version = (template.version ?? 0) + 1;
		}

		await ctx.db.patch(args.templateId, patch);
		return args.templateId;
	},
});

/**
 * Set/update product subscription override (admin).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const setProductOverride = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		productId: v.id("commerce_products"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		templateId: v.optional(v.id("commerce_subscription_templates")),
		isSubscriptionEnabled: v.boolean(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		allowOneTimePurchase: v.optional(v.boolean()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		overridePriceAmount: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		overrideCurrencyCode: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		overrideBillingInterval: v.optional(subscriptionIntervalValidator),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		overrideBillingIntervalCount: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		overrideTrialDays: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		overrideGracePeriodDays: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		overridePausable: v.optional(v.boolean()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const product = await ctx.db.get(args.productId);
		if (!product) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Product not found.",
			});
		}

		if (args.templateId) {
			const template = await ctx.db.get(args.templateId);
			if (!template) {
				throw new ConvexError({
					code: "NOT_FOUND",
					message: "Subscription template not found.",
				});
			}
		}

		const now = Date.now();
		const existing = await getProductOverride(ctx, args.productId);
		const payload = {
			productId: args.productId,
			templateId: args.templateId,
			isSubscriptionEnabled: args.isSubscriptionEnabled,
			allowOneTimePurchase: args.allowOneTimePurchase ?? true,
			overridePriceAmount: args.overridePriceAmount,
			overrideCurrencyCode: args.overrideCurrencyCode,
			overrideBillingInterval: args.overrideBillingInterval,
			overrideBillingIntervalCount: args.overrideBillingIntervalCount,
			overrideTrialDays: args.overrideTrialDays,
			overrideGracePeriodDays: args.overrideGracePeriodDays,
			overridePausable: args.overridePausable,
			updatedAt: now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, payload);
			return existing._id;
		}

		return ctx.db.insert("commerce_product_subscription_overrides", {
			...payload,
			createdAt: now,
		});
	},
});

/**
 * Remove product subscription override (admin).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const removeProductOverride = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		productId: v.id("commerce_products"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const existing = await getProductOverride(ctx, args.productId);
		if (!existing) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "No subscription override found for this product.",
			});
		}

		await ctx.db.delete(existing._id);
		return { success: true };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION LIFECYCLE MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Admin/manual subscription provisioning.
 * Client checkout and public forms must create intents; they must not call this
 * mutation to activate a paid subscription directly.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const create = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		customerId: v.optional(v.id("commerce_customer_profiles")),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		userId: v.optional(v.id("users")),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		productId: v.id("commerce_products"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		variantId: v.optional(v.id("commerce_product_variants")),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		orderId: v.optional(v.id("commerce_orders")),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		orderItemId: v.optional(v.id("commerce_order_items")),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		sourceChannel: v.optional(commerceSubscriptionSourceChannelValidator),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		sourceCheckoutIntentId: v.optional(
			v.id("commerce_subscription_checkout_intents"),
		),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		sourceFormSubmissionId: v.optional(
			v.id("commerce_subscription_form_submissions"),
		),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		templateId: v.optional(v.id("commerce_subscription_templates")),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		quantity: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		setupFeeAmount: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		paymentProvider: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		paymentTransactionId: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		defaultPaymentMethodId: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		manualBilling: v.optional(v.boolean()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		sourceMetadata: v.optional(v.any()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		idempotencyKey: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		const actor = await requireCan(ctx, "manage_options");

		const correlationId = createCorrelationId();
		const idempotency = await claimIdempotencyKey(
			ctx,
			args.idempotencyKey,
			"subscription.create",
		);
		if (idempotency.mode === "replay") {
			return idempotency.response;
		}

		try {
			const now = Date.now();
			const quantity = Math.max(1, args.quantity ?? 1);
			const userId = args.userId ?? actor._id;

			const product = await ctx.db.get(args.productId);
			if (!product) {
				throw new ConvexError({
					code: "NOT_FOUND",
					message: "Product not found.",
				});
			}

			let variant: any = null;
			if (args.variantId) {
				variant = await ctx.db.get(args.variantId);
				if (!variant || variant.productId !== product._id) {
					throw new ConvexError({
						code: "NOT_FOUND",
						message: "Variant not found for product.",
					});
				}
			}

			const config = await resolveEffectiveConfig(
				ctx,
				product,
				args.templateId,
				variant,
			);
			if (!config.isSubscriptionEnabled) {
				throw new ConvexError({
					code: "VALIDATION_ERROR",
					message:
						"Product must have an explicit subscription override before it can be provisioned.",
				});
			}
			const pricing = buildSubscriptionPricingSnapshot({
				product,
				variant,
				override: await getProductOverride(ctx, product._id),
				quantity,
			});

			const trialDays = config.trialDays ?? 0;
			const status: SubscriptionStatus = trialDays > 0 ? "trialing" : "active";
			const currentPeriodStartAt = now;
			const currentPeriodEndAt =
				trialDays > 0
					? addDays(now, trialDays)
					: addBillingPeriod(
							now,
							config.billingInterval,
							config.billingIntervalCount,
						);
			const sourceChannel = args.sourceChannel ?? "admin";
			const setupFeeAmount = args.setupFeeAmount ?? 0;
			const manualBilling =
				args.manualBilling ??
				!(args.defaultPaymentMethodId || args.paymentProvider);
			const pricingSnapshot = {
				...pricing,
				setupFeeAmount,
				billingInterval: config.billingInterval,
				billingIntervalCount: config.billingIntervalCount,
				trialDays,
				templateId: config.templateId,
				templateVersion: config.templateVersion,
			};

			const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
				customerId: args.customerId,
				userId,
				sourceChannel,
				sourceCheckoutIntentId: args.sourceCheckoutIntentId,
				sourceOrderId: args.orderId,
				sourceFormSubmissionId: args.sourceFormSubmissionId,
				productId: args.productId,
				orderId: args.orderId,
				orderItemId: args.orderItemId,
				templateId: config.templateId,
				templateVersion: config.templateVersion,
				status,
				currencyCode: pricing.currencyCode,
				recurringAmount: pricing.recurringAmount,
				setupFeeAmount,
				billingInterval: config.billingInterval,
				billingIntervalCount: config.billingIntervalCount,
				nextBillingAt: currentPeriodEndAt,
				currentPeriodStartAt,
				currentPeriodEndAt,
				trialEndsAt: trialDays > 0 ? currentPeriodEndAt : undefined,
				cancelAtPeriodEnd: false,
				cancelScheduledAt: undefined,
				cancelledAt: undefined,
				pausedAt: undefined,
				gracePeriodEndsAt: undefined,
				defaultPaymentMethodId: args.defaultPaymentMethodId,
				paymentProvider: args.paymentProvider,
				paymentTransactionId: args.paymentTransactionId,
				lastInvoiceId: undefined,
				manualBilling,
				pricingSnapshot,
				sourceMetadata: args.sourceMetadata,
				createdAt: now,
				updatedAt: now,
			});

			// Create subscription item
			await ctx.db.insert("commerce_subscription_items", {
				subscriptionId,
				productId: args.productId,
				variantId: args.variantId,
				bundleId: undefined,
				titleSnapshot: variant?.title ?? product.title ?? product.name,
				quantity,
				unitAmount: pricing.unitAmount,
				unitRecurringAmount: pricing.unitAmount,
				unitSetupFeeAmount: setupFeeAmount,
				currencyCode: pricing.currencyCode,
				status: "active",
				startsAt: now,
				currentPeriodEndAt,
				cancelAtPeriodEnd: false,
				cancelledAt: undefined,
				entitlementCodes: [`product:${args.productId}`],
				priceSnapshot: pricingSnapshot,
				metadata: {
					productId: args.productId,
					variantId: args.variantId,
					sourceChannel,
				},
				createdAt: now,
				updatedAt: now,
			});

			// Create entitlement
			const createdSubscription = await ctx.db.get(subscriptionId);
			if (!createdSubscription) throw new Error("Subscription creation failed");
			await ensureSubscriptionEntitlement(ctx, createdSubscription, now);
			await syncEntitlementsForStatus(
				ctx,
				createdSubscription,
				now,
				config.gracePeriodDays ?? 3,
			);

			// Write history
			await writeHistory(ctx, {
				subscriptionId,
				eventType: "subscription.created",
				actorUserId: actor?._id,
				toStatus: status,
				data: {
					templateId: config.templateId,
					templateVersion: config.templateVersion,
					unitPrice: pricing.unitAmount,
					recurringAmount: pricing.recurringAmount,
					currencyCode: pricing.currencyCode,
					variantId: args.variantId,
					sourceChannel,
					sourceCheckoutIntentId: args.sourceCheckoutIntentId,
					sourceFormSubmissionId: args.sourceFormSubmissionId,
					setupFeeAmount,
					manualBilling,
					quantity,
					trialDays,
					orderId: args.orderId,
				},
				correlationId,
			});

			// Emit event
			try {
				await emitEvent(ctx, "commerce.subscription_created", "commerce", {
					subscriptionId,
					userId,
					productId: args.productId,
					variantId: args.variantId,
					sourceChannel,
					status,
					billingInterval: config.billingInterval,
					billingIntervalCount: config.billingIntervalCount,
					recurringAmount: pricing.recurringAmount,
				});
			} catch {
				// Event emission is best-effort
			}

			const response = {
				subscriptionId,
				status,
				currentPeriodEndAt,
				nextBillingAt: currentPeriodEndAt,
				templateId: config.templateId,
			};

			await finalizeIdempotency(
				ctx,
				idempotency.mode === "claimed" ? idempotency : { mode: "none" },
				response,
			);

			return response;
		} catch (error) {
			await failIdempotency(
				ctx,
				idempotency.mode === "claimed" ? idempotency : { mode: "none" },
			);
			throw error;
		}
	},
});

/**
 * Pause a subscription.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const pause = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		subscriptionId: v.id("commerce_subscriptions"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		reason: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "Authentication required.",
			});
		}

		let isAdmin = false;
		try {
			await requireCan(ctx, "manage_options");
			isAdmin = true;
		} catch {
			// Not admin
		}

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription not found.",
			});
		}

		if (!isAdmin && subscription.userId !== user._id) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "Access denied.",
			});
		}

		return transitionSubscription(ctx, {
			subscription,
			toStatus: "paused",
			actorUserId: user._id,
			reason: args.reason,
			correlationId: createCorrelationId(),
			patch: { pausedAt: Date.now() },
		});
	},
});

/**
 * Resume a paused subscription.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const resume = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		subscriptionId: v.id("commerce_subscriptions"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "Authentication required.",
			});
		}

		let isAdmin = false;
		try {
			await requireCan(ctx, "manage_options");
			isAdmin = true;
		} catch {
			// Not admin
		}

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription not found.",
			});
		}

		if (!isAdmin && subscription.userId !== user._id) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "Access denied.",
			});
		}

		const now = Date.now();
		const nextBillingAt =
			(subscription.currentPeriodEndAt ?? 0) < now
				? addBillingPeriod(
						now,
						(subscription.billingInterval ?? "month") as BillingInterval,
						subscription.billingIntervalCount ?? 1,
					)
				: subscription.currentPeriodEndAt;

		return transitionSubscription(ctx, {
			subscription,
			toStatus: "active",
			actorUserId: user._id,
			correlationId: createCorrelationId(),
			patch: {
				currentPeriodEndAt: nextBillingAt,
				nextBillingAt,
				pausedAt: undefined,
				cancelAtPeriodEnd: false,
				cancelScheduledAt: undefined,
			},
		});
	},
});

/**
 * Schedule cancellation at period end.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const scheduleCancel = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		subscriptionId: v.id("commerce_subscriptions"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		reason: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "Authentication required.",
			});
		}

		let isAdmin = false;
		try {
			await requireCan(ctx, "manage_options");
			isAdmin = true;
		} catch {
			// Not admin
		}

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription not found.",
			});
		}

		if (!isAdmin && subscription.userId !== user._id) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "Access denied.",
			});
		}

		return transitionSubscription(ctx, {
			subscription,
			toStatus: "pending_cancel",
			actorUserId: user._id,
			reason: args.reason,
			correlationId: createCorrelationId(),
			patch: {
				cancelAtPeriodEnd: true,
				cancelScheduledAt: Date.now(),
			},
		});
	},
});

/**
 * Cancel a subscription immediately.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const cancelNow = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		subscriptionId: v.id("commerce_subscriptions"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		reason: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "Authentication required.",
			});
		}

		let isAdmin = false;
		try {
			await requireCan(ctx, "manage_options");
			isAdmin = true;
		} catch {
			// Not admin
		}

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription not found.",
			});
		}

		if (!isAdmin && subscription.userId !== user._id) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "Access denied.",
			});
		}

		return transitionSubscription(ctx, {
			subscription,
			toStatus: "cancelled",
			actorUserId: user._id,
			reason: args.reason,
			correlationId: createCorrelationId(),
			patch: { cancelAtPeriodEnd: false },
		});
	},
});

/**
 * Admin-only subscription field updates (e.g. change recurring amount, billing interval).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const updateSubscription = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		subscriptionId: v.id("commerce_subscriptions"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		recurringAmount: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		currencyCode: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		nextBillingAt: v.optional(v.number()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		const actor = await requireCan(ctx, "manage_options");

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription not found.",
			});
		}

		const now = Date.now();
		const patch: Record<string, unknown> = { updatedAt: now };

		if (args.recurringAmount !== undefined)
			patch.recurringAmount = args.recurringAmount;
		if (args.currencyCode !== undefined) patch.currencyCode = args.currencyCode;
		if (args.nextBillingAt !== undefined)
			patch.nextBillingAt = args.nextBillingAt;

		await ctx.db.patch(args.subscriptionId, patch);

		await writeHistory(ctx, {
			subscriptionId: args.subscriptionId,
			eventType: "subscription.updated",
			actorUserId: actor._id,
			message: "Subscription fields updated by admin.",
			data: patch,
			correlationId: createCorrelationId(),
		});

		return args.subscriptionId;
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// ENTITLEMENT MANAGEMENT MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manually grant an entitlement to a subscription (admin).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const grantEntitlement = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		subscriptionId: v.id("commerce_subscriptions"),
		entitlementCode: v.string(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		metadata: v.optional(v.any()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription not found.",
			});
		}

		const now = Date.now();
		const status =
			subscription.status === "active" || subscription.status === "trialing"
				? "active"
				: "grace";

		return ctx.db.insert("commerce_subscription_entitlements", {
			subscriptionId: args.subscriptionId,
			userId: subscription.userId,
			entitlementCode: args.entitlementCode,
			status,
			startsAt: now,
			endsAt: undefined,
			graceEndsAt: undefined,
			metadata: args.metadata,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Revoke an entitlement (admin).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const revokeEntitlement = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		entitlementId: v.id("commerce_subscription_entitlements"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const entitlement = await ctx.db.get(args.entitlementId);
		if (!entitlement) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Entitlement not found.",
			});
		}

		const now = Date.now();
		await ctx.db.patch(args.entitlementId, {
			status: "revoked",
			endsAt: now,
			updatedAt: now,
		});

		return { success: true };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDER FORM MUTATIONS (Wave 10.3)
// ═══════════════════════════════════════════════════════════════════════════

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createOrderForm = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const now = Date.now();
		const orderFormId = await ctx.db.insert(
			"commerce_subscription_order_forms",
			{
				title: args.title,
				slug: args.slug,
				status: "draft",
				selectionMode: "single_offer",
				offerIds: [],
				createdAt: now,
				updatedAt: now,
			},
		);
		return { orderFormId };
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateOrderForm = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		orderFormId: v.id("commerce_subscription_order_forms"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		title: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		status: v.optional(
			// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
			v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
		),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const { orderFormId, ...rest } = args;
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (rest.title !== undefined) patch.title = rest.title;
		if (rest.status !== undefined) patch.status = rest.status;
		await ctx.db.patch(orderFormId, patch);
		return { success: true };
	},
});
