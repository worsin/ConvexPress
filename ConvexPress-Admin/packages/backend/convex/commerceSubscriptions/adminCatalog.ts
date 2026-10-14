/**
 * Commerce Subscriptions — the administrator's view of the catalog.
 *
 * What the offer, template and coupon screens read, with how each is in use,
 * so an editor knows its locks before a save is refused:
 *   - listOfferRows / getOfferEditor        offers with template, contracts,
 *                                           and the price fields locked while
 *                                           live contracts use the offer
 *   - listTemplateRows / getTemplateEditor  templates with their offers,
 *                                           contracts and retry schedule
 *   - listCouponRows / getCouponEditor      coupons with redemptions and the
 *                                           offers they apply to
 *
 * Everything requires `manage_options`. Writes stay in offers.ts,
 * mutations.ts (templates) and coupons.ts.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled } from "../helpers/plugins";
import {
	commerceSubscriptionOfferStatusValidator,
	commerceSubscriptionStatusValidator,
} from "../schema/commerceSubscriptions";
import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import { DEFAULT_DUNNING_POLICY, dunningPolicyFor } from "./lifecycle";

type ContractStatus = Doc<"commerce_subscriptions">["status"];

/** Contracts that still bill on the offer's price (see offers.ts, immutability). */
const PRICE_BOUND_STATUSES: ReadonlySet<ContractStatus> = new Set(["active", "trialing", "past_due", "paused"]);

/** Fields `updateOffer` refuses to change while live contracts use the offer. */
const PRICE_LOCKED_FIELDS = [
	"recurringAmount",
	"setupFeeAmount",
	"currencyCode",
	"templateId",
	"minimumQuantity",
	"maximumQuantity",
] as const;

const usageValidator = v.object({ liveContracts: v.number(), totalContracts: v.number() });
type Usage = { liveContracts: number; totalContracts: number };

async function adminGate(ctx: QueryCtx): Promise<boolean> {
	if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return false;
	await requireCommerceSubscriptionsEnabled(ctx);
	await requireCan(ctx, "manage_options");
	return true;
}

/** Distinct contracts with an item from this offer, and how many still bill on it. */
async function offerUsage(ctx: QueryCtx, offerId: Id<"commerce_subscription_offers">): Promise<Usage> {
	const items = await ctx.db
		.query("commerce_subscription_items")
		.withIndex("by_source_offer", (q) => q.eq("sourceOfferId", offerId))
		.collect();
	const contractIds = new Set(items.map((item) => item.subscriptionId));
	let liveContracts = 0;
	for (const contractId of contractIds) {
		const contract = await ctx.db.get(contractId);
		if (contract && PRICE_BOUND_STATUSES.has(contract.status)) liveContracts++;
	}
	return { liveContracts, totalContracts: contractIds.size };
}

const templateSummaryValidator = v.object({
	_id: v.id("commerce_subscription_templates"),
	title: v.string(),
	billingInterval: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
	billingIntervalCount: v.number(),
	trialDays: v.optional(v.number()),
	status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
});

function templateSummary(template: Doc<"commerce_subscription_templates">) {
	return {
		_id: template._id,
		title: template.title,
		billingInterval: template.billingInterval,
		billingIntervalCount: template.billingIntervalCount,
		trialDays: template.trialDays,
		status: template.status,
	};
}

// ─── Offers ─────────────────────────────────────────────────────────────────

const offerRowValidator = v.object({
	_id: v.id("commerce_subscription_offers"),
	title: v.string(),
	slug: v.string(),
	status: commerceSubscriptionOfferStatusValidator,
	currencyCode: v.string(),
	recurringAmount: v.number(),
	setupFeeAmount: v.optional(v.number()),
	trialDaysOverride: v.optional(v.number()),
	pricingCardVisible: v.optional(v.boolean()),
	availableInDirectForms: v.boolean(),
	availableInCart: v.boolean(),
	limitOnePerCustomer: v.optional(v.boolean()),
	entitlementCodes: v.array(v.string()),
	template: v.union(v.null(), templateSummaryValidator),
	usage: usageValidator,
	updatedAt: v.number(),
});

/** Offers, newest first, optionally one status, with template and contracts. */
export const listOfferRows = query({
	args: { status: v.optional(commerceSubscriptionOfferStatusValidator) },
	returns: v.array(offerRowValidator),
	handler: async (ctx, args) => {
		if (!(await adminGate(ctx))) return [];
		const status = args.status;
		const offers = status
			? await ctx.db
					.query("commerce_subscription_offers")
					.withIndex("by_status", (q) => q.eq("status", status))
					.order("desc")
					.collect()
			: await ctx.db.query("commerce_subscription_offers").order("desc").collect();
		const rows = [];
		for (const offer of offers) {
			const template = await ctx.db.get(offer.templateId);
			rows.push({
				_id: offer._id,
				title: offer.title,
				slug: offer.slug,
				status: offer.status,
				currencyCode: offer.currencyCode,
				recurringAmount: offer.recurringAmount,
				setupFeeAmount: offer.setupFeeAmount,
				trialDaysOverride: offer.trialDaysOverride,
				pricingCardVisible: offer.pricingCardVisible,
				availableInDirectForms: offer.availableInDirectForms,
				availableInCart: offer.availableInCart,
				limitOnePerCustomer: offer.limitOnePerCustomer,
				entitlementCodes: offer.entitlementCodes ?? [],
				template: template ? templateSummary(template) : null,
				usage: await offerUsage(ctx, offer._id),
				updatedAt: offer.updatedAt,
			});
		}
		return rows;
	},
});

/** One offer for editing: the offer, its template, its use, and what is locked. */
export const getOfferEditor = query({
	args: { offerId: v.id("commerce_subscription_offers") },
	returns: v.union(
		v.null(),
		v.object({
			offer: commerceSubscriptionsDocs.commerce_subscription_offers,
			template: v.union(v.null(), templateSummaryValidator),
			usage: usageValidator,
			lockedFields: v.array(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await adminGate(ctx))) return null;
		const offer = await ctx.db.get(args.offerId);
		if (!offer) return null;
		const template = await ctx.db.get(offer.templateId);
		const usage = await offerUsage(ctx, offer._id);
		return {
			offer,
			template: template ? templateSummary(template) : null,
			usage,
			lockedFields: usage.liveContracts > 0 ? [...PRICE_LOCKED_FIELDS] : [],
		};
	},
});

// ─── Templates ──────────────────────────────────────────────────────────────

const retryPolicyValidator = v.object({
	retryDays: v.array(v.number()),
	cancelAfterFinalFailure: v.boolean(),
	isDefault: v.boolean(),
});

function retryPolicyOf(template: Doc<"commerce_subscription_templates">) {
	const policy = dunningPolicyFor(template);
	return {
		retryDays: [...policy.retryIntervalsDays],
		cancelAfterFinalFailure: policy.cancelAfterFinalFailure,
		isDefault: template.dunningRetryDays === undefined && template.cancelAfterFinalFailure === undefined,
	};
}

async function templateOffers(ctx: QueryCtx, templateId: Id<"commerce_subscription_templates">) {
	return ctx.db
		.query("commerce_subscription_offers")
		.withIndex("by_template", (q) => q.eq("templateId", templateId))
		.collect();
}

const templateRowValidator = v.object({
	_id: v.id("commerce_subscription_templates"),
	title: v.string(),
	slug: v.string(),
	version: v.number(),
	status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
	billingInterval: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
	billingIntervalCount: v.number(),
	trialDays: v.optional(v.number()),
	gracePeriodDays: v.number(),
	pausable: v.boolean(),
	cancelAtPeriodEndDefault: v.boolean(),
	retryPolicy: retryPolicyValidator,
	offerCount: v.number(),
	usage: usageValidator,
	updatedAt: v.number(),
});

/** Templates, newest first, optionally one status, with their offers and contracts. */
export const listTemplateRows = query({
	args: { status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("archived"))) },
	returns: v.array(templateRowValidator),
	handler: async (ctx, args) => {
		if (!(await adminGate(ctx))) return [];
		const status = args.status;
		const templates = status
			? await ctx.db
					.query("commerce_subscription_templates")
					.withIndex("by_status", (q) => q.eq("status", status))
					.order("desc")
					.collect()
			: await ctx.db.query("commerce_subscription_templates").order("desc").collect();
		const rows = [];
		for (const template of templates) {
			const offers = await templateOffers(ctx, template._id);
			const usage: Usage = { liveContracts: 0, totalContracts: 0 };
			for (const offer of offers) {
				const offerUse = await offerUsage(ctx, offer._id);
				usage.liveContracts += offerUse.liveContracts;
				usage.totalContracts += offerUse.totalContracts;
			}
			rows.push({
				_id: template._id,
				title: template.title,
				slug: template.slug,
				version: template.version,
				status: template.status,
				billingInterval: template.billingInterval,
				billingIntervalCount: template.billingIntervalCount,
				trialDays: template.trialDays,
				gracePeriodDays: template.gracePeriodDays ?? 3,
				pausable: template.pausable,
				cancelAtPeriodEndDefault: template.cancelAtPeriodEndDefault,
				retryPolicy: retryPolicyOf(template),
				offerCount: offers.length,
				usage,
				updatedAt: template.updatedAt,
			});
		}
		return rows;
	},
});

/** One template for editing, with the offers sold on it and the default retry schedule. */
export const getTemplateEditor = query({
	args: { templateId: v.id("commerce_subscription_templates") },
	returns: v.union(
		v.null(),
		v.object({
			template: commerceSubscriptionsDocs.commerce_subscription_templates,
			retryPolicy: retryPolicyValidator,
			defaultRetryDays: v.array(v.number()),
			offers: v.array(
				v.object({
					_id: v.id("commerce_subscription_offers"),
					title: v.string(),
					status: commerceSubscriptionOfferStatusValidator,
					usage: usageValidator,
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await adminGate(ctx))) return null;
		const template = await ctx.db.get(args.templateId);
		if (!template) return null;
		const offers = [];
		for (const offer of await templateOffers(ctx, template._id)) {
			offers.push({ _id: offer._id, title: offer.title, status: offer.status, usage: await offerUsage(ctx, offer._id) });
		}
		return {
			template,
			retryPolicy: retryPolicyOf(template),
			defaultRetryDays: [...DEFAULT_DUNNING_POLICY.retryIntervalsDays],
			offers,
		};
	},
});

// ─── Coupons ────────────────────────────────────────────────────────────────

const couponRowValidator = v.object({
	_id: v.id("commerce_subscription_coupons"),
	code: v.string(),
	discountType: v.union(v.literal("percent"), v.literal("fixed")),
	amount: v.number(),
	duration: v.union(v.literal("once"), v.literal("forever"), v.literal("n_months")),
	durationMonths: v.optional(v.number()),
	maxRedemptions: v.optional(v.number()),
	perCustomerLimit: v.optional(v.number()),
	startsAt: v.optional(v.number()),
	expiresAt: v.optional(v.number()),
	status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
	redemptions: v.number(),
	offers: v.array(v.object({ _id: v.id("commerce_subscription_offers"), title: v.string(), currencyCode: v.string() })),
	createdAt: v.number(),
});

async function couponRow(ctx: QueryCtx, coupon: Doc<"commerce_subscription_coupons">) {
	const redemptions = await ctx.db
		.query("commerce_subscription_coupon_redemptions")
		.withIndex("by_coupon", (q) => q.eq("couponId", coupon._id))
		.collect();
	const offers = [];
	for (const offerId of coupon.offerIds ?? []) {
		const offer = await ctx.db.get(offerId);
		if (offer) offers.push({ _id: offer._id, title: offer.title, currencyCode: offer.currencyCode });
	}
	return {
		_id: coupon._id,
		code: coupon.code,
		discountType: coupon.discountType,
		amount: coupon.amount,
		duration: coupon.duration,
		durationMonths: coupon.durationMonths,
		maxRedemptions: coupon.maxRedemptions,
		perCustomerLimit: coupon.perCustomerLimit,
		startsAt: coupon.startsAt,
		expiresAt: coupon.expiresAt,
		status: coupon.status,
		redemptions: redemptions.length,
		offers,
		createdAt: coupon.createdAt,
	};
}

/** Coupons, newest first, optionally one status, with redemptions and offers. */
export const listCouponRows = query({
	args: { status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("archived"))) },
	returns: v.array(couponRowValidator),
	handler: async (ctx, args) => {
		if (!(await adminGate(ctx))) return [];
		const status = args.status;
		const coupons = status
			? await ctx.db
					.query("commerce_subscription_coupons")
					.withIndex("by_status", (q) => q.eq("status", status))
					.order("desc")
					.collect()
			: await ctx.db.query("commerce_subscription_coupons").order("desc").collect();
		const rows = [];
		for (const coupon of coupons) rows.push(await couponRow(ctx, coupon));
		return rows;
	},
});

/** One coupon for editing, with its redemptions and the contracts that used it. */
export const getCouponEditor = query({
	args: { couponId: v.id("commerce_subscription_coupons") },
	returns: v.union(
		v.null(),
		couponRowValidator.extend({
			offerIds: v.array(v.id("commerce_subscription_offers")),
			recentRedemptions: v.array(
				v.object({
					contractId: v.id("commerce_subscriptions"),
					contractStatus: v.optional(commerceSubscriptionStatusValidator),
					customerEmail: v.optional(v.string()),
					redeemedAt: v.number(),
					remainingApplications: v.number(),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await adminGate(ctx))) return null;
		const coupon = await ctx.db.get(args.couponId);
		if (!coupon) return null;
		const redemptions = await ctx.db
			.query("commerce_subscription_coupon_redemptions")
			.withIndex("by_coupon", (q) => q.eq("couponId", coupon._id))
			.order("desc")
			.take(20);
		const recentRedemptions = [];
		for (const redemption of redemptions) {
			const contract = await ctx.db.get(redemption.contractId);
			const customer = await ctx.db.get(redemption.customerId);
			recentRedemptions.push({
				contractId: redemption.contractId,
				contractStatus: contract?.status,
				customerEmail: customer?.email,
				redeemedAt: redemption.redeemedAt,
				remainingApplications: redemption.remainingApplications,
			});
		}
		return { ...(await couponRow(ctx, coupon)), offerIds: coupon.offerIds ?? [], recentRedemptions };
	},
});
