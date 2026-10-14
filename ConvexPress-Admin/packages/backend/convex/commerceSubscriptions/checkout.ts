/**
 * Commerce Subscriptions — Checkout (Wave 5 Task 5.2)
 *
 * Public-facing checkout flow for direct-signup subscriptions:
 *
 *   1. `createCheckoutIntent` — validates offer + optional coupon, persists a
 *      `commerce_subscription_checkout_intents` row with status `payment_pending`
 *      and the server-computed price. Returns intentId and an explicit payment
 *      readiness descriptor.
 *
 *   2. Activation — creates the subscription contract + subscription_item +
 *      initial entitlements, records history and seeds a coupon redemption.
 *      Paid intents are activated only by `activateFromIntent` (internal),
 *      after the server has verified the Stripe payment (signature-verified
 *      webhook, or `publicCharge.confirmFirstCharge` retrieving the
 *      PaymentIntent/SetupIntent from Stripe). Zero-amount intents are
 *      activated by their signed-in owner through `activateFreeIntent`.
 *      Admin-side `mutations.create` is a separate admin-only provisioning
 *      flow.
 *
 *   Forms: a form's `subscription` action creates its intent through
 *   `createCheckoutIntentForSubmission`, which binds the intent to the
 *   signed-in submitter the server recorded on the submission. Activating an
 *   intent started by a form completes the form's waiting action run.
 */

import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import { getCurrentUser, requireAuth } from "../helpers/auth";
import { findCouponByCode, initializeRedemption, validateCoupon } from "../helpers/coupons";
import { emitEvent } from "../helpers/events";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import {
	isOfferOpenForDirectSignup,
	requireCommerceSubscriptionsEnabled,
} from "./helpers";
import { normalizeFormReturnUrl } from "../extensions/forms/redirects";
import { commerceSubscriptionCheckoutIntentStatusValidator } from "../schema/commerceSubscriptions";
import { completeCheckoutRuns } from "../extensions/forms/checkoutRuns";
import { SUBSCRIPTION_EVENTS } from "../events/constants";
import { allocateSubscriptionInvoiceNumber } from "./invoiceNumbers";
import { assertNotAlreadySubscribed, findLiveContractWithCodes } from "./ownership";
import { addBillingPeriod } from "./lifecycle";
import { snapshotNumber, snapshotString } from "./snapshot";
import { activationResultValidator, type ActivationResult } from "./validators";

// ─── Helpers (duplicated with intentional care; see mutations.ts) ───────────

type BillingInterval = "day" | "week" | "month" | "year";
type SubscriptionStatus = Doc<"commerce_subscriptions">["status"];

type HistoryEntry = {
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

function addDays(timestamp: number, days: number): number {
	return timestamp + days * 24 * 60 * 60 * 1000;
}

function createCorrelationId(): string {
	return `ck_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function writeHistory(ctx: MutationCtx, args: HistoryEntry) {
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

async function isBridgeEnabled(ctx: QueryCtx | MutationCtx): Promise<boolean> {
	const commerceOn = await isPluginEnabled(ctx, "commerceSubscriptions");
	if (!commerceOn) return false;
	const membershipOn = await isPluginEnabled(ctx, "membership");
	if (!membershipOn) return false;

	try {
		const settingsRow = await ctx.db
			.query("settings")
			.withIndex("by_section", (q) =>
				q.eq("section", "membership.general"),
			)
			.unique();
		const values = (settingsRow?.values ?? {}) as Record<string, unknown>;
		if (values.acceptSubscriptionGrants === false) return false;
	} catch {
		// Settings read failure should not block the bridge.
	}

	return true;
}

async function isLiveSubscriptionChargingEnabled(
	ctx: QueryCtx | MutationCtx,
): Promise<boolean> {
	const settingsRow = await ctx.db
		.query("settings")
		.withIndex("by_section", (q) =>
			q.eq("section", "commerce.payments"),
		)
		.unique();
	const values = (settingsRow?.values ?? {}) as Record<string, unknown>;
	return values.subscriptionChargingEnabled === true;
}

// ─── createCheckoutIntent ───────────────────────────────────────────────────

const checkoutIntentCreatedValidator = v.object({
	intentId: v.id("commerce_subscription_checkout_intents"),
	amount: v.number(),
	recurringAmount: v.number(),
	currency: v.string(),
	trialDays: v.number(),
	paymentProcessorData: v.object({ provider: v.string(), ready: v.boolean(), message: v.string() }),
});
type CheckoutIntentCreated = Infer<typeof checkoutIntentCreatedValidator>;

/** What a buyer chose; everything priced is recomputed on the server. */
type CheckoutIntentInput = {
	offerId: Id<"commerce_subscription_offers">;
	customerEmail?: string;
	couponCode?: string;
	returnUrl?: string;
};

/**
 * The Forms submission a checkout was started from. Server-derived only: the
 * public `createCheckoutIntent` never takes it from a client.
 */
type CheckoutFormSource = {
	formId: Id<"forms">;
	formSubmissionId: Id<"form_submissions">;
};

/**
 * Validate the offer + optional coupon and persist a `payment_pending` intent
 * owned by `owner` (null for a signed-out checkout, which must carry an email).
 */
async function insertCheckoutIntent(
	ctx: MutationCtx,
	args: CheckoutIntentInput,
	owner: Doc<"users"> | null,
	formSource: CheckoutFormSource | null,
): Promise<CheckoutIntentCreated> {
	const returnUrl = normalizeFormReturnUrl(args.returnUrl);

	const now = Date.now();

	// Load the offer; reject if missing or archived.
	const offer = await ctx.db.get(args.offerId);
	if (!offer) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Offer not found.",
		});
	}
	if (offer.status === "archived") {
		throw new ConvexError({
			code: "OFFER_ARCHIVED",
			message: "This offer is no longer available.",
		});
	}
	if (!isOfferOpenForDirectSignup(offer)) {
		throw new ConvexError({
			code: "OFFER_UNAVAILABLE",
			message: "This offer is not available for signup.",
		});
	}

	await assertNotAlreadySubscribed(ctx, offer, { userId: owner?._id, email: owner ? undefined : args.customerEmail });

	// Load the template to resolve trial/grace defaults.
	const template = await ctx.db.get(offer.templateId);
	const {
		trialDays,
		recurringAmount,
		setupFeeAmount,
		currencyCode,
		initialAmount,
	} = computeIntentPricing(offer, template);

	const userId = owner?._id;

	// Resolve the customer email: prefer the owner's account email; else fall
	// back to the supplied one. At least one is required.
	const customerEmail = owner?.email ?? args.customerEmail;
	if (!customerEmail) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message:
				"customerEmail is required when creating a checkout intent for an anonymous user.",
		});
	}

	// Validate the coupon code up-front if provided. We don't persist the
	// coupon id here — we just record the code so activation can re-validate
	// before redemption (coupon state might change between steps).
	let couponCodeNormalized: string | undefined;
	if (args.couponCode && args.couponCode.trim().length > 0) {
		const code = args.couponCode.trim();
		// validateCoupon expects a userId for per-customer-limit checks. If
		// anonymous, we check the non-customer-limit gates only (offer, expiry,
		// status). The per-customer limit check is re-run at activation time
		// once the real user is resolved.
		if (userId) {
			const validation = await validateCoupon(
				ctx,
				code,
				null,
				userId,
				args.offerId,
			);
			if (!validation.valid) {
				throw new ConvexError({
					code: "COUPON_INVALID",
					message: `Coupon cannot be applied: ${validation.reason}.`,
					reason: validation.reason,
				});
			}
		} else {
			// Anonymous: check the non-customer-limit gates only.
			const coupon = await findCouponByCode(ctx, code);
			if (!coupon) {
				throw new ConvexError({
					code: "COUPON_INVALID",
					message: "Coupon code not found.",
					reason: "not_found",
				});
			}
			if (coupon.status !== "active") {
				throw new ConvexError({
					code: "COUPON_INVALID",
					message: "Coupon is not active.",
					reason: "not_active",
				});
			}
			if (typeof coupon.expiresAt === "number" && now > coupon.expiresAt) {
				throw new ConvexError({
					code: "COUPON_INVALID",
					message: "Coupon has expired.",
					reason: "expired",
				});
			}
			const offerScope = coupon.offerIds ?? [];
			if (offerScope.length > 0 && !offerScope.includes(args.offerId)) {
				throw new ConvexError({
					code: "COUPON_INVALID",
					message: "Coupon is not valid for this offer.",
					reason: "not_valid_for_offer",
				});
			}
		}
		couponCodeNormalized = code;
	}

	const liveChargingEnabled = await isLiveSubscriptionChargingEnabled(ctx);
	const paymentReady =
		initialAmount <= 0 || liveChargingEnabled
			? true
			: false;

	const intentId = await ctx.db.insert(
		"commerce_subscription_checkout_intents",
		{
			sourceChannel: "direct_form",
			status: "payment_pending",
			userId: userId,
			customerId: undefined,
			email: customerEmail,
			orderId: undefined,
			orderItemIds: undefined,
			selectedOfferIds: [args.offerId],
			pricingSnapshot: {
				offerId: args.offerId,
				offerSlug: offer.slug,
				offerTitle: offer.title,
				recurringAmount,
				setupFeeAmount,
				currencyCode,
				trialDays,
				couponCode: couponCodeNormalized,
				returnUrl,
			},
			initialAmount,
			recurringAmount,
			setupFeeAmount,
			currencyCode,
			paymentProvider: undefined,
			paymentTransactionId: undefined,
			savedPaymentMethodId: undefined,
			subscriptionId: undefined,
			idempotencyKey: undefined,
			// Expire the intent in 1 hour if not activated.
			expiresAt: addDays(now, 0) + 60 * 60 * 1000,
			metadata: {
				couponCode: couponCodeNormalized,
				returnUrl,
				sourceFormId: formSource?.formId,
				sourceFormSubmissionId: formSource?.formSubmissionId,
			},
			createdAt: now,
			updatedAt: now,
		},
	);

	return {
		intentId,
		amount: initialAmount,
		recurringAmount,
		currency: currencyCode,
		trialDays,
		paymentProcessorData: {
			provider: initialAmount <= 0 ? "free" : "stripe",
			ready: paymentReady,
			message: paymentReady
				? initialAmount <= 0
					? "Zero-dollar checkout is activated by its signed-in owner with activateFreeIntent."
					: "Live subscription charging is enabled; complete Stripe payment before activation."
				: "Paid subscription checkout is disabled until live subscription charging is configured.",
		},
	};
}

/**
 * Validate an offer + optional coupon and persist a checkout intent.
 *
 * May be called by logged-in OR logged-out users. If logged out, `customerEmail`
 * must be supplied so the signup flow can later look up / create the user
 * record. The intent is NOT automatically activated: a paid intent is
 * activated after Stripe settles (webhook or `confirmFirstCharge`), a
 * zero-amount intent by its signed-in owner through `activateFreeIntent`.
 *
 * Throws:
 *   - `NOT_FOUND`         — offer id does not exist
 *   - `OFFER_ARCHIVED`    — offer has status=archived
 *   - `OFFER_UNAVAILABLE` — offer is a draft or is not available for direct
 *                           signup (admin-provisioned offers are never
 *                           self-served)
 *   - `VALIDATION_ERROR`  — missing customerEmail for anonymous checkout, or
 *                           coupon validation failure
 */
export const createCheckoutIntent = mutation({
	args: {
		offerId: v.id("commerce_subscription_offers"),
		customerEmail: v.optional(v.string()),
		couponCode: v.optional(v.string()),
		returnUrl: v.optional(v.string()),
	},
	returns: checkoutIntentCreatedValidator,
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		// The acting user may be null for a logged-out signup.
		return await insertCheckoutIntent(ctx, args, await getCurrentUser(ctx), null);
	},
});

/**
 * The Forms `subscription`/`payment` action's checkout start. The action runner
 * has no caller identity, so the owner is the signed-in submitter the server
 * recorded on the submission at submit time, and the form linkage comes from
 * the submission itself.
 *
 * Account policy:
 *   - `require_existing`  — a signed-in, active submitter is required; the
 *                           intent is bound to that account.
 *   - `create_on_website` — a signed-in submitter is bound the same way; a
 *                           signed-out submission becomes a guest intent for
 *                           the email typed into the form, which activation
 *                           grants only to the VERIFIED owner of that email.
 *   A submission recorded with an account that is no longer active never
 *   starts a checkout.
 */
export const createCheckoutIntentForSubmission = internalMutation({
	args: {
		submissionId: v.id("form_submissions"),
		offerId: v.id("commerce_subscription_offers"),
		customerEmail: v.optional(v.string()),
		couponCode: v.optional(v.string()),
		returnUrl: v.optional(v.string()),
		accountPolicy: v.union(
			v.literal("require_existing"),
			v.literal("create_on_website"),
		),
	},
	returns: v.union(
		v.object({ ok: v.literal(true), intent: checkoutIntentCreatedValidator }),
		v.object({ ok: v.literal(false), reason: v.literal("sign_in_required") }),
	),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const submission = await ctx.db.get(args.submissionId);
		if (!submission || submission.status !== "complete") {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Completed form submission not found.",
			});
		}
		const submitter = submission.userId ? await ctx.db.get(submission.userId) : null;
		const activeSubmitter = submitter && submitter.status === "active" ? submitter : null;
		if (submission.userId && !activeSubmitter) {
			return { ok: false as const, reason: "sign_in_required" as const };
		}
		if (args.accountPolicy === "require_existing" && !activeSubmitter) {
			return { ok: false as const, reason: "sign_in_required" as const };
		}

		const intent = await insertCheckoutIntent(
			ctx,
			{
				offerId: args.offerId,
				customerEmail: args.customerEmail,
				couponCode: args.couponCode,
				returnUrl: args.returnUrl,
			},
			activeSubmitter,
			{ formId: submission.formId, formSubmissionId: submission._id },
		);
		return { ok: true as const, intent };
	},
});

// ─── Activation ─────────────────────────────────────────────────────────────
//
// TRUST BOUNDARY. Activation creates the subscription contract, its item and
// its entitlements, and bridges them into membership, so it grants access.
// The server never takes a client's word that a payment happened:
//
//   - `activateFromIntent` (internal) activates PAID intents. Only code that
//     has already verified the payment with Stripe may call it: the
//     signature-verified Stripe webhook, or `publicCharge.confirmFirstCharge`,
//     which retrieves the PaymentIntent/SetupIntent from Stripe with the secret
//     key. Both reach it through the same internal mutations, so whichever
//     arrives first activates and the other replays the existing contract. It
//     re-checks the settlement against the intent (metadata, amount, currency,
//     mode) before granting, and grants to the intent's own account when it has
//     one (see `resolvePaidIntentUser`).
//   - `activateFreeIntent` (public) activates ZERO-AMOUNT intents only. It
//     takes no payment fields, requires the signed-in owner of the intent, and
//     requires every server-computed amount to be 0.
//   - `activateFreeIntentForSubmission` (internal) is the Forms runner's
//     zero-amount path. The runner has no caller identity, so the owner is the
//     signed-in user the server recorded on the form submission.

type IntentDoc = Doc<"commerce_subscription_checkout_intents">;
type OfferDoc = Doc<"commerce_subscription_offers">;
type TemplateDoc = Doc<"commerce_subscription_templates">;

/**
 * A Stripe object the server itself retrieved or received through a
 * signature-verified webhook. `checkoutIntentRef` is the `checkoutIntentId`
 * metadata Stripe reports for the object, which the server set when it
 * created the PaymentIntent/SetupIntent in `beginSubscriptionFirstCharge`.
 */
export const verifiedStripeSettlementValidator = v.union(
	v.object({
		kind: v.literal("payment_intent"),
		paymentIntentId: v.string(),
		status: v.literal("succeeded"),
		amountReceived: v.number(),
		currency: v.string(),
		checkoutIntentRef: v.string(),
		paymentMethodId: v.optional(v.string()),
		stripeCustomerId: v.optional(v.string()),
	}),
	v.object({
		kind: v.literal("setup_intent"),
		setupIntentId: v.string(),
		status: v.literal("succeeded"),
		checkoutIntentRef: v.string(),
		paymentMethodId: v.string(),
		stripeCustomerId: v.string(),
	}),
);
type VerifiedStripeSettlement = Infer<typeof verifiedStripeSettlementValidator>;

/** How the server established that this intent may be activated. */
type Settlement = {
	provider: "stripe" | "free";
	providerTransactionId: string;
	paymentMethodId?: string;
	stripeCustomerId?: string;
};

function normalizeEmail(email: string | undefined): string | undefined {
	const normalized = email?.trim().toLowerCase();
	return normalized ? normalized : undefined;
}

/** Server-side price of an offer, exactly as `createCheckoutIntent` stores it. */
function computeIntentPricing(offer: OfferDoc, template: TemplateDoc | null) {
	const trialDays = offer.trialDaysOverride ?? template?.trialDays ?? 0;
	const recurringAmount = offer.recurringAmount ?? 0;
	const setupFeeAmount = offer.setupFeeAmount ?? 0;
	return {
		trialDays,
		recurringAmount,
		setupFeeAmount,
		currencyCode: offer.currencyCode ?? "USD",
		// Setup fee + first period (unless the offer starts with a trial).
		initialAmount: setupFeeAmount + (trialDays > 0 ? 0 : recurringAmount),
	};
}

async function loadIntentOffer(
	ctx: MutationCtx,
	intent: IntentDoc,
): Promise<{ offer: OfferDoc; template: TemplateDoc | null }> {
	// Wave 5 direct signup is single-offer.
	const offerId = intent.selectedOfferIds[0];
	if (!offerId) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: "Intent has no selected offer.",
		});
	}
	const offer = await ctx.db.get(offerId);
	if (!offer) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Offer referenced by intent no longer exists.",
		});
	}
	const template = await ctx.db.get(offer.templateId);
	return { offer, template };
}

/**
 * The Forms submission an intent was started from (recorded by
 * `createCheckoutIntentForSubmission`), or undefined.
 */
function intentFormSubmissionId(
	ctx: QueryCtx | MutationCtx,
	intent: IntentDoc,
): Id<"form_submissions"> | undefined {
	const ref = snapshotString(intent.metadata, "sourceFormSubmissionId");
	if (!ref) return undefined;
	return ctx.db.normalizeId("form_submissions", ref) ?? undefined;
}

/** Complete the form action runs that were waiting on this intent's payment. */
async function settleFormCheckout(
	ctx: MutationCtx,
	intent: IntentDoc,
	contractId: Id<"commerce_subscriptions">,
	status: SubscriptionStatus,
): Promise<void> {
	const submissionId = intentFormSubmissionId(ctx, intent);
	if (!submissionId) return;
	await completeCheckoutRuns(ctx, submissionId, {
		intentId: intent._id,
		contractId,
		status,
		amount: intent.initialAmount,
		recurringAmount: intent.recurringAmount,
		currency: intent.currencyCode,
	});
}

/** Return the contract of an already-activated intent (idempotent replay). */
async function existingActivation(
	ctx: MutationCtx,
	intent: IntentDoc,
): Promise<ActivationResult | null> {
	if (intent.status !== "activated" || !intent.subscriptionId) return null;
	const subscription = await ctx.db.get(intent.subscriptionId);
	await ctx.runMutation(internal.purchases.internals.syncSubscriptionCheckoutIntent, {
		intentId: intent._id,
	});
	const status = subscription?.status ?? "active";
	// A run still waiting on an intent that is already active is settled here,
	// so a replay heals a run the first activation could not reach.
	await settleFormCheckout(ctx, intent, intent.subscriptionId, status);
	return {
		ok: true as const,
		contractId: intent.subscriptionId,
		status,
		trialDays: snapshotNumber(intent.pricingSnapshot, "trialDays") ?? 0,
		currentPeriodEndAt:
			subscription?.currentPeriodEndAt ?? subscription?.nextBillingAt,
	};
}

/** Only pending/draft intents may be activated; everything else is done. */
function assertIntentActivatable(intent: IntentDoc): void {
	if (intent.status !== "payment_pending" && intent.status !== "draft") {
		throw new ConvexError({
			code: "INTENT_ALREADY_PROCESSED",
			message: `Intent is in status "${intent.status}" — cannot activate.`,
			currentStatus: intent.status,
		});
	}
}

function paymentMismatch(message: string): ConvexError<{ code: string; message: string }> {
	return new ConvexError({ code: "PAYMENT_MISMATCH", message });
}

/**
 * Check a Stripe settlement against the server-computed intent. A settlement
 * for another intent, another amount, another currency or the wrong mode is
 * never activated.
 */
function verifyStripeSettlement(
	intent: IntentDoc,
	settlement: VerifiedStripeSettlement,
): Settlement {
	if (settlement.checkoutIntentRef !== String(intent._id)) {
		throw paymentMismatch("The Stripe payment belongs to a different checkout intent.");
	}
	if (settlement.kind === "payment_intent") {
		if (intent.initialAmount <= 0) {
			throw paymentMismatch("This checkout intent does not take an initial charge.");
		}
		if (settlement.amountReceived !== intent.initialAmount) {
			throw paymentMismatch(
				`Stripe received ${settlement.amountReceived}, but the intent charges ${intent.initialAmount}.`,
			);
		}
		if (settlement.currency.toUpperCase() !== intent.currencyCode.toUpperCase()) {
			throw paymentMismatch(
				`Stripe charged ${settlement.currency}, but the intent is priced in ${intent.currencyCode}.`,
			);
		}
		return {
			provider: "stripe",
			providerTransactionId: settlement.paymentIntentId,
			paymentMethodId: settlement.paymentMethodId,
			stripeCustomerId: settlement.stripeCustomerId,
		};
	}
	// A SetupIntent collects a card without charging it. It can only settle a
	// $0-now intent whose recurring price is billed later.
	if (intent.initialAmount !== 0 || intent.setupFeeAmount !== 0) {
		throw paymentMismatch("A saved card cannot settle an intent that charges now.");
	}
	if (intent.recurringAmount <= 0) {
		throw paymentMismatch("A free checkout intent does not need a saved card.");
	}
	return {
		provider: "stripe",
		providerTransactionId: settlement.setupIntentId,
		paymentMethodId: settlement.paymentMethodId,
		stripeCustomerId: settlement.stripeCustomerId,
	};
}

/**
 * The account a paid intent belongs to.
 *
 *   - An intent with a `userId` (created signed-in, or by a signed-in form
 *     submitter) belongs to that account. If the intent's email is the
 *     VERIFIED email of other accounts only, the two identities disagree and
 *     nothing is activated.
 *   - A guest intent (no `userId`) belongs to the one account whose VERIFIED
 *     email the payer entered. An unverified account never receives a
 *     subscription by email match, and an email verified on more than one
 *     account is ambiguous and refused.
 *
 * Throws `USER_NOT_FOUND` (retryable: the website has not finished signup yet)
 * or `ACCOUNT_MISMATCH` (permanent: an operator must reconcile the accounts).
 */
async function resolvePaidIntentUser(
	ctx: MutationCtx,
	intent: IntentDoc,
): Promise<Id<"users">> {
	const email = normalizeEmail(intent.email);
	const verifiedOwners = email
		? (
				await ctx.db
					.query("users")
					.withIndex("by_email", (q) => q.eq("email", email))
					.collect()
			).filter((user) => user.emailVerified)
		: [];

	if (intent.userId) {
		const owner = await ctx.db.get(intent.userId);
		if (!owner) {
			throw new ConvexError({
				code: "USER_NOT_FOUND",
				message: "The account that started this checkout no longer exists.",
			});
		}
		if (
			verifiedOwners.length > 0 &&
			!verifiedOwners.some((user) => user._id === owner._id)
		) {
			throw new ConvexError({
				code: "ACCOUNT_MISMATCH",
				message:
					"This checkout's account and the verified owner of its email are different accounts.",
			});
		}
		return owner._id;
	}

	if (!email) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: "Intent has no userId and no customerEmail — cannot resolve user.",
		});
	}
	if (verifiedOwners.length > 1) {
		throw new ConvexError({
			code: "ACCOUNT_MISMATCH",
			message: "More than one verified account uses this checkout's email.",
		});
	}
	const owner = verifiedOwners[0];
	// If not found, the website has not finished signup yet (the Clerk sync
	// creates the row with a verified email). The webhook retries, and
	// `confirmFirstCharge` reports the checkout as pending.
	if (!owner) {
		throw new ConvexError({
			code: "USER_NOT_FOUND",
			message:
				"No verified account found for this email. Complete signup before activating the subscription.",
		});
	}
	return owner._id;
}

/**
 * A zero-amount intent: every server-computed amount stored on the intent is
 * 0, and the offer still prices to 0 and is still open for direct signup.
 */
async function assertZeroAmountIntent(
	ctx: MutationCtx,
	intent: IntentDoc,
): Promise<void> {
	const { offer, template } = await loadIntentOffer(ctx, intent);
	if (!isOfferOpenForDirectSignup(offer)) {
		throw new ConvexError({
			code: "OFFER_UNAVAILABLE",
			message: "This offer is not available for signup.",
		});
	}
	const current = computeIntentPricing(offer, template);
	const amounts = [
		intent.initialAmount,
		intent.setupFeeAmount,
		intent.recurringAmount,
		current.initialAmount,
		current.setupFeeAmount,
		current.recurringAmount,
	];
	if (amounts.some((amount) => amount !== 0)) {
		throw new ConvexError({
			code: "PAYMENT_REQUIRED",
			message:
				"This checkout has a price. It is activated by the payment provider after payment, not by free activation.",
		});
	}
}

/**
 * Create the subscription contract + item + entitlements for a pending intent
 * whose settlement the caller has already established. Never exported: every
 * route into it goes through one of the guarded functions below.
 */
async function activateIntent(
	ctx: MutationCtx,
	intent: IntentDoc,
	settlement: Settlement,
	userId: Id<"users">,
): Promise<ActivationResult> {
	const now = Date.now();
	const correlationId = createCorrelationId();
	const intentId = intent._id;
	const { offer, template } = await loadIntentOffer(ctx, intent);
	const offerId = offer._id;

	// Build the contract.
	const billingInterval: BillingInterval = template?.billingInterval ?? "month";
	const billingIntervalCount = template?.billingIntervalCount ?? 1;
	const trialDays = offer.trialDaysOverride ?? template?.trialDays ?? 0;

	const status: "trialing" | "active" = trialDays > 0 ? "trialing" : "active";
	const currentPeriodStartAt = now;
	const currentPeriodEndAt =
		trialDays > 0
			? addDays(now, trialDays)
			: addBillingPeriod(now, billingInterval, billingIntervalCount);

	// The intent's server-computed price is authoritative for the contract.
	const recurringAmount = intent.recurringAmount;
	const setupFeeAmount = intent.setupFeeAmount;
	const currencyCode = intent.currencyCode;

	const pricingSnapshot = {
		offerId,
		offerSlug: offer.slug,
		recurringAmount,
		setupFeeAmount,
		currencyCode,
		billingInterval,
		billingIntervalCount,
		trialDays,
		templateId: template?._id,
		templateVersion: template?.version,
		fromIntentId: intentId,
	};

	const paymentMethodId = settlement.paymentMethodId ?? intent.savedPaymentMethodId;
	const stripeCustomerId = settlement.stripeCustomerId ?? intent.stripeCustomerId;
	const sourceFormSubmissionId = intentFormSubmissionId(ctx, intent);

	const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
		customerId: intent.customerId,
		userId,
		sourceChannel: "direct_form",
		sourceCheckoutIntentId: intentId,
		sourceOrderId: undefined,
		sourceFormSubmissionId,
		productId: offer.productId,
		orderId: undefined,
		orderItemId: undefined,
		templateId: template?._id,
		templateVersion: template?.version,
		status,
		currencyCode,
		recurringAmount,
		setupFeeAmount,
		billingInterval,
		billingIntervalCount,
		nextBillingAt: currentPeriodEndAt,
		currentPeriodStartAt,
		currentPeriodEndAt,
		trialEndsAt: trialDays > 0 ? currentPeriodEndAt : undefined,
		cancelAtPeriodEnd: false,
		cancelScheduledAt: undefined,
		cancelledAt: undefined,
		pausedAt: undefined,
		gracePeriodEndsAt: undefined,
		defaultPaymentMethodId: paymentMethodId,
		stripeCustomerId,
		paymentProvider: settlement.provider,
		paymentTransactionId: settlement.providerTransactionId,
		lastInvoiceId: undefined,
		manualBilling: false,
		pricingSnapshot,
		sourceMetadata: {
			intentId,
			couponCode: snapshotString(intent.pricingSnapshot, "couponCode"),
			returnUrl: snapshotString(intent.pricingSnapshot, "returnUrl"),
		},
		offerHistory: [
			{
				offerId,
				effectiveAt: now,
				reason: "initial_signup",
			},
		],
		createdAt: now,
		updatedAt: now,
	});

	// Create the subscription item — binds the contract to the offer so
	// future portal queries (currentOffer, plan-change) and the proration path
	// can resolve the active offer from the item.
	await ctx.db.insert("commerce_subscription_items", {
		subscriptionId,
		sourceOfferId: offerId,
		sourceOfferItemId: undefined,
		productId: offer.productId,
		variantId: offer.variantId,
		bundleId: offer.bundleId,
		titleSnapshot: offer.title,
		quantity: 1,
		unitAmount: recurringAmount,
		unitRecurringAmount: recurringAmount,
		unitSetupFeeAmount: setupFeeAmount,
		currencyCode,
		status: "active",
		startsAt: now,
		currentPeriodEndAt,
		cancelAtPeriodEnd: false,
		cancelledAt: undefined,
		entitlementCodes: offer.entitlementCodes,
		priceSnapshot: pricingSnapshot,
		metadata: {
			fromIntentId: intentId,
		},
		createdAt: now,
		updatedAt: now,
	});

	// Create entitlements from offer.entitlementCodes and bridge them into
	// membership immediately when the bridge is enabled.
	const codes = Array.from(
		new Set((offer.entitlementCodes ?? []).filter(Boolean)),
	);
	for (const code of codes) {
		await ctx.db.insert("commerce_subscription_entitlements", {
			subscriptionId,
			userId,
			entitlementCode: code,
			status: "active",
			startsAt: now,
			endsAt: undefined,
			graceEndsAt: undefined,
			metadata: {
				offerId,
				fromIntentId: intentId,
			},
			createdAt: now,
			updatedAt: now,
		});
	}

	if (await isBridgeEnabled(ctx)) {
		for (const code of codes) {
			try {
				await ctx.runMutation(
					internal.membership.internals.grantFromSubscription,
					{
						userId,
						entitlementCode: code,
						subscriptionId: String(subscriptionId),
						endsAt: currentPeriodEndAt,
					},
				);
			} catch (err) {
				await writeHistory(ctx, {
					subscriptionId,
					eventType: "subscription.bridge_failed",
					message: `Membership bridge call failed for entitlement ${code}`,
					fromStatus: status,
					toStatus: status,
					reason: "bridge_error",
					data: {
						entitlementCode: code,
						action: "grant",
						error: err instanceof Error ? err.message : String(err),
					},
					correlationId,
				});
			}
		}
	}

	// If the intent had a coupon, seed a redemption row now. This only sets
	// up the redemption — actual discount application happens on the next
	// invoice via helpers/coupons.applyCouponToInvoice.
	const couponCode = snapshotString(intent.pricingSnapshot, "couponCode");
	let redemptionId: Id<"commerce_subscription_coupon_redemptions"> | undefined;
	if (couponCode !== undefined && couponCode.length > 0) {
		const validation = await validateCoupon(
			ctx,
			couponCode,
			subscriptionId,
			userId,
			offerId,
		);
		if (validation.valid) {
			redemptionId = await initializeRedemption(
				ctx,
				subscriptionId,
				validation.coupon._id,
			);
		}
		// If the coupon became invalid between intent creation and activation
		// (e.g. it was archived), we silently drop it rather than failing the
		// whole activation. The customer still gets their subscription — the
		// coupon is just no longer applied. A history row records this.
		else {
			await writeHistory(ctx, {
				subscriptionId,
				eventType: "subscription.coupon_skipped",
				message: `Coupon "${couponCode}" was invalid at activation time (${validation.reason}).`,
				data: { couponCode, reason: validation.reason },
				correlationId,
			});
		}
	}

	await writeHistory(ctx, {
		subscriptionId,
		eventType: "subscription.created_from_intent",
		actorUserId: userId,
		toStatus: status,
		data: {
			intentId,
			offerId,
			couponCode,
			redemptionId,
			trialDays,
			recurringAmount,
			setupFeeAmount,
			currencyCode,
			paymentProvider: settlement.provider,
			paymentTransactionId: settlement.providerTransactionId,
		},
		correlationId,
	});

	await ctx.db.patch("commerce_subscription_checkout_intents", intentId, {
		status: "activated",
		subscriptionId,
		userId,
		paymentProvider: settlement.provider,
		paymentTransactionId: settlement.providerTransactionId,
		savedPaymentMethodId: paymentMethodId,
		stripeCustomerId,
		updatedAt: now,
	});

	await ctx.runMutation(internal.purchases.internals.syncSubscriptionCheckoutIntent, {
		intentId,
		eventType: "subscription_signup_paid",
		metadata: {
			subscriptionId,
			paymentProvider: settlement.provider,
			paymentTransactionId: settlement.providerTransactionId,
		},
	});

	// Two checkouts paid at the same moment can both get here. The money was
	// taken, so the contract is created; an operator is told to reconcile.
	if (offer.limitOnePerCustomer === true) {
		const existing = await findLiveContractWithCodes(ctx, userId, offer.entitlementCodes ?? [], subscriptionId);
		if (existing) {
			await writeHistory(ctx, {
				subscriptionId,
				eventType: "subscription.duplicate_purchase",
				toStatus: status,
				data: { existingSubscriptionId: existing._id, offerId },
				correlationId,
			});
			await emitEvent(ctx, SUBSCRIPTION_EVENTS.DUPLICATE_PURCHASE, "commerce", {
				subscriptionId,
				existingSubscriptionId: existing._id,
				userId,
				offerId,
			});
		}
	}

	if (intent.initialAmount > 0) {
		await insertSignupInvoice(ctx, {
			intent,
			subscriptionId,
			settlement,
			paymentMethodId,
			offerTitle: offer.title,
			periodStartAt: currentPeriodStartAt,
			periodEndAt: currentPeriodEndAt,
			now,
		});
	}
	// The card's brand and last four for the account page come from Stripe.
	if (settlement.provider === "stripe" && paymentMethodId) {
		await ctx.scheduler.runAfter(0, internal.commerceSubscriptions.paymentMethods.refreshPaymentMethodSummary, {
			contractId: subscriptionId,
		});
	}

	try {
		await emitEvent(ctx, "commerce.subscription_created", "commerce", {
			subscriptionId,
			userId,
			offerId,
			sourceChannel: "direct_form",
			status,
			billingInterval,
			billingIntervalCount,
			recurringAmount,
		});
	} catch {
		// Event emission is best-effort
	}

	// A paid form checkout: the form's `awaiting_payment` action run is done.
	await settleFormCheckout(ctx, intent, subscriptionId, status);

	return {
		ok: true as const,
		contractId: subscriptionId,
		status,
		trialDays,
		currentPeriodEndAt,
	};
}

/**
 * The signup charge as the contract's first invoice, so billing history starts
 * with what the customer paid at signup: the first period (or trial) and any
 * setup fee. It shares the signup's purchase record instead of creating a
 * second one for the same payment.
 */
async function insertSignupInvoice(
	ctx: MutationCtx,
	args: {
		intent: IntentDoc;
		subscriptionId: Id<"commerce_subscriptions">;
		settlement: Settlement;
		paymentMethodId: string | undefined;
		offerTitle: string;
		periodStartAt: number;
		periodEndAt: number;
		now: number;
	},
): Promise<void> {
	const { intent, now } = args;
	const synced = await ctx.db.get(intent._id);
	const setupFee = Math.min(intent.setupFeeAmount ?? 0, intent.initialAmount);
	const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
		subscriptionId: args.subscriptionId,
		checkoutIntentId: intent._id,
		purchaseOrderId: synced?.purchaseOrderId,
		sourceChannel: "direct_form",
		status: "paid",
		invoiceNumber: await allocateSubscriptionInvoiceNumber(ctx),
		currencyCode: intent.currencyCode,
		subtotalAmount: intent.initialAmount,
		taxAmount: 0,
		totalAmount: intent.initialAmount,
		paymentProvider: args.settlement.provider,
		paymentTransactionId: args.settlement.providerTransactionId,
		savedPaymentMethodId: args.paymentMethodId,
		manualBilling: false,
		kind: "signup",
		periodStartAt: args.periodStartAt,
		periodEndAt: args.periodEndAt,
		paidAt: now,
		createdAt: now,
		updatedAt: now,
	});
	const lines: Array<{ description: string; amount: number; lineType: string }> = [];
	if (setupFee > 0) lines.push({ description: `${args.offerTitle} setup fee`, amount: setupFee, lineType: "setup_fee" });
	if (intent.initialAmount - setupFee > 0) {
		lines.push({ description: args.offerTitle, amount: intent.initialAmount - setupFee, lineType: "recurring" });
	}
	for (const line of lines) {
		await ctx.db.insert("commerce_subscription_invoice_items", {
			invoiceId,
			description: line.description,
			quantity: 1,
			unitAmount: line.amount,
			lineType: line.lineType,
			currencyCode: intent.currencyCode,
			lineTotalAmount: line.amount,
			createdAt: now,
		});
	}
	await ctx.db.patch("commerce_subscriptions", args.subscriptionId, { lastInvoiceId: invoiceId });
}

async function loadIntent(
	ctx: MutationCtx,
	intentId: Id<"commerce_subscription_checkout_intents">,
): Promise<IntentDoc> {
	const intent = await ctx.db.get(intentId);
	if (!intent) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Checkout intent not found.",
		});
	}
	return intent;
}

// ─── activateFromIntent (internal: verified Stripe settlements only) ───────

/**
 * Activate a PAID checkout intent from a Stripe settlement the server has
 * already verified (signature-verified webhook, or a PaymentIntent/SetupIntent
 * the server retrieved from Stripe by id). Idempotent: an activated intent
 * returns its existing contract.
 *
 * Throws:
 *   - `PAYMENT_MISMATCH`         — the settlement is for another intent, amount,
 *                                  currency or mode
 *   - `INTENT_ALREADY_PROCESSED` — the intent is not pending
 *   - `USER_NOT_FOUND`           — no account owns the intent yet (the webhook
 *                                  retries after the website completes signup)
 */
export const activateFromIntent = internalMutation({
	args: {
		intentId: v.id("commerce_subscription_checkout_intents"),
		settlement: verifiedStripeSettlementValidator,
	},
	returns: activationResultValidator,
	handler: async (ctx, args): Promise<ActivationResult> => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const intent = await loadIntent(ctx, args.intentId);
		const existing = await existingActivation(ctx, intent);
		if (existing) return existing;
		assertIntentActivatable(intent);

		const settlement = verifyStripeSettlement(intent, args.settlement);
		const userId = await resolvePaidIntentUser(ctx, intent);
		return await activateIntent(ctx, intent, settlement, userId);
	},
});

// ─── activateFreeIntent (public: zero-amount, owner only) ──────────────────

/**
 * Activate a ZERO-AMOUNT checkout intent for the signed-in owner. Takes no
 * payment fields: the only thing a client asserts is which intent.
 *
 * The caller owns the intent when the intent was created by them
 * (`intent.userId`), or when it was created signed-out and its email is the
 * caller's VERIFIED email. Every server-computed amount must be 0 — the stored
 * initial, setup and recurring amounts, and the offer's current price.
 * Idempotent: an activated intent returns its existing contract.
 *
 * Throws:
 *   - `UNAUTHORIZED` / `FORBIDDEN` — not signed in, inactive, or not the owner
 *   - `PAYMENT_REQUIRED`           — the intent or its offer has a price
 *   - `OFFER_UNAVAILABLE`          — the offer is no longer open for signup
 *   - `INTENT_ALREADY_PROCESSED`   — the intent is not pending
 */
export const activateFreeIntent = mutation({
	args: {
		intentId: v.id("commerce_subscription_checkout_intents"),
	},
	returns: activationResultValidator,
	handler: async (ctx, args): Promise<ActivationResult> => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await requireAuth(ctx);
		const intent = await loadIntent(ctx, args.intentId);
		const ownsIntent = intent.userId
			? intent.userId === user._id
			: user.emailVerified &&
				normalizeEmail(intent.email) !== undefined &&
				normalizeEmail(intent.email) === normalizeEmail(user.email);
		if (!ownsIntent) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "This checkout belongs to another account.",
			});
		}

		const existing = await existingActivation(ctx, intent);
		if (existing) return existing;
		assertIntentActivatable(intent);
		await assertZeroAmountIntent(ctx, intent);

		return await activateIntent(
			ctx,
			intent,
			{ provider: "free", providerTransactionId: `free_${intent._id}` },
			user._id,
		);
	},
});

// ─── activateFreeIntentForSubmission (internal: Forms runner) ──────────────

/**
 * The Forms `subscription`/`payment` action's zero-amount path. The action
 * runner executes without a caller identity, so ownership comes from the
 * submission: the server records the signed-in submitter on it at submit
 * time. An anonymous submission cannot claim a subscription — the visitor
 * signs in and submits again.
 */
export const activateFreeIntentForSubmission = internalMutation({
	args: {
		intentId: v.id("commerce_subscription_checkout_intents"),
		submissionId: v.id("form_submissions"),
	},
	returns: v.union(
		activationResultValidator,
		v.object({ ok: v.literal(false), reason: v.literal("sign_in_required") }),
	),
	handler: async (
		ctx,
		args,
	): Promise<ActivationResult | { ok: false; reason: "sign_in_required" }> => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const intent = await loadIntent(ctx, args.intentId);
		const submission = await ctx.db.get(args.submissionId);
		if (!submission) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Form submission not found.",
			});
		}
		if (snapshotString(intent.metadata, "sourceFormSubmissionId") !== String(submission._id)) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "This checkout was not started by this form submission.",
			});
		}
		const submitter = submission.userId ? await ctx.db.get(submission.userId) : null;
		if (!submitter || submitter.status !== "active") {
			return { ok: false as const, reason: "sign_in_required" as const };
		}
		if (intent.userId && intent.userId !== submitter._id) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "This checkout belongs to another account.",
			});
		}

		const existing = await existingActivation(ctx, intent);
		if (existing) return existing;
		assertIntentActivatable(intent);
		await assertZeroAmountIntent(ctx, intent);

		return await activateIntent(
			ctx,
			intent,
			{ provider: "free", providerTransactionId: `free_${intent._id}` },
			submitter._id,
		);
	},
});

// ─── Charge start access (used by the public `beginFirstCharge` action) ────

/**
 * Whether the current caller may start a Stripe charge for this intent.
 * Actions cannot read the database, so `publicCharge.beginFirstCharge` asks
 * here (the caller's identity propagates into the query). An intent created
 * by a signed-in user may only be paid from that account; a signed-out intent
 * is addressed by its unguessable id, like a guest cart token.
 */
export const getChargeStartAccess = internalQuery({
	args: {
		intentId: v.id("commerce_subscription_checkout_intents"),
	},
	returns: v.union(
		v.object({ allowed: v.literal(true) }),
		v.object({
			allowed: v.literal(false),
			reason: v.union(
				v.literal("not_found"),
				v.literal("not_owner"),
				v.literal("not_payable"),
			),
		}),
	),
	handler: async (ctx, args) => {
		const intent = await ctx.db.get(args.intentId);
		if (!intent) return { allowed: false as const, reason: "not_found" as const };
		if (intent.status !== "payment_pending" && intent.status !== "draft") {
			return { allowed: false as const, reason: "not_payable" as const };
		}
		if (intent.userId) {
			const user = await getCurrentUser(ctx);
			if (!user || user._id !== intent.userId || user.status !== "active") {
				return { allowed: false as const, reason: "not_owner" as const };
			}
		}
		return { allowed: true as const };
	},
});

// ─── First-charge confirmation access (public `confirmFirstCharge`) ────────

/**
 * What `publicCharge.confirmFirstCharge` needs to verify a Stripe object
 * against an intent, read with the caller's identity (actions cannot read the
 * database). An intent bound to an account may only be confirmed by that
 * account, signed in and active. A guest intent is addressed by its id; the
 * action then requires the Stripe client secret as proof of possession.
 */
export const getFirstChargeConfirmAccess = internalQuery({
	args: {
		checkoutIntentRef: v.string(),
	},
	returns: v.union(
		v.object({
			allowed: v.literal(false),
			reason: v.union(v.literal("not_found"), v.literal("not_owner")),
		}),
		v.object({
			allowed: v.literal(true),
			intentId: v.id("commerce_subscription_checkout_intents"),
			status: commerceSubscriptionCheckoutIntentStatusValidator,
			initialAmount: v.number(),
			currencyCode: v.string(),
			stripeCustomerId: v.optional(v.string()),
			paymentTransactionId: v.optional(v.string()),
			formSubmissionId: v.optional(v.id("form_submissions")),
		}),
	),
	handler: async (ctx, args) => {
		const intentId = ctx.db.normalizeId(
			"commerce_subscription_checkout_intents",
			args.checkoutIntentRef,
		);
		const intent = intentId ? await ctx.db.get(intentId) : null;
		if (!intent) return { allowed: false as const, reason: "not_found" as const };
		if (intent.userId) {
			const user = await getCurrentUser(ctx);
			if (!user || user._id !== intent.userId || user.status !== "active") {
				return { allowed: false as const, reason: "not_owner" as const };
			}
		}
		return {
			allowed: true as const,
			intentId: intent._id,
			status: intent.status,
			initialAmount: intent.initialAmount,
			currencyCode: intent.currencyCode,
			stripeCustomerId: intent.stripeCustomerId,
			paymentTransactionId: intent.paymentTransactionId,
			formSubmissionId: intentFormSubmissionId(ctx, intent),
		};
	},
});
