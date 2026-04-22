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
 *     - getInvoicePdf   Return a text-format placeholder "invoice PDF".
 *
 * The existing admin-side pause / resume / scheduleCancel / cancelNow already
 * accept non-admin callers and verify `user._id === subscription.userId`, so
 * the portal wrappers simply delegate. They exist as thin wrappers (not
 * re-exports) so the website calls a stable `portal.*` API surface that is
 * distinct from the admin API surface.
 *
 * `@ts-nocheck` matches the rest of the commerceSubscriptions backend.
 * Wave 7 removes it across all subscriptions files in one pass.
 */

import { ConvexError, v } from "convex/values";

import { action, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { getCurrentUser } from "../helpers/auth";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { validateCoupon, initializeRedemption } from "../helpers/coupons";
import { computeProration } from "../helpers/proration";
import { decideBridgeCall } from "./bridgeDecisions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";

// ─── Local helpers ──────────────────────────────────────────────────────────

type BillingInterval = "week" | "month" | "year";

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
  return `pt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
  ctx: any,
  subscriptionId: any,
  gracePeriodDays = 3,
) {
  const subscription = await ctx.db.get(subscriptionId);
  if (!subscription) return;
  const now = Date.now();

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

  // Bridge propagation — gated by plugin flags + acceptSubscriptionGrants.
  const membershipOn = await isPluginEnabled(ctx, "membership");
  if (!membershipOn) return;
  try {
    const settingsRow = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: any) => q.eq("section", "membership"))
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
    .withIndex("by_subscription", (q: any) =>
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
  ctx: any,
  contractId: any,
): Promise<{ user: any; contract: any }> {
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getPublicOffer = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    offerId: v.id("commerce_subscription_offers"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getMyActiveContracts = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
    await requireCommerceSubscriptionsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const contracts = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    const activeIsh = contracts.filter(
      (sub: any) => sub.status !== "cancelled" && sub.status !== "expired",
    );

    // Pre-resolve enrichment data for each contract in parallel.
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return Promise.all(
      activeIsh.map(async (contract: any) => {
        // Active item → current offer
        const items = await ctx.db
          .query("commerce_subscription_items")
          .withIndex("by_subscription", (q: any) =>
            q.eq("subscriptionId", contract._id),
          )
          .collect();
        const activeItem =
          items.find((it: any) => it.status === "active") ??
          items.find((it: any) => it.status === "pending_cancel") ??
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
          .withIndex("by_subscription", (q: any) =>
            q.eq("subscriptionId", contract._id),
          )
          .collect();
        const currentInvoice =
          allInvoices
            .slice()
            .sort((a: any, b: any) => b.createdAt - a.createdAt)[0] ?? null;

        // Membership grants sourced from this contract. The bridge stores the
        // contract id in sourceRef as a plain string.
        const grantsByUser = await ctx.db
          .query("membership_grants")
          .withIndex("by_user", (q: any) => q.eq("userId", user._id))
          .collect();
        const membershipGrants = grantsByUser.filter(
          (g: any) =>
            g.sourceType === "subscription" &&
            typeof g.sourceRef === "string" &&
            g.sourceRef === contract._id,
        );

        // Entitlements (active + grace — anything currently unlocking stuff)
        const allEntitlements = await ctx.db
          .query("commerce_subscription_entitlements")
          .withIndex("by_subscription", (q: any) =>
            q.eq("subscriptionId", contract._id),
          )
          .collect();
        const entitlements = allEntitlements.filter(
          (e: any) => e.status === "active" || e.status === "grace",
        );

        // Attach plan summaries for each grant so the UI can render without
        // another query. Membership plans live in `membership_plans`.
        const grantPlanIds = Array.from(
          new Set(
            membershipGrants
              .map((g: any) => g.planId)
              .filter((p: any) => p != null),
          ),
        );
        const plans = await Promise.all(
          grantPlanIds.map(async (planId: any) => {
            const plan = await ctx.db.get(planId);
            return plan
              ? {
                  _id: plan._id,
                  name: plan.name,
                  slug: plan.slug,
                }
              : null;
          }),
        );
        const planMap = new Map(
          plans
            // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
            .filter((p): p is any => p != null)
            .map((p: any) => [p._id, p]),
        );

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
                title: product.title ?? product.name,
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
          membershipGrants: membershipGrants.map((g: any) => ({
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const previewPlanChange = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    toOfferId: v.id("commerce_subscription_offers"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.contractId),
      )
      .collect();
    const activeItem = items.find(
      (it: any) => it.status === "active" || it.status === "pending_cancel",
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
      contract.currentPeriodEndAt ??
      cycleStart + 30 * 24 * 60 * 60 * 1000;
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const listMyInvoices = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    limit: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    if (contracts.length === 0) return [];

    const allInvoices: any[] = [];
    for (const contract of contracts) {
      const invs = await ctx.db
        .query("commerce_subscription_invoices")
        .withIndex("by_subscription", (q: any) =>
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

    allInvoices.sort((a: any, b: any) => b.createdAt - a.createdAt);
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const requestPauseContract = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    reason: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const { user, contract } = await requireOwnedContract(
      ctx,
      args.contractId,
    );

    if (contract.status === "paused") {
      return { ok: true, alreadyPaused: true };
    }

    const correlationId = createCorrelationId();

    // Delegate the actual status transition to the admin path by calling its
    // helper directly. We can't invoke public mutations from a mutation, so
    // we replicate the transition inline. This mirrors `mutations.pause` but
    // tags the history eventType with "portal_" prefix.
    await ctx.db.patch(args.contractId, {
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const requestResumeContract = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const { user, contract } = await requireOwnedContract(
      ctx,
      args.contractId,
    );

    if (contract.status !== "paused") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `Cannot resume from status "${contract.status}".`,
        currentStatus: contract.status,
      });
    }

    const now = Date.now();
    const nextBillingAt =
      (contract.currentPeriodEndAt ?? 0) < now
        ? addBillingPeriod(
            now,
            (contract.billingInterval ?? "month") as BillingInterval,
            contract.billingIntervalCount ?? 1,
          )
        : contract.currentPeriodEndAt;

    await ctx.db.patch(args.contractId, {
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const requestCancelContract = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    immediate: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    reason: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const { user, contract } = await requireOwnedContract(
      ctx,
      args.contractId,
    );

    const now = Date.now();
    const correlationId = createCorrelationId();

    if (contract.status === "cancelled") {
      return { ok: true, alreadyCancelled: true };
    }

    if (args.immediate === true) {
      await ctx.db.patch(args.contractId, {
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

    // Schedule at period end.
    await ctx.db.patch(args.contractId, {
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
 *     creates proration_event + invoice + charges immediately via payment stub.
 *   - Downgrade (netCharge <= 0): calls `proration.applyDowngradeProration` —
 *     stores `scheduledOfferChange` on the contract. No immediate charge.
 *     Renewal cron applies it at next cycle boundary (renewal.ts step 1.e).
 *
 * Ownership enforced. No-op if toOfferId matches the current offer — throws
 * `VALIDATION_ERROR` to make misclicks visible in the UI.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const requestPlanChange = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    toOfferId: v.id("commerce_subscription_offers"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const { user, contract } = await requireOwnedContract(
      ctx,
      args.contractId,
    );

    // Block plan change for terminal statuses.
    if (
      contract.status === "cancelled" ||
      contract.status === "expired"
    ) {
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

    // Resolve the current (from) offer via the active item.
    const items = await ctx.db
      .query("commerce_subscription_items")
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.contractId),
      )
      .collect();
    const activeItem = items.find(
      (it: any) => it.status === "active" || it.status === "pending_cancel",
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
      contract.currentPeriodEndAt ??
      cycleStart + 30 * 24 * 60 * 60 * 1000;

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
    // payment stub, and item swap.
    const upgradeResult: {
      invoiceId: string | null;
      success: boolean;
      error?: string;
    } = await ctx.runMutation(
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const applyCouponToMyContract = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
    couponCode: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const { user, contract } = await requireOwnedContract(
      ctx,
      args.contractId,
    );

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
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.contractId),
      )
      .collect();
    const activeItem = items.find(
      (it: any) => it.status === "active" || it.status === "pending_cancel",
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
 * Return a plain-text "invoice document" that the website can serve as a
 * downloadable file. Real PDF rendering lands in Wave 7 (via Chromium headless
 * or a receipt template). For now the website simply presents the returned
 * text as a .txt download — customers still have a record they can save.
 *
 * Runs as an action (not a query) because Wave 7 will add network calls to
 * a PDF service.
 *
 * Ownership verified via a query call — actions cannot read the DB directly.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getInvoicePdf = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    invoiceId: v.id("commerce_subscription_invoices"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<{
    ok: true;
    format: "text";
    filename: string;
    content: string;
  }> => {
    const result: any = await ctx.runQuery(
      internal.commerceSubscriptions.internals.getMyInvoiceForPdf,
      { invoiceId: args.invoiceId },
    );
    if (!result) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Invoice not found or not accessible.",
      });
    }

    // Render a simple text representation. Stable layout so customers can
    // diff them, but clearly labelled as a placeholder.
    const { invoice, items, subscription, offerTitle } = result;

    const lines: string[] = [];
    lines.push("ConvexPress Subscription Invoice");
    lines.push("================================");
    lines.push("");
    lines.push(`Invoice ID:     ${invoice._id}`);
    lines.push(`Status:         ${invoice.status}`);
    lines.push(`Currency:       ${invoice.currencyCode}`);
    if (invoice.dueAt) {
      lines.push(`Due:            ${new Date(invoice.dueAt).toISOString()}`);
    }
    if (invoice.paidAt) {
      lines.push(`Paid:           ${new Date(invoice.paidAt).toISOString()}`);
    }
    lines.push(`Created:        ${new Date(invoice.createdAt).toISOString()}`);
    lines.push("");
    lines.push(`Subscription:   ${subscription?._id ?? "-"}`);
    if (offerTitle) {
      lines.push(`Plan:           ${offerTitle}`);
    }
    lines.push("");
    lines.push("Line Items");
    lines.push("----------");
    for (const item of items) {
      const qty = item.quantity ?? 1;
      const unit = item.unitAmount.toFixed(2);
      const total = item.lineTotalAmount.toFixed(2);
      lines.push(`  ${item.description}`);
      lines.push(
        `    qty=${qty}  unit=${unit}  total=${total}  (${item.lineType ?? "line"})`,
      );
    }
    lines.push("");
    lines.push("Totals");
    lines.push("------");
    lines.push(`  Subtotal:     ${invoice.subtotalAmount.toFixed(2)}`);
    lines.push(`  Tax:          ${invoice.taxAmount.toFixed(2)}`);
    lines.push(`  Total:        ${invoice.totalAmount.toFixed(2)}`);
    lines.push("");
    lines.push("(This is a placeholder plain-text receipt.");
    lines.push(" Real PDF rendering lands in a later release.)");

    return {
      ok: true,
      format: "text",
      filename: `invoice-${invoice._id}.txt`,
      content: lines.join("\n"),
    };
  },
});
