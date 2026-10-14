/**
 * Commerce Subscriptions — Customer Portal (Wave 5 Task 5.2)
 *
 * Public, user-facing surface that the website's customer subscription
 * dashboard binds to. Every export enforces "current user owns this
 * contract" — admin staff use the admin-side `mutations.ts` + `queries.ts`
 * paths instead.
 *
 * Exports:
 *   Queries:
 *     - getMyActiveContracts   My contracts with offer, scheduled change, latest
 *                              invoice, card on file, billing issue and the
 *                              actions available (no provider identifiers).
 *     - previewPlanChange      Proration preview for an upgrade/downgrade.
 *     - listMyInvoices         My invoices across all contracts.
 *
 *   Mutations:
 *     - requestPauseContract      Pause (good standing, pausable plans only).
 *     - requestResumeContract     Resume a paused contract.
 *     - requestCancelContract     Schedule cancellation at period end, or
 *                                 cancel now (the option for past_due).
 *     - requestKeepContract       Undo a scheduled cancellation.
 *     - requestPlanChange         Upgrade (prorated) or schedule a downgrade.
 *     - applyCouponToMyContract   Validate + seed a redemption row on ME.
 *
 *   Actions:
 *     - getInvoicePdf   Return a generated PDF invoice document.
 *     (Card changes: `paymentMethods.ts`.)
 *
 * Every export enforces "current user owns this contract". The actions a
 * customer may take are computed once (`contractActions`), returned to the
 * page and enforced by the mutations, and every status change goes through
 * `lifecycle.transitionSubscription`. A customer can never walk a past_due,
 * cancelled or expired contract back to `active` without paying.
 */

import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../helpers/auth";
import { initializeRedemption, validateCoupon } from "../helpers/coupons";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { computeProration } from "../helpers/proration";
import { readMergedSettingsSection } from "../settings/read";
import {
	commerceSubscriptionEntitlementStatusValidator,
	commerceSubscriptionInvoiceStatusValidator,
	commerceSubscriptionStatusValidator,
} from "../schema/commerceSubscriptions";
import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
import { membershipDocs } from "../schema/membership.docs.generated";
import { isOfferOpenToCustomers, requireCommerceSubscriptionsEnabled } from "./helpers";
import {
	createCorrelationId,
	isEnded,
	resolveLifecycleTerms,
	transitionSubscription,
	writeHistory,
	type SubscriptionDoc,
} from "./lifecycle";

// ─── Local helpers ──────────────────────────────────────────────────────────

const prorationResultValidator = v.object({
	daysRemaining: v.number(),
	daysInCycle: v.number(),
	unusedOldAmount: v.number(),
	proratedNewAmount: v.number(),
	netCharge: v.number(),
});

function formatMoney(amount: number, currencyCode = "USD"): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currencyCode,
	}).format((amount ?? 0) / 100);
}

function sanitizePdfText(value: unknown): string {
	return String(value ?? "")
		.normalize("NFKD")
		.replace(/[^\x20-\x7E]/g, "")
		.replace(/\\/g, "\\\\")
		.replace(/\(/g, "\\(")
		.replace(/\)/g, "\\)");
}

function buildSimplePdf(lines: string[]): string {
	const pages: string[][] = [];
	for (let i = 0; i < lines.length; i += 42) {
		pages.push(lines.slice(i, i + 42));
	}
	if (pages.length === 0) pages.push(["Invoice"]);

	const objects: string[] = [];
	const addObject = (content: string) => {
		objects.push(content);
		return objects.length;
	};

	const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
	const pagesId = addObject("PAGES_PLACEHOLDER");
	const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
	const pageIds: number[] = [];

	for (const pageLines of pages) {
		const commands = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL"];
		for (const line of pageLines) {
			commands.push(`(${sanitizePdfText(line)}) Tj`, "T*");
		}
		commands.push("ET");
		const stream = commands.join("\n");
		const contentId = addObject(
			`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
		);
		const pageId = addObject(
			`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
		);
		pageIds.push(pageId);
	}

	objects[pagesId - 1] =
		`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

	let pdf = "%PDF-1.4\n";
	const offsets = [0];
	objects.forEach((content, index) => {
		offsets.push(pdf.length);
		pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
	});
	const xrefOffset = pdf.length;
	pdf += `xref\n0 ${objects.length + 1}\n`;
	pdf += "0000000000 65535 f \n";
	for (let i = 1; i < offsets.length; i++) {
		pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
	return pdf;
}

/**
 * Load the current user and resolve the target contract. Throws:
 *   - `UNAUTHORIZED`  — no authenticated user
 *   - `NOT_FOUND`     — contractId does not exist
 *   - `FORBIDDEN`     — current user is not the contract owner
 *
 * Portal endpoints are customer-only — admin actions do NOT go through here.
 * Admins should call the admin-side `mutations.ts` paths directly.
 */
async function requireOwnedContract(
	ctx: QueryCtx | MutationCtx,
	contractId: Id<"commerce_subscriptions">,
): Promise<{ user: { _id: Id<"users"> }; contract: Doc<"commerce_subscriptions"> }> {
	const user = await getCurrentUser(ctx);
	if (!user) {
		throw new ConvexError({
			code: "UNAUTHORIZED",
			message: "Authentication required.",
		});
	}

	const contract = await ctx.db.get(contractId);
	if (!contract) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Subscription not found.",
		});
	}

	if (contract.userId !== user._id) {
		throw new ConvexError({
			code: "FORBIDDEN",
			message: "You do not have access to this subscription.",
		});
	}

	return { user, contract };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Public, unauthenticated read of a single offer by id.
 *
 * The admin-side `offers.getOffer` requires the `manage_options` capability,
 * which is correct for back-office staff but too strict for direct signup —
 * the `/signup/$offerId` landing page must load before the user has
 * authenticated. This wrapper performs the same read with NO capability
 * check and filters out archived offers (returns null).
 *
 * Only offer fields safe to expose publicly are returned — no `metadata`,
 * no product cost breakdown, no audit fields beyond the basics.
 */
export const getPublicOffer = query({
	args: {
		offerId: v.id("commerce_subscription_offers"),
	},
	returns: v.union(v.null(), v.object({
   _id: v.id("commerce_subscription_offers"),
   title: v.string(),
   slug: v.string(),
   description: v.optional(v.string()),
   publicSummary: v.optional(v.string()),
   status: v.union(v.literal("draft"), v.literal("active")),
   currencyCode: v.string(),
   recurringAmount: v.number(),
   setupFeeAmount: v.optional(v.number()),
   trialDaysOverride: v.optional(v.number()),
   entitlementCodes: v.optional(v.array(v.string())),
   features: v.optional(v.array(v.object({ icon: v.optional(v.string()), highlighted: v.optional(v.boolean()), text: v.string() }))),
   template: v.union(v.null(), v.object({
     _id: v.id("commerce_subscription_templates"),
     billingInterval: v.union(v.literal("year"), v.literal("month"), v.literal("day"), v.literal("week")),
     billingIntervalCount: v.number(),
     trialDays: v.optional(v.number()),
     gracePeriodDays: v.optional(v.number()),
   })),
 })),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
		// Do NOT call requireCommerceSubscriptionsEnabled — that throws ConvexError.
		// Instead just gate via plugin flag and return null on disable.

		const offer = await ctx.db.get(args.offerId);
		if (!offer) return null;
		if (offer.status === "archived") return null;

		// Resolve the template to surface billing interval/count/trial — callers
		// need this to render "$49/mo" on the landing page without a second
		// query. Template data is safe to expose (it's the same data the
		// admin-side pricing card publishes).
		const template = offer.templateId
			? await ctx.db.get(offer.templateId)
			: null;

		return {
			_id: offer._id,
			title: offer.title,
			slug: offer.slug,
			description: offer.description,
			publicSummary: offer.publicSummary,
			status: offer.status,
			currencyCode: offer.currencyCode,
			recurringAmount: offer.recurringAmount,
			setupFeeAmount: offer.setupFeeAmount,
			trialDaysOverride: offer.trialDaysOverride,
			entitlementCodes: offer.entitlementCodes,
			features: offer.features,
			template: template
				? {
						_id: template._id,
						billingInterval: template.billingInterval,
						billingIntervalCount: template.billingIntervalCount,
						trialDays: template.trialDays,
						gracePeriodDays: template.gracePeriodDays,
					}
				: null,
		};
	},
});

/**
 * What the customer may do with a contract right now. Computed here so the
 * website shows exactly the actions the mutations below accept.
 */
const contractActionsValidator = v.object({
	pause: v.boolean(),
	resume: v.boolean(),
	scheduleCancel: v.boolean(),
	cancelNow: v.boolean(),
	keep: v.boolean(),
	changePlan: v.boolean(),
	updatePaymentMethod: v.boolean(),
	applyCoupon: v.boolean(),
});
type ContractActions = Infer<typeof contractActionsValidator>;

function contractActions(contract: SubscriptionDoc, pausable: boolean, now: number): ContractActions {
	const status = contract.status;
	const inGoodStanding = status === "active" || status === "trialing";
	const periodRunning = contract.currentPeriodEndAt !== undefined && contract.currentPeriodEndAt > now;
	return {
		pause: inGoodStanding && pausable,
		resume: status === "paused",
		scheduleCancel: inGoodStanding || status === "paused",
		cancelNow: status === "past_due",
		keep: status === "pending_cancel" && periodRunning,
		changePlan: inGoodStanding,
		updatePaymentMethod: !isEnded(status) && !contract.manualBilling,
		applyCoupon: !isEnded(status),
	};
}

const paymentMethodSummaryValidator = v.object({
	brand: v.string(),
	last4: v.string(),
	expMonth: v.number(),
	expYear: v.number(),
});

/** A past_due contract's recovery state: when access ends and the next retry. */
const billingIssueValidator = v.object({
	failedAttempts: v.number(),
	lastFailureReason: v.optional(v.string()),
	nextRetryAt: v.optional(v.number()),
	accessEndsAt: v.optional(v.number()),
	amountDue: v.number(),
	currencyCode: v.string(),
});

const customerContractValidator = v.object({
	_id: v.id("commerce_subscriptions"),
	status: commerceSubscriptionStatusValidator,
	currencyCode: v.string(),
	recurringAmount: v.number(),
	billingInterval: commerceSubscriptionsDocs.commerce_subscriptions.fields.billingInterval,
	billingIntervalCount: v.optional(v.number()),
	currentPeriodStartAt: v.optional(v.number()),
	currentPeriodEndAt: v.optional(v.number()),
	nextBillingAt: v.optional(v.number()),
	nextChargeAt: v.optional(v.number()),
	trialEndsAt: v.optional(v.number()),
	cancelAtPeriodEnd: v.optional(v.boolean()),
	pausedAt: v.optional(v.number()),
	createdAt: v.number(),
	offer: v.union(
		v.null(),
		v.object({
			_id: v.id("commerce_subscription_offers"),
			title: v.string(),
			slug: v.string(),
			recurringAmount: v.number(),
			currencyCode: v.string(),
			features: commerceSubscriptionsDocs.commerce_subscription_offers.fields.features,
		}),
	),
	scheduledOffer: v.union(
		v.null(),
		v.object({
			_id: v.id("commerce_subscription_offers"),
			title: v.string(),
			recurringAmount: v.number(),
			effectiveAt: v.number(),
		}),
	),
	product: v.union(
		v.null(),
		v.object({
			_id: v.id("commerce_products"),
			title: v.string(),
			slug: v.string(),
		}),
	),
	currentInvoice: v.union(
		v.null(),
		v.object({
			_id: v.id("commerce_subscription_invoices"),
			invoiceNumber: v.optional(v.string()),
			status: commerceSubscriptionInvoiceStatusValidator,
			totalAmount: v.number(),
			currencyCode: v.string(),
			dueAt: v.optional(v.number()),
			paidAt: v.optional(v.number()),
			createdAt: v.number(),
		}),
	),
	paymentMethod: v.union(v.null(), paymentMethodSummaryValidator),
	billingIssue: v.union(v.null(), billingIssueValidator),
	actions: contractActionsValidator,
	membershipGrants: v.array(
		v.object({
			_id: v.id("membership_grants"),
			planId: v.id("membership_plans"),
			plan: v.union(
				v.null(),
				v.object({
					_id: v.id("membership_plans"),
					name: v.string(),
					slug: v.string(),
				}),
			),
			status: membershipDocs.membership_grants.fields.status,
			startsAt: v.number(),
			endsAt: v.optional(v.number()),
			graceEndsAt: v.optional(v.number()),
		}),
	),
	entitlements: v.array(
		v.object({
			_id: v.id("commerce_subscription_entitlements"),
			entitlementCode: v.string(),
			status: commerceSubscriptionEntitlementStatusValidator,
			graceEndsAt: v.optional(v.number()),
		}),
	),
});
type CustomerContract = Infer<typeof customerContractValidator>;

async function billingIssueFor(
	ctx: QueryCtx,
	contract: SubscriptionDoc,
	invoices: Array<Doc<"commerce_subscription_invoices">>,
	entitlements: Array<Doc<"commerce_subscription_entitlements">>,
): Promise<CustomerContract["billingIssue"]> {
	if (contract.status !== "past_due") return null;
	const unpaid = invoices
		.filter((invoice) => invoice.status === "failed" && invoice.prorationEventId === undefined)
		.sort((a, b) => b.createdAt - a.createdAt)[0];
	if (!unpaid) return null;
	const attempts = await ctx.db
		.query("commerce_subscription_dunning_attempts")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", unpaid._id))
		.collect();
	const failed = attempts.filter((attempt) => attempt.status === "failed").sort((a, b) => b.updatedAt - a.updatedAt);
	const next = attempts.find((attempt) => attempt.status === "scheduled");
	const graceEnds = entitlements
		.map((entitlement) => entitlement.graceEndsAt)
		.filter((value): value is number => value !== undefined);
	return {
		failedAttempts: failed.length,
		lastFailureReason: failed[0]?.errorMessage,
		nextRetryAt: next?.scheduledAt,
		accessEndsAt: graceEnds.length > 0 ? Math.max(...graceEnds) : undefined,
		amountDue: unpaid.totalAmount,
		currencyCode: unpaid.currencyCode,
	};
}

/** One contract as the account page shows it. */
async function buildCustomerContract(
	ctx: QueryCtx,
	contract: SubscriptionDoc,
	grantsByUser: Array<Doc<"membership_grants">>,
	now: number,
): Promise<CustomerContract> {
	const items = await ctx.db
		.query("commerce_subscription_items")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
		.collect();
	// An ended contract's items have ended with it; it still shows the plan it was on.
	const activeItem =
		items.find((item) => item.status === "active") ??
		items.find((item) => item.status === "pending_cancel") ??
		items[items.length - 1];
	const offer = activeItem?.sourceOfferId ? await ctx.db.get(activeItem.sourceOfferId) : null;
	const scheduledOffer = contract.scheduledOfferChange
		? await ctx.db.get(contract.scheduledOfferChange.toOfferId)
		: null;
	const product = contract.productId ? await ctx.db.get(contract.productId) : null;

	const invoices = await ctx.db
		.query("commerce_subscription_invoices")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
		.collect();
	const currentInvoice = invoices.slice().sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

	const entitlements = (
		await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
			.collect()
	).filter((entitlement) => entitlement.status === "active" || entitlement.status === "grace");

	const membershipGrants = grantsByUser.filter(
		(grant) => grant.sourceType === "subscription" && grant.sourceRef === contract._id,
	);
	const grantRows: CustomerContract["membershipGrants"] = [];
	for (const grant of membershipGrants) {
		const plan = await ctx.db.get(grant.planId);
		grantRows.push({
			_id: grant._id,
			planId: grant.planId,
			plan: plan ? { _id: plan._id, name: plan.title, slug: plan.slug } : null,
			status: grant.status,
			startsAt: grant.startsAt,
			endsAt: grant.endsAt,
			graceEndsAt: grant.graceEndsAt,
		});
	}

	const terms = await resolveLifecycleTerms(ctx, contract);
	return {
		_id: contract._id,
		status: contract.status,
		currencyCode: contract.currencyCode,
		recurringAmount: contract.recurringAmount,
		billingInterval: contract.billingInterval,
		billingIntervalCount: contract.billingIntervalCount,
		currentPeriodStartAt: contract.currentPeriodStartAt,
		currentPeriodEndAt: contract.currentPeriodEndAt,
		nextBillingAt: contract.nextBillingAt,
		nextChargeAt:
			contract.status === "active" || contract.status === "trialing"
				? (contract.nextBillingAt ?? contract.currentPeriodEndAt)
				: undefined,
		trialEndsAt: contract.trialEndsAt,
		cancelAtPeriodEnd: contract.cancelAtPeriodEnd,
		pausedAt: contract.pausedAt,
		createdAt: contract.createdAt,
		offer: offer
			? {
					_id: offer._id,
					title: offer.title,
					slug: offer.slug,
					recurringAmount: offer.recurringAmount,
					currencyCode: offer.currencyCode,
					features: offer.features,
				}
			: null,
		scheduledOffer:
			scheduledOffer && contract.scheduledOfferChange
				? {
						_id: scheduledOffer._id,
						title: scheduledOffer.title,
						recurringAmount: scheduledOffer.recurringAmount,
						effectiveAt: contract.scheduledOfferChange.effectiveAt,
					}
				: null,
		product: product ? { _id: product._id, title: product.title, slug: product.slug } : null,
		currentInvoice: currentInvoice
			? {
					_id: currentInvoice._id,
					invoiceNumber: currentInvoice.invoiceNumber,
					status: currentInvoice.status,
					totalAmount: currentInvoice.totalAmount,
					currencyCode: currentInvoice.currencyCode,
					dueAt: currentInvoice.dueAt,
					paidAt: currentInvoice.paidAt,
					createdAt: currentInvoice.createdAt,
				}
			: null,
		paymentMethod: contract.paymentMethodSummary ?? null,
		billingIssue: await billingIssueFor(ctx, contract, invoices, entitlements),
		actions: contractActions(contract, terms.pausable, now),
		membershipGrants: grantRows,
		entitlements: entitlements.map((entitlement) => ({
			_id: entitlement._id,
			entitlementCode: entitlement.entitlementCode,
			status: entitlement.status,
			graceEndsAt: entitlement.graceEndsAt,
		})),
	};
}

/**
 * My subscriptions, newest first, with what the account page needs: the
 * current offer and any scheduled change, the latest invoice, the card on file
 * (brand and last four only), a past_due contract's recovery state, and the
 * actions available. Provider identifiers never leave the backend.
 */
export const getMyActiveContracts = query({
	args: {},
	returns: v.array(customerContractValidator),
	handler: async (ctx): Promise<CustomerContract[]> => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) return [];
		const now = Date.now();

		const contracts = (
			await ctx.db
				.query("commerce_subscriptions")
				.withIndex("by_user", (q) => q.eq("userId", user._id))
				.collect()
		)
			.filter((contract) => !isEnded(contract.status))
			.sort((a, b) => b.createdAt - a.createdAt);

		const grantsByUser = await ctx.db
			.query("membership_grants")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		const results: CustomerContract[] = [];
		for (const contract of contracts) {
			results.push(await buildCustomerContract(ctx, contract, grantsByUser, now));
		}
		return results;
	},
});

const customerInvoiceValidator = v.object({
	_id: v.id("commerce_subscription_invoices"),
	invoiceNumber: v.optional(v.string()),
	status: commerceSubscriptionInvoiceStatusValidator,
	kind: v.union(v.literal("signup"), v.literal("renewal"), v.literal("plan_change")),
	currencyCode: v.string(),
	subtotalAmount: v.number(),
	taxAmount: v.number(),
	totalAmount: v.number(),
	periodStartAt: v.optional(v.number()),
	periodEndAt: v.optional(v.number()),
	dueAt: v.optional(v.number()),
	paidAt: v.optional(v.number()),
	/** Refunded to the customer's card (completed refunds only). */
	refundedAmount: v.number(),
	createdAt: v.number(),
	subscription: v.object({
		_id: v.id("commerce_subscriptions"),
		status: commerceSubscriptionStatusValidator,
	}),
});
type CustomerInvoice = Infer<typeof customerInvoiceValidator>;

function customerInvoice(invoice: Doc<"commerce_subscription_invoices">, contract: SubscriptionDoc): CustomerInvoice {
	return {
		_id: invoice._id,
		invoiceNumber: invoice.invoiceNumber,
		status: invoice.status,
		kind: invoice.kind ?? (invoice.prorationEventId ? "plan_change" : "renewal"),
		currencyCode: invoice.currencyCode,
		subtotalAmount: invoice.subtotalAmount,
		taxAmount: invoice.taxAmount,
		totalAmount: invoice.totalAmount,
		periodStartAt: invoice.periodStartAt,
		periodEndAt: invoice.periodEndAt,
		dueAt: invoice.dueAt,
		paidAt: invoice.paidAt,
		refundedAmount: (invoice.refunds ?? []).reduce((sum, refund) => (refund.status === "succeeded" ? sum + refund.amount : sum), 0),
		createdAt: invoice.createdAt,
		subscription: { _id: contract._id, status: contract.status },
	};
}

/** A history row as the customer sees it: what happened, in plain words. */
const timelineEntryValidator = v.object({
	_id: v.id("commerce_subscription_history"),
	eventType: v.string(),
	message: v.string(),
	createdAt: v.number(),
});
type TimelineEntry = Infer<typeof timelineEntryValidator>;

const STATUS_WORDS: Readonly<Record<SubscriptionDoc["status"], string>> = {
	draft: "Created",
	trialing: "Trial started",
	active: "Active",
	past_due: "Payment past due",
	paused: "Paused",
	pending_cancel: "Cancellation scheduled for the end of the period",
	cancelled: "Cancelled",
	expired: "Ended",
};

function metadataString(metadata: unknown, key: string): string | undefined {
	if (typeof metadata !== "object" || metadata === null) return undefined;
	const value: unknown = Reflect.get(metadata, key);
	return typeof value === "string" ? value : undefined;
}

function isSubscriptionStatus(value: string | undefined): value is SubscriptionDoc["status"] {
	return value !== undefined && Object.prototype.hasOwnProperty.call(STATUS_WORDS, value);
}

/**
 * Customer-facing wording for the history rows a customer should see. Internal
 * rows (bridge failures, billing closure, coupon bookkeeping) are left out.
 */
function timelineEntry(row: Doc<"commerce_subscription_history">): TimelineEntry | null {
	const entry = (eventType: string, message: string): TimelineEntry => ({
		_id: row._id,
		eventType,
		message,
		createdAt: row.createdAt,
	});
	switch (row.eventType) {
		case "subscription.created_from_intent":
			return entry("started", "Subscription started");
		case "subscription.renewed":
			return entry("renewed", "Payment received; subscription renewed");
		case "subscription.payment_failed":
			return entry("payment_failed", "A payment did not go through");
		case "subscription.payment_method_updated":
			return entry("card_updated", "Card on file updated");
		case "subscription.upgraded_via_proration":
			return entry("plan_changed", "Plan upgraded");
		case "subscription.scheduled_offer_change_applied":
			return entry("plan_changed", "Plan changed at renewal");
		case "subscription.downgrade_scheduled":
			return entry("plan_change_scheduled", "Plan change scheduled for the end of the period");
		case "subscription.coupon_applied":
			return entry("coupon_applied", "Coupon applied");
		case "subscription.entitlement_expired":
			return entry("access_paused", "Access paused: the grace period ended");
		case "subscription.status_changed": {
			const toStatus = metadataString(row.metadata, "toStatus");
			return isSubscriptionStatus(toStatus) ? entry(`status_${toStatus}`, STATUS_WORDS[toStatus]) : null;
		}
		default:
			return null;
	}
}

/**
 * One of my contracts for its detail page: the account-page summary plus its
 * invoices and a plain-words timeline. Null when it is not mine (or unknown).
 */
export const getMyContract = query({
	args: { contractId: v.id("commerce_subscriptions") },
	returns: v.union(
		v.null(),
		customerContractValidator.extend({
			invoices: v.array(customerInvoiceValidator),
			history: v.array(timelineEntryValidator),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
		await requireCommerceSubscriptionsEnabled(ctx);
		const user = await getCurrentUser(ctx);
		if (!user) return null;
		const contract = await ctx.db.get(args.contractId);
		if (!contract || contract.userId !== user._id) return null;

		const grantsByUser = await ctx.db
			.query("membership_grants")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();
		const summary = await buildCustomerContract(ctx, contract, grantsByUser, Date.now());
		const invoices = (
			await ctx.db
				.query("commerce_subscription_invoices")
				.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
				.collect()
		)
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((invoice) => customerInvoice(invoice, contract));
		const history = (
			await ctx.db
				.query("commerce_subscription_history")
				.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
				.order("desc")
				.take(100)
		)
			.map(timelineEntry)
			.filter((row): row is TimelineEntry => row !== null)
			.slice(0, 25);
		return { ...summary, invoices, history };
	},
});

/**
 * Proration preview for moving a specific contract to a new offer. Wraps
 * `helpers/proration.computeProration` with ownership enforcement. Read-only.
 *
 * Returns `null` for any failure mode (no user, contract not found, not
 * owned, missing offer). The portal UI should treat `null` as "cannot preview"
 * rather than showing an error — the plan-change button is then disabled.
 */
export const previewPlanChange = query({
	args: {
		contractId: v.id("commerce_subscriptions"),
		toOfferId: v.id("commerce_subscription_offers"),
	},
	returns: v.union(v.null(), v.object({
   daysRemaining: v.number(),
   daysInCycle: v.number(),
   unusedOldAmount: v.number(),
   proratedNewAmount: v.number(),
   netCharge: v.number(),
   isUpgrade: v.boolean(),
   effectiveAt: v.number(),
   currencyCode: v.string(),
   fromOfferTitle: v.string(),
   toOfferTitle: v.string(),
   isNoOp: v.boolean(),
 })),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) return null;

		const contract = await ctx.db.get(args.contractId);
		if (!contract) return null;
		if (contract.userId !== user._id) return null;

		// Current offer via the active item.
		const items = await ctx.db
			.query("commerce_subscription_items")
			.withIndex("by_subscription", (q) =>
				q.eq("subscriptionId", args.contractId),
			)
			.collect();
		const activeItem = items.find(
			(it) => it.status === "active" || it.status === "pending_cancel",
		);
		if (!activeItem || !activeItem.sourceOfferId) return null;

		const fromOffer = await ctx.db.get(activeItem.sourceOfferId);
		const toOffer = await ctx.db.get(args.toOfferId);
		if (!fromOffer || !toOffer) return null;

		// Reject no-op preview — the caller should hide the button for this.
		if (fromOffer._id === toOffer._id) {
			return {
				daysRemaining: 0,
				daysInCycle: 1,
				unusedOldAmount: 0,
				proratedNewAmount: 0,
				netCharge: 0,
				isUpgrade: false,
				effectiveAt: Date.now(),
				currencyCode: toOffer.currencyCode ?? contract.currencyCode ?? "USD",
				fromOfferTitle: fromOffer.title,
				toOfferTitle: toOffer.title,
				isNoOp: true,
			};
		}

		const cycleStart =
			contract.currentPeriodStartAt ?? contract.createdAt ?? Date.now();
		const cycleEnd =
			contract.currentPeriodEndAt ?? cycleStart + 30 * 24 * 60 * 60 * 1000;
		const now = Date.now();

		const result = computeProration({
			cycleStart,
			cycleEnd,
			now,
			oldOfferPrice: fromOffer.recurringAmount ?? 0,
			newOfferPrice: toOffer.recurringAmount ?? 0,
		});

		const isUpgrade = result.netCharge > 0;
		const effectiveAt = isUpgrade ? now : cycleEnd;

		return {
			...result,
			isUpgrade,
			effectiveAt,
			currencyCode: toOffer.currencyCode ?? contract.currencyCode ?? "USD",
			fromOfferTitle: fromOffer.title,
			toOfferTitle: toOffer.title,
			isNoOp: false,
		};
	},
});

/**
 * My invoices across all my contracts, newest first: what each charged, for
 * which period, and whether it is paid. Provider identifiers are not returned.
 */
export const listMyInvoices = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(customerInvoiceValidator),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) return [];
		const limit = args.limit ?? 100;

		const contracts = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		const rows: CustomerInvoice[] = [];
		for (const contract of contracts) {
			const invoices = await ctx.db
				.query("commerce_subscription_invoices")
				.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
				.collect();
			for (const invoice of invoices) rows.push(customerInvoice(invoice, contract));
		}
		rows.sort((a, b) => b.createdAt - a.createdAt);
		return rows.slice(0, limit);
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS — PAUSE / RESUME / CANCEL / KEEP
// ═══════════════════════════════════════════════════════════════════════════
//
// The customer's own lifecycle actions. Each is checked against the same
// `contractActions` the account page renders from, then moved through the
// shared lifecycle (`lifecycle.transitionSubscription`), so entitlements,
// billing closure, history and lifecycle events behave exactly as they do for
// admin and billing transitions. History rows carry `subscription.portal_*`
// event types so audit trails show the customer acted.

function requireAction(allowed: boolean, contract: SubscriptionDoc, action: string): void {
	if (allowed) return;
	throw new ConvexError({
		code: "INVALID_STATE",
		message: `You cannot ${action} a subscription that is ${contract.status.replace("_", " ")}.`,
		currentStatus: contract.status,
	});
}

/** Pause a contract in good standing, when its plan allows pausing. */
export const requestPauseContract = mutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
		reason: v.optional(v.string()),
	},
	returns: v.union(
		v.object({ ok: v.boolean(), alreadyPaused: v.boolean() }),
		v.object({ ok: v.boolean(), status: v.literal("paused") }),
	),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		const { user, contract } = await requireOwnedContract(ctx, args.contractId);
		if (contract.status === "paused") return { ok: true, alreadyPaused: true };

		const terms = await resolveLifecycleTerms(ctx, contract);
		if (!terms.pausable && (contract.status === "active" || contract.status === "trialing")) {
			throw new ConvexError({ code: "NOT_PAUSABLE", message: "This plan cannot be paused." });
		}
		requireAction(contractActions(contract, terms.pausable, Date.now()).pause, contract, "pause");

		const correlationId = createCorrelationId();
		await transitionSubscription(ctx, {
			subscription: contract,
			toStatus: "paused",
			reason: args.reason ?? "customer_request",
			actorUserId: user._id,
			correlationId,
			patch: { pausedAt: Date.now() },
		});
		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: "subscription.portal_pause",
			actorUserId: user._id,
			fromStatus: contract.status,
			toStatus: "paused",
			reason: args.reason,
			correlationId,
		});
		return { ok: true, status: "paused" as const };
	},
});

/**
 * Resume a paused contract. A paid period that ended while paused is not
 * granted again for free: the renewal falls due now and the renewal sweep
 * charges it before a new period starts.
 */
export const requestResumeContract = mutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
	},
	returns: v.object({
		ok: v.boolean(),
		status: v.literal("active"),
		nextBillingAt: v.optional(v.number()),
	}),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		const { user, contract } = await requireOwnedContract(ctx, args.contractId);
		const now = Date.now();
		const terms = await resolveLifecycleTerms(ctx, contract);
		requireAction(contractActions(contract, terms.pausable, now).resume, contract, "resume");

		const nextBillingAt =
			contract.currentPeriodEndAt !== undefined && contract.currentPeriodEndAt > now ? contract.currentPeriodEndAt : now;
		const correlationId = createCorrelationId();
		await transitionSubscription(ctx, {
			subscription: contract,
			toStatus: "active",
			reason: "customer_resume",
			actorUserId: user._id,
			correlationId,
			patch: {
				pausedAt: undefined,
				cancelAtPeriodEnd: false,
				cancelScheduledAt: undefined,
				nextBillingAt,
				currentPeriodEndAt: nextBillingAt,
			},
		});
		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: "subscription.portal_resume",
			actorUserId: user._id,
			fromStatus: contract.status,
			toStatus: "active",
			correlationId,
		});
		return { ok: true, status: "active" as const, nextBillingAt };
	},
});

/**
 * Cancel. By default the cancellation is scheduled for the end of the paid
 * period (access continues until then). `immediate: true` ends the contract
 * now; it is the only option for a past_due contract, whose unpaid invoice is
 * voided and retries stopped so nothing further is charged.
 */
export const requestCancelContract = mutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
		immediate: v.optional(v.boolean()),
		reason: v.optional(v.string()),
	},
	returns: v.union(
		v.object({ ok: v.boolean(), alreadyCancelled: v.boolean() }),
		v.object({
			ok: v.boolean(),
			status: v.literal("cancelled"),
			immediate: v.boolean(),
		}),
		v.object({
			ok: v.boolean(),
			status: v.literal("pending_cancel"),
			immediate: v.boolean(),
			effectiveAt: v.optional(v.number()),
		}),
	),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		const { user, contract } = await requireOwnedContract(ctx, args.contractId);
		if (contract.status === "cancelled") return { ok: true, alreadyCancelled: true };
		const now = Date.now();
		const terms = await resolveLifecycleTerms(ctx, contract);
		const actions = contractActions(contract, terms.pausable, now);
		const correlationId = createCorrelationId();

		if (args.immediate === true) {
			requireAction(actions.cancelNow || actions.scheduleCancel || contract.status === "pending_cancel", contract, "cancel");
			await transitionSubscription(ctx, {
				subscription: contract,
				toStatus: "cancelled",
				reason: args.reason ?? "customer_cancel_now",
				actorUserId: user._id,
				correlationId,
				patch: { cancelAtPeriodEnd: false },
			});
			await writeHistory(ctx, {
				subscriptionId: contract._id,
				eventType: "subscription.portal_cancel_now",
				actorUserId: user._id,
				fromStatus: contract.status,
				toStatus: "cancelled",
				reason: args.reason,
				correlationId,
			});
			return { ok: true, status: "cancelled" as const, immediate: true };
		}

		if (contract.status === "pending_cancel") {
			return { ok: true, status: "pending_cancel" as const, immediate: false, effectiveAt: contract.currentPeriodEndAt };
		}
		requireAction(actions.scheduleCancel, contract, "schedule the cancellation of");
		await transitionSubscription(ctx, {
			subscription: contract,
			toStatus: "pending_cancel",
			reason: args.reason ?? "customer_cancel_scheduled",
			actorUserId: user._id,
			correlationId,
			patch: { cancelAtPeriodEnd: true, cancelScheduledAt: now },
			eventData: { effectiveAt: contract.currentPeriodEndAt },
		});
		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: "subscription.portal_cancel_scheduled",
			actorUserId: user._id,
			fromStatus: contract.status,
			toStatus: "pending_cancel",
			reason: args.reason,
			correlationId,
		});
		return { ok: true, status: "pending_cancel" as const, immediate: false, effectiveAt: contract.currentPeriodEndAt };
	},
});

/**
 * Keep a subscription whose cancellation is scheduled: it returns to active
 * and renews as normal at the end of the current period.
 */
export const requestKeepContract = mutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
	},
	returns: v.object({ ok: v.boolean(), status: v.literal("active"), nextBillingAt: v.optional(v.number()) }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		const { user, contract } = await requireOwnedContract(ctx, args.contractId);
		const terms = await resolveLifecycleTerms(ctx, contract);
		requireAction(contractActions(contract, terms.pausable, Date.now()).keep, contract, "keep");

		const correlationId = createCorrelationId();
		const updated = await transitionSubscription(ctx, {
			subscription: contract,
			toStatus: "active",
			reason: "customer_kept_subscription",
			actorUserId: user._id,
			correlationId,
			patch: { cancelAtPeriodEnd: false, cancelScheduledAt: undefined },
		});
		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: "subscription.portal_keep",
			actorUserId: user._id,
			fromStatus: contract.status,
			toStatus: "active",
			correlationId,
		});
		return { ok: true, status: "active" as const, nextBillingAt: updated.nextBillingAt };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT METHOD — SUPPORT FOR paymentMethods.ts (actions)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The contract a signed-in customer is changing the card on, with what the
 * payment-method actions need. Throws for anyone but the owner, or a contract
 * whose card cannot be changed.
 */
export const getContractForPaymentMethodUpdate = internalQuery({
	args: { contractId: v.id("commerce_subscriptions") },
	returns: v.object({
		contractId: v.id("commerce_subscriptions"),
		stripeCustomerId: v.optional(v.string()),
		email: v.optional(v.string()),
		publishableKey: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const { user, contract } = await requireOwnedContract(ctx, args.contractId);
		const terms = await resolveLifecycleTerms(ctx, contract);
		requireAction(contractActions(contract, terms.pausable, Date.now()).updatePaymentMethod, contract, "update the card on");
		const payments = await readMergedSettingsSection(ctx, "commerce.payments");
		const account = await ctx.db.get(user._id);
		return {
			contractId: contract._id,
			stripeCustomerId: contract.stripeCustomerId,
			email: account?.email,
			publishableKey: typeof payments.stripePublishableKey === "string" ? payments.stripePublishableKey : undefined,
		};
	},
});

/**
 * Record a card Stripe has verified for the contract (from
 * `paymentMethods.confirmPaymentMethodUpdate` or the `setup_intent.succeeded`
 * webhook; both retrieve the SetupIntent from Stripe first). Idempotent per
 * SetupIntent. A past_due contract's next retry is brought forward to now and
 * the dunning sweep is run, so the new card is tried straight away.
 */
export const recordContractPaymentMethod = internalMutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
		stripeCustomerId: v.string(),
		paymentMethodId: v.string(),
		summary: v.optional(paymentMethodSummaryValidator),
		setupIntentId: v.optional(v.string()),
	},
	returns: v.object({ updated: v.boolean(), retryScheduled: v.boolean() }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const contract = await ctx.db.get(args.contractId);
		if (!contract || isEnded(contract.status)) return { updated: false, retryScheduled: false };
		if (contract.stripeCustomerId && contract.stripeCustomerId !== args.stripeCustomerId) {
			throw new ConvexError({ code: "FORBIDDEN", message: "That card belongs to another customer." });
		}
		const now = Date.now();
		const unchanged = contract.defaultPaymentMethodId === args.paymentMethodId;
		await ctx.db.patch("commerce_subscriptions", contract._id, {
			defaultPaymentMethodId: args.paymentMethodId,
			stripeCustomerId: args.stripeCustomerId,
			paymentProvider: "stripe",
			...(args.summary ? { paymentMethodSummary: args.summary } : {}),
			updatedAt: now,
		});
		if (unchanged) return { updated: false, retryScheduled: false };

		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: "subscription.payment_method_updated",
			actorUserId: contract.userId,
			data: { setupIntentId: args.setupIntentId, brand: args.summary?.brand, last4: args.summary?.last4 },
		});

		if (contract.status !== "past_due") return { updated: true, retryScheduled: false };
		const pending = await ctx.db
			.query("commerce_subscription_dunning_attempts")
			.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
			.collect();
		const next = pending.find((attempt) => attempt.status === "scheduled");
		if (!next) return { updated: true, retryScheduled: false };
		if (next.scheduledAt > now) {
			await ctx.db.patch("commerce_subscription_dunning_attempts", next._id, { scheduledAt: now, updatedAt: now });
		}
		await ctx.scheduler.runAfter(0, internal.commerceSubscriptions.dunning.runDunningSweep, {});
		return { updated: true, retryScheduled: true };
	},
});

/** Record the card summary (brand, last four, expiry) shown on the account page. */
export const recordPaymentMethodSummary = internalMutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
		paymentMethodId: v.string(),
		summary: paymentMethodSummaryValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const contract = await ctx.db.get(args.contractId);
		// Only for the card still on file: a newer card may have replaced it.
		if (!contract || contract.defaultPaymentMethodId !== args.paymentMethodId) return null;
		await ctx.db.patch("commerce_subscriptions", contract._id, { paymentMethodSummary: args.summary });
		return null;
	},
});

/** The card on file for a contract, for the summary refresh. */
export const getContractPaymentMethod = internalQuery({
	args: { contractId: v.id("commerce_subscriptions") },
	returns: v.union(v.null(), v.object({ paymentMethodId: v.string() })),
	handler: async (ctx, args) => {
		const contract = await ctx.db.get(args.contractId);
		return contract?.defaultPaymentMethodId ? { paymentMethodId: contract.defaultPaymentMethodId } : null;
	},
});

/** Resolve a contract reference from Stripe metadata (the webhook path). */
export const resolveContractRef = internalQuery({
	args: { contractRef: v.string() },
	returns: v.union(v.null(), v.id("commerce_subscriptions")),
	handler: async (ctx, args) => ctx.db.normalizeId("commerce_subscriptions", args.contractRef),
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS — PLAN CHANGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Change a contract to a new offer.
 *
 * Wave 7 implementation: delegates to real proration internal mutations:
 *   - Upgrade (netCharge > 0): calls `proration.applyUpgradeProration` —
 *     creates proration_event + invoice and charges through the live provider
 *     when subscription charging is enabled.
 *   - Downgrade (netCharge <= 0): calls `proration.applyDowngradeProration` —
 *     stores `scheduledOfferChange` on the contract. No immediate charge.
 *     Renewal cron applies it at next cycle boundary (renewal.ts step 1.e).
 *
 * Ownership enforced. No-op if toOfferId matches the current offer — throws
 * `VALIDATION_ERROR` to make misclicks visible in the UI.
 */
export const requestPlanChange = mutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
		toOfferId: v.id("commerce_subscription_offers"),
	},
	returns: v.union(
		v.object({
			ok: v.boolean(),
			mode: v.literal("scheduled"),
			effectiveAt: v.number(),
			netCharge: v.number(),
			proration: prorationResultValidator,
		}),
		v.object({
			ok: v.boolean(),
			mode: v.union(v.literal("immediate"), v.literal("pending")),
			invoiceId: v.union(v.null(), v.id("commerce_subscription_invoices")),
			netCharge: v.number(),
			proration: prorationResultValidator,
		}),
	),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const { user, contract } = await requireOwnedContract(ctx, args.contractId);

		// Plans change only in good standing: a past_due contract pays first, a
		// paused one resumes first, a scheduled cancellation is kept first.
		const terms = await resolveLifecycleTerms(ctx, contract);
		requireAction(contractActions(contract, terms.pausable, Date.now()).changePlan, contract, "change the plan of");

		const toOffer = await ctx.db.get(args.toOfferId);
		if (!toOffer) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Target offer not found.",
			});
		}
		if (toOffer.status === "archived") {
			throw new ConvexError({
				code: "OFFER_ARCHIVED",
				message: "Target offer is no longer available.",
			});
		}
		// The client chooses the target by id, so it must be an offer customers
		// can buy. A draft or admin-provisioned offer (for example a $0 comp
		// plan) is never reachable by plan change.
		if (!isOfferOpenToCustomers(toOffer)) {
			throw new ConvexError({
				code: "OFFER_UNAVAILABLE",
				message: "Target offer is not available.",
			});
		}

		// Resolve the current (from) offer via the active item.
		const items = await ctx.db
			.query("commerce_subscription_items")
			.withIndex("by_subscription", (q) =>
				q.eq("subscriptionId", args.contractId),
			)
			.collect();
		const activeItem = items.find(
			(it) => it.status === "active" || it.status === "pending_cancel",
		);
		if (!activeItem || !activeItem.sourceOfferId) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message:
					"Contract has no active subscription item — cannot change plan.",
			});
		}
		const fromOffer = await ctx.db.get(activeItem.sourceOfferId);
		if (!fromOffer) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Current offer no longer exists — contact support.",
			});
		}

		if (fromOffer._id === toOffer._id) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "New plan is the same as current plan.",
			});
		}

		const now = Date.now();
		const cycleStart =
			contract.currentPeriodStartAt ?? contract.createdAt ?? now;
		const cycleEnd =
			contract.currentPeriodEndAt ?? cycleStart + 30 * 24 * 60 * 60 * 1000;

		const proration = computeProration({
			cycleStart,
			cycleEnd,
			now,
			oldOfferPrice: fromOffer.recurringAmount ?? 0,
			newOfferPrice: toOffer.recurringAmount ?? 0,
		});

		// Charges are whole minor units; less than half a unit is no upgrade charge.
		const isUpgrade = Math.round(proration.netCharge) > 0;

		if (!isUpgrade) {
			// ── Downgrade / neutral: delegate to applyDowngradeProration ─────────
			// That mutation stores `scheduledOfferChange` and writes history.
			await ctx.runMutation(
				internal.commerceSubscriptions.proration.applyDowngradeProration,
				{
					contractId: args.contractId,
					toOfferId: args.toOfferId,
					triggeredByUserId: user._id,
				},
			);

			return {
				ok: true,
				mode: "scheduled" as const,
				effectiveAt: cycleEnd,
				netCharge: proration.netCharge,
				proration,
			};
		}

		// ── Upgrade: delegate to applyUpgradeProration ─────────────────────────
		// That mutation handles proration_event creation, invoice, coupon discounts,
		// live payment scheduling/fail-closed gating, and item swap.
		const upgradeResult = await ctx.runMutation(
			internal.commerceSubscriptions.proration.applyUpgradeProration,
			{
				contractId: args.contractId,
				toOfferId: args.toOfferId,
				triggeredByUserId: user._id,
			},
		);

		if (!upgradeResult.success) {
			throw new ConvexError({
				code: "PAYMENT_FAILED",
				message: upgradeResult.error ?? "Upgrade charge failed.",
			});
		}

		// The charge runs after this mutation; the plan changes when it succeeds.
		return {
			ok: true,
			mode: upgradeResult.pending ? ("pending" as const) : ("immediate" as const),
			invoiceId: upgradeResult.invoiceId,
			netCharge: Math.round(proration.netCharge),
			proration,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS — COUPON
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a coupon code to one of MY contracts.
 *
 * Validates via `helpers/coupons.validateCoupon` (customer-scoped so the
 * per-customer limit is enforced) then seeds a redemption row via
 * `helpers/coupons.initializeRedemption`. The actual discount application
 * to invoices happens at renewal time inside the billing action (Wave 7).
 *
 * Errors:
 *   - UNAUTHORIZED  — not signed in
 *   - NOT_FOUND     — contractId doesn't exist
 *   - FORBIDDEN     — not the contract owner
 *   - COUPON_INVALID — validation failed; `reason` surfaces from validator
 *   - INVALID_STATE — contract is cancelled/expired (no future invoices)
 */
export const applyCouponToMyContract = mutation({
	args: {
		contractId: v.id("commerce_subscriptions"),
		couponCode: v.string(),
	},
	returns: v.object({
   ok: v.boolean(),
   redemptionId: v.id("commerce_subscription_coupon_redemptions"),
   coupon: v.object({
     _id: v.id("commerce_subscription_coupons"),
     code: v.string(),
     discountType: v.union(v.literal("percent"), v.literal("fixed")),
     amount: v.number(),
     duration: v.union(v.literal("once"), v.literal("forever"), v.literal("n_months")),
     durationMonths: v.optional(v.number()),
   }),
 }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const { user, contract } = await requireOwnedContract(ctx, args.contractId);

		if (contract.status === "cancelled" || contract.status === "expired") {
			throw new ConvexError({
				code: "INVALID_STATE",
				message: `Cannot apply coupons to a ${contract.status} subscription.`,
				currentStatus: contract.status,
			});
		}

		const code = args.couponCode.trim();
		if (code.length === 0) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Coupon code is required.",
			});
		}

		// Resolve target offer from the active item so scope validation works.
		const items = await ctx.db
			.query("commerce_subscription_items")
			.withIndex("by_subscription", (q) =>
				q.eq("subscriptionId", args.contractId),
			)
			.collect();
		const activeItem = items.find(
			(it) => it.status === "active" || it.status === "pending_cancel",
		);
		if (!activeItem || !activeItem.sourceOfferId) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Contract has no active offer to redeem against.",
			});
		}

		const validation = await validateCoupon(
			ctx,
			code,
			args.contractId,
			user._id,
			activeItem.sourceOfferId,
		);
		if (!validation.valid) {
			throw new ConvexError({
				code: "COUPON_INVALID",
				message: `Coupon cannot be applied: ${validation.reason}.`,
				reason: validation.reason,
			});
		}

		const redemptionId = await initializeRedemption(
			ctx,
			args.contractId,
			validation.coupon._id,
		);

		const correlationId = createCorrelationId();
		await writeHistory(ctx, {
			subscriptionId: args.contractId,
			eventType: "subscription.coupon_applied",
			actorUserId: user._id,
			data: {
				couponCode: code,
				couponId: validation.coupon._id,
				redemptionId,
				discountType: validation.coupon.discountType,
				discountAmount: validation.coupon.amount,
				duration: validation.coupon.duration,
			},
			correlationId,
		});

		return {
			ok: true,
			redemptionId,
			coupon: {
				_id: validation.coupon._id,
				code: validation.coupon.code,
				discountType: validation.coupon.discountType,
				amount: validation.coupon.amount,
				duration: validation.coupon.duration,
				durationMonths: validation.coupon.durationMonths,
			},
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS — INVOICE PDF
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return a generated PDF invoice document that the website can serve as a
 * downloadable file.
 *
 * Runs as an action (not a query) because Wave 7 will add network calls to
 * a PDF service.
 *
 * Ownership verified via a query call — actions cannot read the DB directly.
 */
export const getInvoicePdf = action({
	args: {
		invoiceId: v.id("commerce_subscription_invoices"),
	},
	returns: v.object({
   ok: v.literal(true),
   format: v.literal("pdf"),
   filename: v.string(),
   content: v.string(),
   contentType: v.string(),
 }),
	handler: async (
		ctx,
		args,
	): Promise<{
		ok: true;
		format: "pdf";
		filename: string;
		content: string;
		contentType: string;
	}> => {
		const result = await ctx.runQuery(
			internal.commerceSubscriptions.internals.getMyInvoiceForPdf,
			{ invoiceId: args.invoiceId },
		);
		if (!result) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Invoice not found or not accessible.",
			});
		}

		const { invoice, items, offerTitle, siteTitle, customerEmail } = result;
		const currencyCode = invoice.currencyCode ?? "USD";
		const day = (timestamp: number) =>
			new Date(timestamp).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

		const lines: string[] = [];
		lines.push(`${siteTitle} - Invoice ${invoice.invoiceNumber ?? ""}`.trim());
		lines.push("================================");
		lines.push("");
		if (customerEmail) lines.push(`Billed to:      ${customerEmail}`);
		lines.push(`Status:         ${invoice.status}`);
		lines.push(`Issued:         ${day(invoice.createdAt)}`);
		if (invoice.paidAt) lines.push(`Paid:           ${day(invoice.paidAt)}`);
		if (invoice.periodStartAt !== undefined && invoice.periodEndAt !== undefined) {
			lines.push(`Period:         ${day(invoice.periodStartAt)} to ${day(invoice.periodEndAt)}`);
		}
		if (offerTitle) lines.push(`Plan:           ${offerTitle}`);
		lines.push("");
		lines.push("Items");
		lines.push("-----");
		for (const item of items) {
			lines.push(`  ${item.description}`);
			lines.push(
				`    ${item.quantity} x ${formatMoney(item.unitAmount, currencyCode)} = ${formatMoney(item.lineTotalAmount, currencyCode)}`,
			);
		}
		lines.push("");
		lines.push(`  Subtotal:     ${formatMoney(invoice.subtotalAmount, currencyCode)}`);
		lines.push(`  Tax:          ${formatMoney(invoice.taxAmount, currencyCode)}`);
		lines.push(`  Total:        ${formatMoney(invoice.totalAmount, currencyCode)} ${currencyCode}`);

		return {
			ok: true,
			format: "pdf",
			filename: `invoice-${invoice.invoiceNumber ?? invoice._id}.pdf`,
			content: buildSimplePdf(lines),
			contentType: "application/pdf",
		};
	},
});
