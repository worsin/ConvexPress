/**
 * Commerce Subscriptions — the administrator's view of contracts and billing.
 *
 * What the admin's contract screens read and do, typed end to end:
 *   - listContracts         contracts with the customer, package, card on file
 *                           and any payment problem (paginated, by status)
 *   - getContractBilling    one contract's billing: payment problem, card,
 *                           invoices with refunds, dunning attempts, timeline,
 *                           and the actions its state allows
 *   - searchContracts       find a contract by customer email, number or id
 *   - listInvoices / getInvoiceDetail   invoices with customer, refunds and
 *                           collection attempts
 *   - listUpcomingRenewals  what charges in the next days, and how much
 *   - listDunningQueue      every past-due contract and its next retry
 *   - listRecentAttempts    the newest payment attempts, with customer and amount
 *   - refundInvoice / retryPayment / changePlan   staff actions
 *
 * Everything requires `manage_options`. Actions run through the operator
 * functions (`operator.ts`) and proration, so they behave exactly like every
 * other path, and are recorded with the acting administrator.
 */
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import {
	commerceSubscriptionInvoiceStatusValidator,
	commerceSubscriptionStatusValidator,
} from "../schema/commerceSubscriptions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import { isEnded, resolveLifecycleTerms, type SubscriptionDoc } from "./lifecycle";

type Invoice = Doc<"commerce_subscription_invoices">;

const paginatedResult = <T extends ReturnType<typeof v.object>>(row: T) =>
	v.object({
		page: v.array(row),
		isDone: v.boolean(),
		continueCursor: v.string(),
		splitCursor: v.optional(v.union(v.string(), v.null())),
		pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
	});

const billingIssueValidator = v.object({
	invoiceId: v.id("commerce_subscription_invoices"),
	amountDue: v.number(),
	failedAttempts: v.number(),
	lastFailureReason: v.optional(v.string()),
	nextRetryAt: v.optional(v.number()),
	accessEndsAt: v.optional(v.number()),
});
type BillingIssue = Infer<typeof billingIssueValidator>;

const attemptStatusValidator = v.union(
	v.literal("scheduled"),
	v.literal("processing"),
	v.literal("failed"),
	v.literal("succeeded"),
	v.literal("aborted"),
);

const cardValidator = v.object({ brand: v.string(), last4: v.string(), expMonth: v.number(), expYear: v.number() });

async function billingIssue(ctx: QueryCtx, contract: SubscriptionDoc): Promise<BillingIssue | null> {
	if (contract.status !== "past_due") return null;
	const unpaid = (
		await ctx.db
			.query("commerce_subscription_invoices")
			.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
			.collect()
	)
		.filter((invoice) => invoice.status === "failed" && invoice.prorationEventId === undefined)
		.sort((a, b) => b.createdAt - a.createdAt)[0];
	if (!unpaid) return null;
	const attempts = await ctx.db
		.query("commerce_subscription_dunning_attempts")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", unpaid._id))
		.collect();
	const failed = attempts.filter((attempt) => attempt.status === "failed").sort((a, b) => b.updatedAt - a.updatedAt);
	const grace = (
		await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
			.collect()
	)
		.map((entitlement) => entitlement.graceEndsAt)
		.filter((value): value is number => value !== undefined);
	return {
		invoiceId: unpaid._id,
		amountDue: unpaid.totalAmount,
		failedAttempts: failed.length,
		lastFailureReason: failed[0]?.errorMessage,
		nextRetryAt: attempts.find((attempt) => attempt.status === "scheduled")?.scheduledAt,
		accessEndsAt: grace.length > 0 ? Math.max(...grace) : undefined,
	};
}

async function customerOf(ctx: QueryCtx, contract: SubscriptionDoc): Promise<{ email?: string; name?: string }> {
	const user = contract.userId ? await ctx.db.get(contract.userId) : null;
	if (!user) return {};
	const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.displayName;
	return { email: user.email, name: name || undefined };
}

async function currentPlan(ctx: QueryCtx, contract: SubscriptionDoc) {
	const items = await ctx.db
		.query("commerce_subscription_items")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
		.collect();
	const item = items.find((row) => row.status === "active" || row.status === "pending_cancel") ?? items[0];
	const offer = item?.sourceOfferId ? await ctx.db.get(item.sourceOfferId) : null;
	return { offerId: offer?._id, title: offer?.title ?? item?.titleSnapshot };
}

// ─── Contracts list ─────────────────────────────────────────────────────────

const contractRowValidator = v.object({
	_id: v.id("commerce_subscriptions"),
	status: commerceSubscriptionStatusValidator,
	customerEmail: v.optional(v.string()),
	customerName: v.optional(v.string()),
	planTitle: v.optional(v.string()),
	recurringAmount: v.number(),
	currencyCode: v.string(),
	billingInterval: v.optional(v.string()),
	billingIntervalCount: v.optional(v.number()),
	nextChargeAt: v.optional(v.number()),
	currentPeriodEndAt: v.optional(v.number()),
	createdAt: v.number(),
	card: v.union(v.null(), cardValidator),
	billingIssue: v.union(v.null(), billingIssueValidator),
});
type ContractRow = Infer<typeof contractRowValidator>;

async function toContractRow(ctx: QueryCtx, contract: SubscriptionDoc): Promise<ContractRow> {
	const customer = await customerOf(ctx, contract);
	const plan = await currentPlan(ctx, contract);
	return {
		_id: contract._id,
		status: contract.status,
		customerEmail: customer.email,
		customerName: customer.name,
		planTitle: plan.title,
		recurringAmount: contract.recurringAmount,
		currencyCode: contract.currencyCode,
		billingInterval: contract.billingInterval,
		billingIntervalCount: contract.billingIntervalCount,
		nextChargeAt: contract.status === "active" || contract.status === "trialing" ? contract.nextBillingAt : undefined,
		currentPeriodEndAt: contract.currentPeriodEndAt,
		createdAt: contract.createdAt,
		card: contract.paymentMethodSummary ?? null,
		billingIssue: await billingIssue(ctx, contract),
	};
}

/** Contracts, newest first, optionally one status. */
export const listContracts = query({
	args: { status: v.optional(commerceSubscriptionStatusValidator), paginationOpts: paginationOptsValidator },
	returns: paginatedResult(contractRowValidator),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const status = args.status;
		const page = status
			? await ctx.db
					.query("commerce_subscriptions")
					.withIndex("by_status", (q) => q.eq("status", status))
					.order("desc")
					.paginate(args.paginationOpts)
			: await ctx.db.query("commerce_subscriptions").order("desc").paginate(args.paginationOpts);
		const rows: ContractRow[] = [];
		for (const contract of page.page) rows.push(await toContractRow(ctx, contract));
		return { ...page, page: rows };
	},
});

const SEARCH_LIMIT = 25;

/**
 * Find contracts across every page: by the customer's email (a prefix is
 * enough), the contract's number, or its id. Newest first, at most 25.
 */
export const searchContracts = query({
	args: { query: v.string() },
	returns: v.array(contractRowValidator),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const term = args.query.trim();
		if (term.length < 2) return [];

		const found = new Map<Id<"commerce_subscriptions">, SubscriptionDoc>();
		const contractId = ctx.db.normalizeId("commerce_subscriptions", term);
		if (contractId) {
			const contract = await ctx.db.get(contractId);
			if (contract) found.set(contract._id, contract);
		}
		const byNumber = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_subscription_number", (q) => q.eq("subscriptionNumber", term))
			.take(SEARCH_LIMIT);
		for (const contract of byNumber) found.set(contract._id, contract);

		// Emails are stored as typed; try the term as typed and lower-cased.
		for (const prefix of new Set([term, term.toLowerCase()])) {
			const users = await ctx.db
				.query("users")
				.withIndex("by_email", (q) => q.gte("email", prefix).lt("email", `${prefix}\uffff`))
				.take(SEARCH_LIMIT);
			for (const user of users) {
				const contracts = await ctx.db
					.query("commerce_subscriptions")
					.withIndex("by_user", (q) => q.eq("userId", user._id))
					.take(SEARCH_LIMIT);
				for (const contract of contracts) found.set(contract._id, contract);
			}
		}

		const contracts = [...found.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, SEARCH_LIMIT);
		const rows: ContractRow[] = [];
		for (const contract of contracts) rows.push(await toContractRow(ctx, contract));
		return rows;
	},
});

// ─── One contract's billing ─────────────────────────────────────────────────

const refundValidator = v.object({
	key: v.string(),
	amount: v.number(),
	status: v.union(v.literal("pending"), v.literal("succeeded"), v.literal("failed")),
	reason: v.optional(v.string()),
	error: v.optional(v.string()),
	providerRefundId: v.optional(v.string()),
	requestedBy: v.optional(v.string()),
	requestedAt: v.number(),
	completedAt: v.optional(v.number()),
});

const adminInvoiceValidator = v.object({
	_id: v.id("commerce_subscription_invoices"),
	invoiceNumber: v.optional(v.string()),
	kind: v.union(v.literal("signup"), v.literal("renewal"), v.literal("plan_change")),
	status: commerceSubscriptionInvoiceStatusValidator,
	totalAmount: v.number(),
	currencyCode: v.string(),
	periodStartAt: v.optional(v.number()),
	periodEndAt: v.optional(v.number()),
	dueAt: v.optional(v.number()),
	paidAt: v.optional(v.number()),
	createdAt: v.number(),
	paymentTransactionId: v.optional(v.string()),
	refundedAmount: v.number(),
	pendingRefundAmount: v.number(),
	refundableAmount: v.number(),
	refunds: v.array(refundValidator),
});
type AdminInvoice = Infer<typeof adminInvoiceValidator>;

function adminInvoice(invoice: Invoice): AdminInvoice {
	const refunds = invoice.refunds ?? [];
	const sum = (status: "pending" | "succeeded") =>
		refunds.reduce((total, refund) => (refund.status === status ? total + refund.amount : total), 0);
	const refunded = sum("succeeded");
	const pending = sum("pending");
	const cardPayment = invoice.status === "paid" && Boolean(invoice.paymentTransactionId?.startsWith("pi_"));
	return {
		_id: invoice._id,
		invoiceNumber: invoice.invoiceNumber,
		kind: invoice.kind ?? (invoice.prorationEventId ? "plan_change" : "renewal"),
		status: invoice.status,
		totalAmount: invoice.totalAmount,
		currencyCode: invoice.currencyCode,
		periodStartAt: invoice.periodStartAt,
		periodEndAt: invoice.periodEndAt,
		dueAt: invoice.dueAt,
		paidAt: invoice.paidAt,
		createdAt: invoice.createdAt,
		paymentTransactionId: invoice.paymentTransactionId,
		refundedAmount: refunded,
		pendingRefundAmount: pending,
		refundableAmount: cardPayment ? Math.max(0, invoice.totalAmount - refunded - pending) : 0,
		refunds: refunds.map((refund) => ({
			key: refund.key,
			amount: refund.amount,
			status: refund.status,
			reason: refund.reason,
			error: refund.error,
			providerRefundId: refund.providerRefundId,
			requestedBy: refund.requestedBy,
			requestedAt: refund.requestedAt,
			completedAt: refund.completedAt,
		})),
	};
}

const timelineValidator = v.object({
	_id: v.id("commerce_subscription_history"),
	eventType: v.string(),
	createdAt: v.number(),
	fromStatus: v.optional(v.string()),
	toStatus: v.optional(v.string()),
	reason: v.optional(v.string()),
	actor: v.optional(v.string()),
});

function metadataText(metadata: unknown, key: string): string | undefined {
	if (typeof metadata !== "object" || metadata === null) return undefined;
	const value: unknown = Reflect.get(metadata, key);
	return typeof value === "string" ? value : undefined;
}

async function actorLabel(ctx: QueryCtx, row: Doc<"commerce_subscription_history">): Promise<string | undefined> {
	if (row.actorUserId) {
		const user = await ctx.db.get(row.actorUserId);
		if (user) return user.displayName ?? user.email;
	}
	const data: unknown = typeof row.metadata === "object" && row.metadata !== null ? Reflect.get(row.metadata, "data") : undefined;
	return metadataText(data, "actorRef");
}

/** Everything the contract billing panel shows, and which actions apply now. */
export const getContractBilling = query({
	args: { subscriptionId: v.id("commerce_subscriptions") },
	returns: v.union(
		v.null(),
		v.object({
			customerEmail: v.optional(v.string()),
			customerName: v.optional(v.string()),
			planOfferId: v.optional(v.id("commerce_subscription_offers")),
			planTitle: v.optional(v.string()),
			card: v.union(v.null(), cardValidator),
			billingIssue: v.union(v.null(), billingIssueValidator),
			invoices: v.array(adminInvoiceValidator),
			dunningAttempts: v.array(
				v.object({
					_id: v.id("commerce_subscription_dunning_attempts"),
					invoiceId: v.optional(v.id("commerce_subscription_invoices")),
					attemptNumber: v.number(),
					status: attemptStatusValidator,
					scheduledAt: v.number(),
					processedAt: v.optional(v.number()),
					errorMessage: v.optional(v.string()),
				}),
			),
			timeline: v.array(timelineValidator),
			actions: v.object({
				pause: v.boolean(),
				resume: v.boolean(),
				scheduleCancel: v.boolean(),
				cancelNow: v.boolean(),
				retryPayment: v.boolean(),
				changePlan: v.boolean(),
			}),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const contract = await ctx.db.get(args.subscriptionId);
		if (!contract) return null;
		const customer = await customerOf(ctx, contract);
		const plan = await currentPlan(ctx, contract);
		const terms = await resolveLifecycleTerms(ctx, contract);
		const invoices = (
			await ctx.db
				.query("commerce_subscription_invoices")
				.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
				.collect()
		).sort((a, b) => b.createdAt - a.createdAt);
		const attempts = (
			await ctx.db
				.query("commerce_subscription_dunning_attempts")
				.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
				.collect()
		).sort((a, b) => b.createdAt - a.createdAt);
		const history = await ctx.db
			.query("commerce_subscription_history")
			.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
			.order("desc")
			.take(200);
		const timeline = [];
		for (const row of history) {
			timeline.push({
				_id: row._id,
				eventType: row.eventType,
				createdAt: row.createdAt,
				fromStatus: metadataText(row.metadata, "fromStatus"),
				toStatus: metadataText(row.metadata, "toStatus"),
				reason: metadataText(row.metadata, "reason"),
				actor: await actorLabel(ctx, row),
			});
		}
		const status = contract.status;
		const goodStanding = status === "active" || status === "trialing";
		return {
			customerEmail: customer.email,
			customerName: customer.name,
			planOfferId: plan.offerId,
			planTitle: plan.title,
			card: contract.paymentMethodSummary ?? null,
			billingIssue: await billingIssue(ctx, contract),
			invoices: invoices.map(adminInvoice),
			dunningAttempts: attempts.map((attempt) => ({
				_id: attempt._id,
				invoiceId: attempt.invoiceId,
				attemptNumber: attempt.attemptNumber,
				status: attempt.status,
				scheduledAt: attempt.scheduledAt,
				processedAt: attempt.processedAt,
				errorMessage: attempt.errorMessage,
			})),
			timeline,
			actions: {
				pause: goodStanding && terms.pausable,
				resume: status === "paused" || status === "pending_cancel",
				scheduleCancel: goodStanding || status === "paused",
				cancelNow: !isEnded(status),
				retryPayment: status === "past_due",
				changePlan: goodStanding && plan.offerId !== undefined,
			},
		};
	},
});

/** Every past-due contract with its unpaid amount and next retry, soonest first. */
export const listDunningQueue = query({
	args: {},
	returns: v.array(contractRowValidator),
	handler: async (ctx) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const pastDue = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q) => q.eq("status", "past_due"))
			.collect();
		const rows: ContractRow[] = [];
		for (const contract of pastDue) rows.push(await toContractRow(ctx, contract));
		return rows.sort(
			(a, b) => (a.billingIssue?.nextRetryAt ?? Number.MAX_SAFE_INTEGER) - (b.billingIssue?.nextRetryAt ?? Number.MAX_SAFE_INTEGER),
		);
	},
});

const UPCOMING_LIMIT = 50;

/** Active and trialing contracts that charge within the next `days` (default 7), soonest first. */
export const listUpcomingRenewals = query({
	args: { days: v.optional(v.number()) },
	returns: v.object({ rows: v.array(contractRowValidator), expectedAmount: v.number(), truncated: v.boolean() }),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return { rows: [], expectedAmount: 0, truncated: false };
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const now = Date.now();
		const days = Math.min(Math.max(args.days ?? 7, 1), 90);
		const due = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_nextBillingAt", (q) => q.gte("nextBillingAt", now).lte("nextBillingAt", now + days * 24 * 60 * 60 * 1000))
			.take(UPCOMING_LIMIT * 4);
		const renewing = due.filter((contract) => contract.status === "active" || contract.status === "trialing");
		const rows: ContractRow[] = [];
		for (const contract of renewing.slice(0, UPCOMING_LIMIT)) rows.push(await toContractRow(ctx, contract));
		return {
			rows,
			expectedAmount: renewing.reduce((sum, contract) => sum + contract.recurringAmount, 0),
			truncated: renewing.length > UPCOMING_LIMIT || due.length === UPCOMING_LIMIT * 4,
		};
	},
});

// ─── Invoices ───────────────────────────────────────────────────────────────

const invoiceRowValidator = adminInvoiceValidator.extend({
	subscriptionId: v.id("commerce_subscriptions"),
	customerEmail: v.optional(v.string()),
	customerName: v.optional(v.string()),
});

async function invoiceRow(ctx: QueryCtx, invoice: Invoice) {
	const contract = await ctx.db.get(invoice.subscriptionId);
	const customer = contract ? await customerOf(ctx, contract) : {};
	return { ...adminInvoice(invoice), subscriptionId: invoice.subscriptionId, customerEmail: customer.email, customerName: customer.name };
}

/** Every subscription invoice, newest first, optionally one status. */
export const listInvoices = query({
	args: { status: v.optional(commerceSubscriptionInvoiceStatusValidator), paginationOpts: paginationOptsValidator },
	returns: paginatedResult(invoiceRowValidator),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const status = args.status;
		const page = status
			? await ctx.db
					.query("commerce_subscription_invoices")
					.withIndex("by_status", (q) => q.eq("status", status))
					.order("desc")
					.paginate(args.paginationOpts)
			: await ctx.db.query("commerce_subscription_invoices").order("desc").paginate(args.paginationOpts);
		const rows = [];
		for (const invoice of page.page) rows.push(await invoiceRow(ctx, invoice));
		return { ...page, page: rows };
	},
});

/** One invoice: amounts, lines, refunds, and every attempt to collect it. */
export const getInvoiceDetail = query({
	args: { invoiceId: v.id("commerce_subscription_invoices") },
	returns: v.union(
		v.null(),
		invoiceRowValidator.extend({
			subtotalAmount: v.number(),
			taxAmount: v.number(),
			paymentProvider: v.optional(v.string()),
			planTitle: v.optional(v.string()),
			lines: v.array(
				v.object({
					_id: v.id("commerce_subscription_invoice_items"),
					title: v.string(),
					quantity: v.number(),
					unitAmount: v.number(),
					totalAmount: v.number(),
				}),
			),
			attempts: v.array(
				v.object({
					_id: v.id("commerce_subscription_dunning_attempts"),
					attemptNumber: v.number(),
					status: attemptStatusValidator,
					scheduledAt: v.number(),
					processedAt: v.optional(v.number()),
					errorMessage: v.optional(v.string()),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) return null;
		const contract = await ctx.db.get(invoice.subscriptionId);
		const plan = contract ? await currentPlan(ctx, contract) : { title: undefined };
		const lines = await ctx.db
			.query("commerce_subscription_invoice_items")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
			.collect();
		const attempts = await ctx.db
			.query("commerce_subscription_dunning_attempts")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
			.collect();
		return {
			...(await invoiceRow(ctx, invoice)),
			subtotalAmount: invoice.subtotalAmount,
			taxAmount: invoice.taxAmount,
			paymentProvider: invoice.paymentProvider,
			planTitle: plan.title,
			lines: lines.map((line) => ({
				_id: line._id,
				title: line.description,
				quantity: line.quantity,
				unitAmount: line.unitAmount,
				totalAmount: line.lineTotalAmount,
			})),
			attempts: attempts
				.sort((a, b) => a.attemptNumber - b.attemptNumber)
				.map((attempt) => ({
					_id: attempt._id,
					attemptNumber: attempt.attemptNumber,
					status: attempt.status,
					scheduledAt: attempt.scheduledAt,
					processedAt: attempt.processedAt,
					errorMessage: attempt.errorMessage,
				})),
		};
	},
});

const RECENT_ATTEMPTS_DEFAULT = 50;
const RECENT_ATTEMPTS_MAX = 200;

/** The newest payment attempts across every contract, with who and how much. */
export const listRecentAttempts = query({
	args: { limit: v.optional(v.number()) },
	returns: v.array(
		v.object({
			_id: v.id("commerce_subscription_dunning_attempts"),
			subscriptionId: v.id("commerce_subscriptions"),
			attemptNumber: v.number(),
			status: attemptStatusValidator,
			scheduledAt: v.number(),
			processedAt: v.optional(v.number()),
			errorMessage: v.optional(v.string()),
			amount: v.optional(v.number()),
			currencyCode: v.optional(v.string()),
			customerEmail: v.optional(v.string()),
			customerName: v.optional(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		await requireCommerceSubscriptionsEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const limit = Math.min(Math.max(Math.floor(args.limit ?? RECENT_ATTEMPTS_DEFAULT), 1), RECENT_ATTEMPTS_MAX);
		const attempts = await ctx.db.query("commerce_subscription_dunning_attempts").order("desc").take(limit);
		const customers = new Map<Id<"commerce_subscriptions">, { email?: string; name?: string }>();
		const rows = [];
		for (const attempt of attempts) {
			let customer = customers.get(attempt.subscriptionId);
			if (!customer) {
				const contract = await ctx.db.get(attempt.subscriptionId);
				customer = contract ? await customerOf(ctx, contract) : {};
				customers.set(attempt.subscriptionId, customer);
			}
			const invoice = attempt.invoiceId ? await ctx.db.get(attempt.invoiceId) : null;
			rows.push({
				_id: attempt._id,
				subscriptionId: attempt.subscriptionId,
				attemptNumber: attempt.attemptNumber,
				status: attempt.status,
				scheduledAt: attempt.scheduledAt,
				processedAt: attempt.processedAt,
				errorMessage: attempt.errorMessage,
				amount: invoice?.totalAmount,
				currencyCode: invoice?.currencyCode,
				customerEmail: customer.email,
				customerName: customer.name,
			});
		}
		return rows;
	},
});

// ─── Staff actions ──────────────────────────────────────────────────────────

const actorRef = (userId: Id<"users">) => `users:${userId}`;

/** Refund all or part (cents) of a paid invoice to the card it was paid with. */
export const refundInvoice = mutation({
	args: { invoiceId: v.id("commerce_subscription_invoices"), amount: v.optional(v.number()), reason: v.string() },
	returns: v.object({ refundKey: v.string(), amount: v.number() }),
	handler: async (ctx, args): Promise<{ refundKey: string; amount: number }> => {
		await requireCommerceSubscriptionsEnabled(ctx);
		const user = await requireCan(ctx, "manage_options");
		const reason = args.reason.trim();
		if (reason.length === 0) throw new ConvexError({ code: "VALIDATION_ERROR", message: "A reason is required." });
		return await ctx.runMutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, {
			invoiceId: args.invoiceId,
			amount: args.amount,
			reason,
			actorRef: actorRef(user._id),
		});
	},
});

/** Charge a past-due contract's card again now. */
export const retryPayment = mutation({
	args: { subscriptionId: v.id("commerce_subscriptions") },
	returns: v.object({ scheduled: v.boolean() }),
	handler: async (ctx, args): Promise<{ scheduled: boolean }> => {
		await requireCommerceSubscriptionsEnabled(ctx);
		const user = await requireCan(ctx, "manage_options");
		return await ctx.runMutation(internal.commerceSubscriptions.operator.retryPaymentNow, {
			subscriptionId: args.subscriptionId,
			actorRef: actorRef(user._id),
		});
	},
});

/**
 * Move a contract to another offer for the customer: an upgrade is charged now
 * for the rest of the period (prorated); a downgrade takes effect at renewal.
 */
export const changePlan = mutation({
	args: { subscriptionId: v.id("commerce_subscriptions"), toOfferId: v.id("commerce_subscription_offers") },
	returns: v.object({ mode: v.union(v.literal("upgrade"), v.literal("downgrade")), invoiceId: v.optional(v.id("commerce_subscription_invoices")) }),
	handler: async (ctx, args): Promise<{ mode: "upgrade" | "downgrade"; invoiceId?: Id<"commerce_subscription_invoices"> }> => {
		await requireCommerceSubscriptionsEnabled(ctx);
		const user = await requireCan(ctx, "manage_options");
		const contract = await ctx.db.get(args.subscriptionId);
		if (!contract) throw new ConvexError({ code: "NOT_FOUND", message: "Subscription not found." });
		const plan = await currentPlan(ctx, contract);
		const toOffer = await ctx.db.get(args.toOfferId);
		if (!toOffer || toOffer.status === "archived") throw new ConvexError({ code: "NOT_FOUND", message: "That offer is not available." });
		if (plan.offerId === toOffer._id) throw new ConvexError({ code: "VALIDATION_ERROR", message: "The contract is already on that offer." });
		const fromOffer = plan.offerId ? await ctx.db.get(plan.offerId) : null;
		const upgrade = toOffer.recurringAmount > (fromOffer?.recurringAmount ?? contract.recurringAmount);
		if (upgrade) {
			const result = await ctx.runMutation(internal.commerceSubscriptions.proration.applyUpgradeProration, {
				contractId: contract._id,
				toOfferId: toOffer._id,
				triggeredByUserId: user._id,
			});
			if (!result.success) throw new ConvexError({ code: "PAYMENT_FAILED", message: result.error ?? "The upgrade charge failed." });
			return { mode: "upgrade", invoiceId: result.invoiceId ?? undefined };
		}
		await ctx.runMutation(internal.commerceSubscriptions.proration.applyDowngradeProration, {
			contractId: contract._id,
			toOfferId: toOffer._id,
			triggeredByUserId: user._id,
		});
		return { mode: "downgrade" };
	},
});
