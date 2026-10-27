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

import type { WithoutSystemFields } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { validate } from "convex-helpers/validators";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { parseOptionalJsonObjectArgument } from "../helpers/jsonArgs";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import {
	commerceSubscriptionSourceChannelValidator,
	commerceSubscriptionStatusValidator,
} from "../schema/commerceSubscriptions";
import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
import { decideBridgeCall } from "./bridgeDecisions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import {
	buildSubscriptionPricingSnapshot,
	hasExplicitSubscriptionEnablement,
} from "./pricing";
import { subscriptionIntervalValidator } from "./validators";
import { patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../media/attachmentGuard";
import { assertNotManaged } from "../managedRecords/helpers";
import {
	addBillingPeriod,
	addDays,
	assertValidRetryDays,
	createCorrelationId,
	dunningPolicyFor,
	syncEntitlementsForStatus,
	transitionSubscription,
	writeHistory,
	type BillingInterval,
	type SubscriptionDoc,
	type SubscriptionStatus,
} from "./lifecycle";


// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════


type IdempotencyClaim<Response> =
	| { mode: "none" }
	| { mode: "replay"; response: Response }
	| { mode: "claimed"; id: Id<"commerce_subscription_idempotency_keys"> };

const createSubscriptionResponseValidator = v.object({
	subscriptionId: v.id("commerce_subscriptions"),
	status: commerceSubscriptionStatusValidator,
	currentPeriodEndAt: v.number(),
	nextBillingAt: v.number(),
	templateId: v.optional(v.id("commerce_subscription_templates")),
});
type CreateSubscriptionResponse = Infer<typeof createSubscriptionResponseValidator>;

function isCreateSubscriptionResponse(
	value: unknown,
): value is CreateSubscriptionResponse {
	return validate(createSubscriptionResponseValidator, value);
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════


// Customer (non-admin) lifecycle limits. The status table above is what staff
// may do; a customer acting on their own contract may only move it within good
// standing. Without these, an owner could pause or schedule-cancel a past_due,
// cancelled or expired contract and then resume it to `active` — regaining
// entitlements without paying the outstanding invoice.
const OWNER_PAUSABLE: readonly SubscriptionStatus[] = ["active", "trialing"];
const OWNER_RESUMABLE: readonly SubscriptionStatus[] = ["paused", "pending_cancel"];
const OWNER_SCHEDULE_CANCELLABLE: readonly SubscriptionStatus[] = [
	"active",
	"trialing",
	"paused",
];

function assertOwnerMayTransition(
	isAdmin: boolean,
	from: SubscriptionStatus,
	allowed: readonly SubscriptionStatus[],
	action: string,
): void {
	if (isAdmin || allowed.includes(from)) return;
	throw new ConvexError({
		code: "INVALID_STATE",
		message: `You cannot ${action} a subscription that is ${from}.`,
		currentStatus: from,
	});
}

/**
 * When a resumed contract's paid period has already ended, the renewal falls
 * due immediately (the renewal sweep invoices and charges it) instead of
 * starting a fresh, unpaid period.
 */
function resumedBillingAt(currentPeriodEndAt: number | undefined, now: number): number {
	return currentPeriodEndAt !== undefined && currentPeriodEndAt > now
		? currentPeriodEndAt
		: now;
}


async function getProductOverride(
	ctx: { db: QueryCtx["db"] },
	productId: Id<"commerce_products">,
) {
	return ctx.db
		.query("commerce_product_subscription_overrides")
		.withIndex("by_product", (q) => q.eq("productId", productId))
		.first();
}

async function resolveEffectiveConfig(
	ctx: { db: QueryCtx["db"] },
	product: Doc<"commerce_products">,
	explicitTemplateId?: Id<"commerce_subscription_templates">,
	variant?: Doc<"commerce_product_variants"> | null,
) {
	const override = await getProductOverride(ctx, product._id);
	const configuredTemplateId =
		explicitTemplateId ?? override?.templateId ?? undefined;

	let template: Doc<"commerce_subscription_templates"> | null = null;
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
		dunningPolicy: dunningPolicyFor(template ?? null),
	};
}


async function ensureSubscriptionEntitlement(
	ctx: MutationCtx,
	subscription: SubscriptionDoc,
	now: number,
): Promise<Id<"commerce_subscription_entitlements">> {
	const existing = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q) =>
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

async function claimIdempotencyKey<Response>(
	ctx: MutationCtx,
	key: string | undefined,
	scope: string,
	isResponse: (value: unknown) => value is Response,
): Promise<IdempotencyClaim<Response>> {
	if (!key) return { mode: "none" };

	const now = Date.now();
	const existing = await ctx.db
		.query("commerce_subscription_idempotency_keys")
		.withIndex("by_scope_key", (q) => q.eq("scope", scope).eq("key", key))
		.first();

	if (existing && existing.expiresAt && existing.expiresAt > now) {
		if (existing.status === "pending") {
			throw new ConvexError({
				code: "DUPLICATE_REQUEST",
				message: "Duplicate request already processing",
			});
		}
		if (existing.status === "completed" && existing.resultRef) {
			const stored: unknown = JSON.parse(existing.resultRef);
			if (!isResponse(stored)) {
				throw new ConvexError({
					code: "IDEMPOTENCY_REPLAY_INVALID",
					message: "Stored idempotent response does not match the expected shape.",
				});
			}
			return { mode: "replay", response: stored };
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

	return { mode: "claimed", id };
}

type FinalizableClaim =
	| { mode: "none" }
	| { mode: "claimed"; id: Id<"commerce_subscription_idempotency_keys"> };

async function finalizeIdempotency(
	ctx: MutationCtx,
	claim: FinalizableClaim,
	response: CreateSubscriptionResponse,
) {
	if (claim.mode !== "claimed") return;
	await patchDynamicWithMediaReferences(ctx, claim.id, {
		status: "completed",
		resultRef: JSON.stringify(response),
		updatedAt: Date.now(),
	});
}

async function failIdempotency(ctx: MutationCtx, claim: FinalizableClaim) {
	if (claim.mode !== "claimed") return;
	await patchDynamicWithMediaReferences(ctx, claim.id, {
		status: "failed",
		updatedAt: Date.now(),
	});
}


// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE & OVERRIDE MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

type TemplateFields = WithoutSystemFields<Doc<"commerce_subscription_templates">>;

/** The plan terms a template may set, checked before they are saved. */
function assertValidTemplateTerms(terms: {
	title?: string;
	slug?: string;
	billingIntervalCount?: number;
	trialDays?: number;
	gracePeriodDays?: number;
	dunningRetryDays?: number[];
}): void {
	const fail = (message: string): never => {
		throw new ConvexError({ code: "VALIDATION_ERROR", message });
	};
	if (terms.title !== undefined && !terms.title.trim()) fail("A title is required.");
	if (terms.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(terms.slug)) {
		fail("The slug may contain lowercase letters, digits and single hyphens.");
	}
	if (terms.billingIntervalCount !== undefined && (!Number.isInteger(terms.billingIntervalCount) || terms.billingIntervalCount < 1 || terms.billingIntervalCount > 36)) {
		fail("Bill every 1 to 36 intervals.");
	}
	if (terms.trialDays !== undefined && (!Number.isInteger(terms.trialDays) || terms.trialDays < 0 || terms.trialDays > 365)) {
		fail("A trial is 0 to 365 whole days.");
	}
	if (terms.gracePeriodDays !== undefined && (!Number.isInteger(terms.gracePeriodDays) || terms.gracePeriodDays < 0 || terms.gracePeriodDays > 90)) {
		fail("Grace is 0 to 90 whole days.");
	}
	if (terms.dunningRetryDays !== undefined) assertValidRetryDays(terms.dunningRetryDays);
}

/**
 * Create a subscription template (admin): the billing cadence, trial, grace
 * and failed-payment retry schedule offers are sold on. A slug used before
 * starts a new version.
 */
export const createTemplate = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
		status: v.optional(
			v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
		),
		billingInterval: subscriptionIntervalValidator,
		billingIntervalCount: v.number(),
		trialDays: v.optional(v.number()),
		gracePeriodDays: v.optional(v.number()),
		pausable: v.boolean(),
		cancelAtPeriodEndDefault: v.boolean(),
		dunningRetryDays: v.optional(v.array(v.number())),
		cancelAfterFinalFailure: v.optional(v.boolean()),
	},
	returns: v.id("commerce_subscription_templates"),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		assertValidTemplateTerms(args);
		const now = Date.now();

		const existing = await ctx.db
			.query("commerce_subscription_templates")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.collect();
		const nextVersion = existing.reduce((max: number, t) => Math.max(max, t.version), 0) + 1;

		return ctx.db.insert("commerce_subscription_templates", {
			title: args.title.trim(),
			slug: args.slug,
			status: args.status ?? "draft",
			version: nextVersion,
			billingInterval: args.billingInterval,
			billingIntervalCount: args.billingIntervalCount,
			trialDays: args.trialDays,
			gracePeriodDays: args.gracePeriodDays,
			pausable: args.pausable,
			cancelAtPeriodEndDefault: args.cancelAtPeriodEndDefault,
			dunningRetryDays: args.dunningRetryDays,
			cancelAfterFinalFailure: args.cancelAfterFinalFailure,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Update a subscription template (admin). Contracts already sold keep the
 * cadence they were sold on (it is copied onto the contract); trial, grace,
 * pause and the retry schedule apply to every contract on the template from
 * now on.
 */
export const updateTemplate = mutation({
	args: {
		templateId: v.id("commerce_subscription_templates"),
		title: v.optional(v.string()),
		slug: v.optional(v.string()),
		status: v.optional(
			v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
		),
		billingInterval: v.optional(subscriptionIntervalValidator),
		billingIntervalCount: v.optional(v.number()),
		trialDays: v.optional(v.number()),
		gracePeriodDays: v.optional(v.number()),
		pausable: v.optional(v.boolean()),
		cancelAtPeriodEndDefault: v.optional(v.boolean()),
		dunningRetryDays: v.optional(v.array(v.number())),
		cancelAfterFinalFailure: v.optional(v.boolean()),
	},
	returns: v.id("commerce_subscription_templates"),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const template = await ctx.db.get(args.templateId);
		await assertNotManaged(ctx, "subscriptionTemplate", args.templateId, "This plan template");
		if (!template) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Subscription template not found.",
			});
		}
		assertValidTemplateTerms(args);

		const { templateId, ...changes } = args;
		const patch: Partial<TemplateFields> = { updatedAt: Date.now() };
		if (changes.title !== undefined) patch.title = changes.title.trim();
		if (changes.slug !== undefined) patch.slug = changes.slug;
		if (changes.status !== undefined) patch.status = changes.status;
		if (changes.billingInterval !== undefined) patch.billingInterval = changes.billingInterval;
		if (changes.billingIntervalCount !== undefined) patch.billingIntervalCount = changes.billingIntervalCount;
		if (changes.trialDays !== undefined) patch.trialDays = changes.trialDays;
		if (changes.gracePeriodDays !== undefined) patch.gracePeriodDays = changes.gracePeriodDays;
		if (changes.pausable !== undefined) patch.pausable = changes.pausable;
		if (changes.cancelAtPeriodEndDefault !== undefined) patch.cancelAtPeriodEndDefault = changes.cancelAtPeriodEndDefault;
		if (changes.dunningRetryDays !== undefined) patch.dunningRetryDays = changes.dunningRetryDays;
		if (changes.cancelAfterFinalFailure !== undefined) patch.cancelAfterFinalFailure = changes.cancelAfterFinalFailure;

		// A new version when what is sold changes: status or cadence.
		if (
			(changes.status !== undefined && changes.status !== template.status) ||
			(changes.billingInterval !== undefined && changes.billingInterval !== template.billingInterval) ||
			(changes.billingIntervalCount !== undefined && changes.billingIntervalCount !== template.billingIntervalCount)
		) {
			patch.version = (template.version ?? 0) + 1;
		}

		await ctx.db.patch("commerce_subscription_templates", templateId, patch);
		return templateId;
	},
});

/**
 * Set/update product subscription override (admin).
 */
export const setProductOverride = mutation({
	args: {
		productId: v.id("commerce_products"),
		templateId: v.optional(v.id("commerce_subscription_templates")),
		isSubscriptionEnabled: v.boolean(),
		allowOneTimePurchase: v.optional(v.boolean()),
		overridePriceAmount: v.optional(v.number()),
		overrideCurrencyCode: v.optional(v.string()),
		overrideBillingInterval: v.optional(subscriptionIntervalValidator),
		overrideBillingIntervalCount: v.optional(v.number()),
		overrideTrialDays: v.optional(v.number()),
		overrideGracePeriodDays: v.optional(v.number()),
		overridePausable: v.optional(v.boolean()),
	},
	returns: v.id("commerce_product_subscription_overrides"),
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
			await patchDynamicWithMediaReferences(ctx, existing._id, payload);
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
export const removeProductOverride = mutation({
	args: {
		productId: v.id("commerce_products"),
	},
	returns: v.object({ success: v.boolean() }),
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

		await deleteDynamicWithMediaReferences(ctx, existing._id);
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
export const create = mutation({
	args: {
		customerId: v.optional(v.id("commerce_customer_profiles")),
		userId: v.optional(v.id("users")),
		productId: v.id("commerce_products"),
		variantId: v.optional(v.id("commerce_product_variants")),
		orderId: v.optional(v.id("commerce_orders")),
		orderItemId: v.optional(v.id("commerce_order_items")),
		sourceChannel: v.optional(commerceSubscriptionSourceChannelValidator),
		sourceCheckoutIntentId: v.optional(
			v.id("commerce_subscription_checkout_intents"),
		),
		/** The Forms-extension submission this contract came from, if any. */
		sourceFormSubmissionId: v.optional(v.id("form_submissions")),
		templateId: v.optional(v.id("commerce_subscription_templates")),
		quantity: v.optional(v.number()),
		setupFeeAmount: v.optional(v.number()),
		paymentProvider: v.optional(v.string()),
		paymentTransactionId: v.optional(v.string()),
		defaultPaymentMethodId: v.optional(v.string()),
		manualBilling: v.optional(v.boolean()),
		/** Open-ended integrator metadata as a JSON object, JSON-encoded. */
		sourceMetadataJson: v.optional(v.string()),
		idempotencyKey: v.optional(v.string()),
	},
	returns: createSubscriptionResponseValidator,
	handler: async (ctx, args): Promise<CreateSubscriptionResponse> => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		const actor = await requireCan(ctx, "manage_options");
		const sourceMetadata = parseOptionalJsonObjectArgument(args.sourceMetadataJson, "sourceMetadataJson");

		const correlationId = createCorrelationId();
		const idempotency = await claimIdempotencyKey(
			ctx,
			args.idempotencyKey,
			"subscription.create",
			isCreateSubscriptionResponse,
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

			let variant: Doc<"commerce_product_variants"> | null = null;
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
				sourceMetadata,
				createdAt: now,
				updatedAt: now,
			});

			// Create subscription item
			await ctx.db.insert("commerce_subscription_items", {
				subscriptionId,
				productId: args.productId,
				variantId: args.variantId,
				bundleId: undefined,
				titleSnapshot: variant?.title ?? product.title,
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

			const response: CreateSubscriptionResponse = {
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
export const pause = mutation({
	args: {
		subscriptionId: v.id("commerce_subscriptions"),
		reason: v.optional(v.string()),
	},
	returns: commerceSubscriptionsDocs.commerce_subscriptions,
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
		assertOwnerMayTransition(isAdmin, subscription.status, OWNER_PAUSABLE, "pause");

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
export const resume = mutation({
	args: {
		subscriptionId: v.id("commerce_subscriptions"),
	},
	returns: commerceSubscriptionsDocs.commerce_subscriptions,
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
		assertOwnerMayTransition(isAdmin, subscription.status, OWNER_RESUMABLE, "resume");

		const now = Date.now();
		const nextBillingAt = resumedBillingAt(subscription.currentPeriodEndAt, now);

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
export const scheduleCancel = mutation({
	args: {
		subscriptionId: v.id("commerce_subscriptions"),
		reason: v.optional(v.string()),
	},
	returns: commerceSubscriptionsDocs.commerce_subscriptions,
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
		assertOwnerMayTransition(
			isAdmin,
			subscription.status,
			OWNER_SCHEDULE_CANCELLABLE,
			"schedule cancellation of",
		);

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
export const cancelNow = mutation({
	args: {
		subscriptionId: v.id("commerce_subscriptions"),
		reason: v.optional(v.string()),
	},
	returns: commerceSubscriptionsDocs.commerce_subscriptions,
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
export const updateSubscription = mutation({
	args: {
		subscriptionId: v.id("commerce_subscriptions"),
		recurringAmount: v.optional(v.number()),
		currencyCode: v.optional(v.string()),
		nextBillingAt: v.optional(v.number()),
	},
	returns: v.id("commerce_subscriptions"),
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

		await ctx.db.patch("commerce_subscriptions", args.subscriptionId, patch);

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
export const grantEntitlement = mutation({
	args: {
		subscriptionId: v.id("commerce_subscriptions"),
		entitlementCode: v.string(),
		/** Open-ended integrator metadata as a JSON object, JSON-encoded. */
		metadataJson: v.optional(v.string()),
	},
	returns: v.id("commerce_subscription_entitlements"),
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
			metadata: parseOptionalJsonObjectArgument(args.metadataJson, "metadataJson"),
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Revoke an entitlement (admin).
 */
export const revokeEntitlement = mutation({
	args: {
		entitlementId: v.id("commerce_subscription_entitlements"),
	},
	returns: v.object({ success: v.boolean() }),
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
		await ctx.db.patch("commerce_subscription_entitlements", args.entitlementId, {
			status: "revoked",
			endsAt: now,
			updatedAt: now,
		});

		return { success: true };
	},
});
