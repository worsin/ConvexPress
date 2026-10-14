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
 *     - getMyActiveContracts   Enriched list (offer, product, currentInvoice,
 *                              nextChargeAt, membership grants) for ME.
 *     - previewPlanChange      Proration preview for an upgrade/downgrade.
 *     - listMyInvoices         My invoices across all contracts.
 *
 *   Mutations:
 *     - requestPauseContract      Thin wrapper over mutations.pause.
 *     - requestResumeContract     Thin wrapper over mutations.resume.
 *     - requestCancelContract     Thin wrapper over mutations.scheduleCancel
 *                                 or mutations.cancelNow.
 *     - requestPlanChange         Move a contract to a new offer; prorates
 *                                 upgrades inline, schedules downgrades at
 *                                 cycle end.
 *     - applyCouponToMyContract   Validate + seed a redemption row on ME.
 *
 *   Actions:
 *     - getInvoicePdf   Return a generated PDF invoice document.
 *
 * The existing admin-side pause / resume / scheduleCancel / cancelNow already
 * accept non-admin callers and verify `user._id === subscription.userId`, so
 * the portal wrappers simply delegate. They exist as thin wrappers (not
 * re-exports) so the website calls a stable `portal.*` API surface that is
 * distinct from the admin API surface.
 *
 * Both surfaces hold an owner to good-standing transitions: pause only an
 * active/trialing contract, resume only a paused (or scheduled-to-cancel)
 * one, and a resume after the paid period ended bills immediately. A
 * customer can never walk a past_due, cancelled or expired contract back to
 * `active` without paying.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../helpers/auth";
import { initializeRedemption, validateCoupon } from "../helpers/coupons";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { computeProration } from "../helpers/proration";
import { decideBridgeCall } from "./bridgeDecisions";
import { isOfferOpenToCustomers, requireCommerceSubscriptionsEnabled } from "./helpers";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";
import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
import { membershipDocs } from "../schema/membership.docs.generated";


// ─── Local helpers ──────────────────────────────────────────────────────────

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

const prorationResultValidator = v.object({
	daysRemaining: v.number(),
	daysInCycle: v.number(),
	unusedOldAmount: v.number(),
	proratedNewAmount: v.number(),
	netCharge: v.number(),
});

function addDays(timestamp: number, days: number): number {
	return timestamp + days * 24 * 60 * 60 * 1000;
}

function createCorrelationId(): string {
	return `pt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

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

/**
 * Bridge + entitlement status sync, inlined from `internals.syncEntitlementsForStatus`.
 *
 * The internals version is a module-local helper (not exported as an internal
 * mutation), so we can't reach it via `ctx.scheduler` or `ctx.runMutation`.
 * Portal mutations are already running in a mutation context, so we just
 * inline the same logic: patch entitlement statuses + propagate to membership
 * grants via `decideBridgeCall`.
 *
 * Signature matches the internal helper so any future consolidation just needs
 * to swap the import. `gracePeriodDays` defaults to 3 to match the internal
 * default when product config is unknown.
 */
async function syncEntitlementsForContract(
	ctx: MutationCtx,
	subscriptionId: Id<"commerce_subscriptions">,
	gracePeriodDays = 3,
) {
	const subscription = await ctx.db.get(subscriptionId);
	if (!subscription) return;
	const now = Date.now();

	const entitlements = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q) =>
			q.eq("subscriptionId", subscription._id),
		)
		.collect();

	for (const entitlement of entitlements) {
		if (
			subscription.status === "active" ||
			subscription.status === "trialing"
		) {
			await patchDynamicWithMediaReferences(ctx, entitlement._id, {
				status: "active",
				endsAt: undefined,
				updatedAt: now,
			});
		} else if (
			subscription.status === "past_due" ||
			subscription.status === "paused"
		) {
			await patchDynamicWithMediaReferences(ctx, entitlement._id, {
				status: "grace",
				graceEndsAt: addDays(now, gracePeriodDays),
				updatedAt: now,
			});
		} else if (
			subscription.status === "cancelled" ||
			subscription.status === "expired"
		) {
			await patchDynamicWithMediaReferences(ctx, entitlement._id, {
				status: "revoked",
				endsAt: now,
				updatedAt: now,
			});
		}
	}

	// Bridge propagation — gated by plugin flags + acceptSubscriptionGrants.
	const membershipOn = await isPluginEnabled(ctx, "membership");
	if (!membershipOn) return;
	try {
		const settingsRow = await ctx.db
			.query("settings")
			.withIndex("by_section", (q) =>
				q.eq("section", "membership.general"),
			)
			.unique();
		const values = (settingsRow?.values ?? {}) as Record<string, unknown>;
		if (values.acceptSubscriptionGrants === false) return;
	} catch {
		// Settings read failure falls through to enabled (matches internal).
	}

	const refreshed = await ctx.db.get(subscriptionId);
	if (!refreshed) return;
	const refreshedEntitlements = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q) =>
			q.eq("subscriptionId", refreshed._id),
		)
		.collect();

	for (const entitlement of refreshedEntitlements) {
		const decision = decideBridgeCall({
			subscription: refreshed,
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
			// Audit the failure but do NOT re-throw — per the internal helper,
			// one entitlement's bridge failure must not block the rest or the
			// transition itself.
			const code = entitlement.entitlementCode ?? "(no-code)";
			try {
				await writeHistory(ctx, {
					subscriptionId: refreshed._id,
					eventType: "subscription.bridge_failed",
					message: `Membership bridge call failed for entitlement ${code}`,
					fromStatus: refreshed.status,
					toStatus: refreshed.status,
					reason: "bridge_error",
					data: {
						entitlementCode: code,
						action: decision.action,
						error: err instanceof Error ? err.message : String(err),
					},
				});
			} catch {
				// History write failure is non-fatal.
			}
		}
	}
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
 * Rich list of the current user's active-ish contracts, with every piece of
 * data the portal UI needs to render without fan-out queries:
 *
 *   - contract (raw doc)
 *   - offer (current offer resolved via active subscription_item)
 *   - product (if contract.productId)
 *   - currentInvoice (most recent invoice for the contract, or null)
 *   - nextChargeAt (derived from contract.nextBillingAt)
 *   - membershipGrants (any `membership_grants` rows sourced from this
 *                       contract via the Wave 3 bridge)
 *   - entitlements (all active/grace entitlements for the contract)
 *
 * "Active-ish" = any status that's not `cancelled` or `expired`. The UI can
 * further filter if it only wants truly active plans.
 *
 * Returns `[]` for unauthenticated users rather than throwing — the typical
 * caller is an SSR loader that should degrade gracefully.
 */
export const getMyActiveContracts = query({
	args: {},
	returns: v.array(
		commerceSubscriptionsDocs.commerce_subscriptions.extend({
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
					status: commerceSubscriptionsDocs.commerce_subscription_invoices.fields.status,
					totalAmount: v.number(),
					currencyCode: v.string(),
					dueAt: v.optional(v.number()),
					paidAt: v.optional(v.number()),
					createdAt: v.number(),
				}),
			),
			nextChargeAt: v.optional(v.number()),
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
			entitlements: v.array(commerceSubscriptionsDocs.commerce_subscription_entitlements),
		}),
	),
	handler: async (ctx) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) return [];

		const contracts = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		const activeIsh = contracts.filter(
			(sub) => sub.status !== "cancelled" && sub.status !== "expired",
		);

		// Pre-resolve enrichment data for each contract in parallel.
		return Promise.all(
			activeIsh.map(async (contract) => {
				// Active item → current offer
				const items = await ctx.db
					.query("commerce_subscription_items")
					.withIndex("by_subscription", (q) =>
						q.eq("subscriptionId", contract._id),
					)
					.collect();
				const activeItem =
					items.find((it) => it.status === "active") ??
					items.find((it) => it.status === "pending_cancel") ??
					items[0];
				const offer =
					activeItem?.sourceOfferId != null
						? await ctx.db.get(activeItem.sourceOfferId)
						: null;

				// Product (at contract level)
				const product = contract.productId
					? await ctx.db.get(contract.productId)
					: null;

				// Most recent invoice
				const allInvoices = await ctx.db
					.query("commerce_subscription_invoices")
					.withIndex("by_subscription", (q) =>
						q.eq("subscriptionId", contract._id),
					)
					.collect();
				const currentInvoice =
					allInvoices
						.slice()
						.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

				// Membership grants sourced from this contract. The bridge stores the
				// contract id in sourceRef as a plain string.
				const grantsByUser = await ctx.db
					.query("membership_grants")
					.withIndex("by_user", (q) => q.eq("userId", user._id))
					.collect();
				const membershipGrants = grantsByUser.filter(
					(g) =>
						g.sourceType === "subscription" &&
						typeof g.sourceRef === "string" &&
						g.sourceRef === contract._id,
				);

				// Entitlements (active + grace — anything currently unlocking stuff)
				const allEntitlements = await ctx.db
					.query("commerce_subscription_entitlements")
					.withIndex("by_subscription", (q) =>
						q.eq("subscriptionId", contract._id),
					)
					.collect();
				const entitlements = allEntitlements.filter(
					(e) => e.status === "active" || e.status === "grace",
				);

				// Attach plan summaries for each grant so the UI can render without
				// another query. Membership plans live in `membership_plans`.
				const grantPlanIds = Array.from(
					new Set(membershipGrants.map((g) => g.planId)),
				);
				const plans = await Promise.all(
					grantPlanIds.map(async (planId) => {
						const plan = await ctx.db.get(planId);
						return plan
							? {
									_id: plan._id,
									name: plan.title,
									slug: plan.slug,
								}
							: null;
					}),
				);
				const planMap = new Map<
					Id<"membership_plans">,
					{ _id: Id<"membership_plans">; name: string; slug: string }
				>();
				for (const plan of plans) {
					if (plan) planMap.set(plan._id, plan);
				}

				return {
					...contract,
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
					product: product
						? {
								_id: product._id,
								title: product.title,
								slug: product.slug,
							}
						: null,
					currentInvoice: currentInvoice
						? {
								_id: currentInvoice._id,
								status: currentInvoice.status,
								totalAmount: currentInvoice.totalAmount,
								currencyCode: currentInvoice.currencyCode,
								dueAt: currentInvoice.dueAt,
								paidAt: currentInvoice.paidAt,
								createdAt: currentInvoice.createdAt,
							}
						: null,
					nextChargeAt: contract.nextBillingAt ?? contract.currentPeriodEndAt,
					membershipGrants: membershipGrants.map((g) => ({
						_id: g._id,
						planId: g.planId,
						plan: planMap.get(g.planId) ?? null,
						status: g.status,
						startsAt: g.startsAt,
						endsAt: g.endsAt,
						graceEndsAt: g.graceEndsAt,
					})),
					entitlements,
				};
			}),
		);
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
 * List the current user's invoices across all their contracts. Joins each
 * invoice with a compact subscription summary so the UI can group by contract.
 *
 * Returns `[]` for unauthenticated users.
 */
export const listMyInvoices = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(
		commerceSubscriptionsDocs.commerce_subscription_invoices.extend({
			subscription: v.object({
				_id: v.id("commerce_subscriptions"),
				status: commerceSubscriptionsDocs.commerce_subscriptions.fields.status,
				productId: v.optional(v.id("commerce_products")),
			}),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		await requireCommerceSubscriptionsEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) return [];

		const limit = args.limit ?? 100;

		// Gather all contracts owned by this user first — then collect invoices
		// per contract. This is the safe path because the invoices table indexes
		// by subscription, not by user.
		const contracts = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		if (contracts.length === 0) return [];

		const allInvoices: Array<
			Doc<"commerce_subscription_invoices"> & {
				subscription: {
					_id: Id<"commerce_subscriptions">;
					status: SubscriptionStatus;
					productId?: Id<"commerce_products">;
				};
			}
		> = [];
		for (const contract of contracts) {
			const invs = await ctx.db
				.query("commerce_subscription_invoices")
				.withIndex("by_subscription", (q) =>
					q.eq("subscriptionId", contract._id),
				)
				.collect();
			for (const inv of invs) {
				allInvoices.push({
					...inv,
					subscription: {
						_id: contract._id,
						status: contract.status,
						productId: contract.productId,
					},
				});
			}
		}

		allInvoices.sort((a, b) => b.createdAt - a.createdAt);
		return allInvoices.slice(0, limit);
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS — PAUSE / RESUME / CANCEL (thin wrappers)
// ═══════════════════════════════════════════════════════════════════════════
//
// These are intentionally thin pass-throughs over the admin-side mutations
// in `mutations.ts`, which already enforce "admin OR owner". We wrap rather
// than re-export so:
//
//   1. The website binds to a stable `portal.*` namespace distinct from
//      `mutations.*` — admin endpoints can evolve without breaking customer
//      UX (e.g., if admin pause later requires a reason code).
//
//   2. History records show `eventType: "subscription.portal_pause"` vs.
//      admin's `subscription.pause`, which makes audit trails clearer.
//
//   3. Each wrapper re-checks ownership on top of the underlying mutation's
//      check — defence in depth. The admin path calls requireCommerceSubscriptionsEnabled;
//      we duplicate that plus plugin gate here so a later refactor cannot
//      accidentally loosen portal auth.

/**
 * Customer-initiated pause. Writes a `subscription.portal_pause` history row
 * before delegating to the admin-side pause logic via the underlying status
 * transition.
 */
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

		if (contract.status === "paused") {
			return { ok: true, alreadyPaused: true };
		}
		// Only a contract in good standing can be paused by its owner. Pausing a
		// past_due, cancelled or expired contract and then resuming it would
		// restore entitlements without paying.
		if (contract.status !== "active" && contract.status !== "trialing") {
			throw new ConvexError({
				code: "INVALID_STATE",
				message: `Cannot pause a ${contract.status} subscription.`,
				currentStatus: contract.status,
			});
		}

		const correlationId = createCorrelationId();

		// Delegate the actual status transition to the admin path by calling its
		// helper directly. We can't invoke public mutations from a mutation, so
		// we replicate the transition inline. This mirrors `mutations.pause` but
		// tags the history eventType with "portal_" prefix.
		await ctx.db.patch("commerce_subscriptions", args.contractId, {
			status: "paused",
			pausedAt: Date.now(),
			updatedAt: Date.now(),
		});

		await writeHistory(ctx, {
			subscriptionId: args.contractId,
			eventType: "subscription.portal_pause",
			actorUserId: user._id,
			fromStatus: contract.status,
			toStatus: "paused",
			reason: args.reason,
			correlationId,
		});

		// Propagate status to entitlements + membership bridge.
		await syncEntitlementsForContract(ctx, args.contractId);

		return { ok: true, status: "paused" as const };
	},
});

/**
 * Customer-initiated resume from pause. Recomputes nextBillingAt if the
 * existing cycle end is already in the past.
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

		if (contract.status !== "paused") {
			throw new ConvexError({
				code: "INVALID_STATE",
				message: `Cannot resume from status "${contract.status}".`,
				currentStatus: contract.status,
			});
		}

		const now = Date.now();
		// A paid period that ended while paused is not re-granted for free: the
		// renewal falls due now and the renewal sweep charges it before a new
		// period starts.
		const nextBillingAt =
			contract.currentPeriodEndAt !== undefined && contract.currentPeriodEndAt > now
				? contract.currentPeriodEndAt
				: now;

		await ctx.db.patch("commerce_subscriptions", args.contractId, {
			status: "active",
			pausedAt: undefined,
			cancelAtPeriodEnd: false,
			cancelScheduledAt: undefined,
			nextBillingAt,
			currentPeriodEndAt: nextBillingAt,
			updatedAt: now,
		});

		const correlationId = createCorrelationId();
		await writeHistory(ctx, {
			subscriptionId: args.contractId,
			eventType: "subscription.portal_resume",
			actorUserId: user._id,
			fromStatus: contract.status,
			toStatus: "active",
			correlationId,
		});

		await syncEntitlementsForContract(ctx, args.contractId);

		return { ok: true, status: "active" as const, nextBillingAt };
	},
});

/**
 * Customer-initiated cancellation. Defaults to `scheduled` (cancel at period
 * end) unless `immediate: true`. Immediate cancel is a deliberate
 * escape-hatch — most UIs should only expose schedule-at-end.
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

		const now = Date.now();
		const correlationId = createCorrelationId();

		if (contract.status === "cancelled") {
			return { ok: true, alreadyCancelled: true };
		}

		if (args.immediate === true) {
			await ctx.db.patch("commerce_subscriptions", args.contractId, {
				status: "cancelled",
				cancelledAt: now,
				cancelAtPeriodEnd: false,
				updatedAt: now,
			});
			await writeHistory(ctx, {
				subscriptionId: args.contractId,
				eventType: "subscription.portal_cancel_now",
				actorUserId: user._id,
				fromStatus: contract.status,
				toStatus: "cancelled",
				reason: args.reason,
				correlationId,
			});

			await syncEntitlementsForContract(ctx, args.contractId);

			return { ok: true, status: "cancelled" as const, immediate: true };
		}

		// Schedule at period end. Only a contract in good standing (or paused)
		// can be scheduled: a scheduled cancellation can be resumed, so allowing
		// it from past_due/expired would be a path back to `active` unpaid.
		if (
			contract.status !== "active" &&
			contract.status !== "trialing" &&
			contract.status !== "paused" &&
			contract.status !== "pending_cancel"
		) {
			throw new ConvexError({
				code: "INVALID_STATE",
				message: `Cannot schedule cancellation of a ${contract.status} subscription. Cancel it immediately instead.`,
				currentStatus: contract.status,
			});
		}
		await ctx.db.patch("commerce_subscriptions", args.contractId, {
			status: "pending_cancel",
			cancelAtPeriodEnd: true,
			cancelScheduledAt: now,
			updatedAt: now,
		});
		await writeHistory(ctx, {
			subscriptionId: args.contractId,
			eventType: "subscription.portal_cancel_scheduled",
			actorUserId: user._id,
			fromStatus: contract.status,
			toStatus: "pending_cancel",
			reason: args.reason,
			correlationId,
		});

		return {
			ok: true,
			status: "pending_cancel" as const,
			immediate: false,
			effectiveAt: contract.currentPeriodEndAt,
		};
	},
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
			mode: v.literal("immediate"),
			invoiceId: v.union(v.null(), v.id("commerce_subscription_invoices")),
			netCharge: v.number(),
			proration: prorationResultValidator,
		}),
	),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await requireCommerceSubscriptionsEnabled(ctx);

		const { user, contract } = await requireOwnedContract(ctx, args.contractId);

		// Block plan change for terminal statuses.
		if (contract.status === "cancelled" || contract.status === "expired") {
			throw new ConvexError({
				code: "INVALID_STATE",
				message: `Cannot change plan on a ${contract.status} subscription.`,
				currentStatus: contract.status,
			});
		}

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

		const isUpgrade = proration.netCharge > 0;

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

		// Sync entitlements after the upgrade (new offer may have different codes).
		await syncEntitlementsForContract(ctx, args.contractId);

		return {
			ok: true,
			mode: "immediate" as const,
			invoiceId: upgradeResult.invoiceId,
			netCharge: proration.netCharge,
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

		const { invoice, items, subscription, offerTitle } = result;
		const currencyCode = invoice.currencyCode ?? "USD";

		const lines: string[] = [];
		lines.push("ConvexPress Subscription Invoice");
		lines.push("================================");
		lines.push("");
		lines.push(`Invoice:        ${invoice.invoiceNumber ?? invoice._id}`);
		lines.push(`Status:         ${invoice.status}`);
		lines.push(`Currency:       ${currencyCode}`);
		if (invoice.dueAt) {
			lines.push(`Due:            ${new Date(invoice.dueAt).toLocaleDateString("en-US")}`);
		}
		if (invoice.paidAt) {
			lines.push(`Paid:           ${new Date(invoice.paidAt).toLocaleDateString("en-US")}`);
		}
		lines.push(`Created:        ${new Date(invoice.createdAt).toLocaleDateString("en-US")}`);
		lines.push("");
		lines.push(`Subscription:   ${subscription?._id ?? "-"}`);
		if (offerTitle) {
			lines.push(`Plan:           ${offerTitle}`);
		}
		lines.push("");
		lines.push("Line Items");
		lines.push("----------");
		for (const item of items) {
			const qty = item.quantity;
			lines.push(`  ${item.description}`);
			lines.push(
				`    qty=${qty}  unit=${formatMoney(item.unitAmount, currencyCode)}  total=${formatMoney(item.lineTotalAmount, currencyCode)}  (${item.lineType ?? "line"})`,
			);
		}
		lines.push("");
		lines.push("Totals");
		lines.push("------");
		lines.push(`  Subtotal:     ${formatMoney(invoice.subtotalAmount, currencyCode)}`);
		lines.push(`  Tax:          ${formatMoney(invoice.taxAmount, currencyCode)}`);
		lines.push(`  Total:        ${formatMoney(invoice.totalAmount, currencyCode)}`);

		return {
			ok: true,
			format: "pdf",
			filename: `invoice-${invoice.invoiceNumber ?? invoice._id}.pdf`,
			content: buildSimplePdf(lines),
			contentType: "application/pdf",
		};
	},
});
