/**
 * Membership — Queries
 *
 * ConvexPress membership runtime. Unlike commerce subscriptions (ported from
 * VexCart), membership is ConvexPress's own design. It uses the subscription
 * system's `checkEntitlement` for subscription-linked plans.
 *
 * Functions:
 *   - listPlans                    List all membership plans (admin)
 *   - listPublicPlans              List published plans for public display
 *   - getPlan                      Single plan detail with benefits
 *   - listGrants                   List membership grants (admin, with user enrichment)
 *   - getMember                    Single member detail with grants (admin)
 *   - getMyMembership              Current user's active membership
 *   - listRestrictions             List content restriction rules (admin)
 *   - listRestrictionsByResource   Rules attached to a specific resource (admin)
 *   - checkAccess                  Pure read: access decision (no writes)
 *   - checkAccessAndLog            Mutation: access decision + deferred log write
 *   - getStats                     Membership dashboard stats
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { membershipDocs } from "../schema/membership.docs.generated";
import { usersDocs } from "../schema/users.docs.generated";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { isPluginEnabled } from "../helpers/plugins";
import {
	membershipGrantStatusValidator,
	membershipTables,
	membershipPlanStatusValidator,
} from "../schema/membership";
import { evaluateMembershipAccess } from "./access";
import {
	getDisplayableBenefitsForCodesHelper,
	getDisplayableBenefitsForPlanHelper,
	requireMembershipEnabled,
} from "./helpers";
import {
	displayableBenefitValidator,
	membershipResourceTypeValidator,
} from "./validators";

const planSummaryValidator = v.object({
	_id: v.id("membership_plans"),
	title: v.string(),
	slug: v.string(),
});

const memberUserSummaryValidator = v.object({
	_id: v.id("users"),
	email: v.string(),
	firstName: v.optional(v.string()),
	lastName: v.optional(v.string()),
	displayName: v.optional(v.string()),
	avatarUrl: v.optional(v.string()),
});

const memberGrantValidator = membershipDocs.membership_grants.extend({
	plan: v.union(
		v.null(),
		v.object({
			_id: v.id("membership_plans"),
			title: v.string(),
			slug: v.string(),
			priority: v.number(),
		}),
	),
});

const publicBenefitValidator = v.object({
	_id: v.id("membership_plan_benefits"),
	code: v.string(),
	label: v.string(),
	description: v.optional(v.string()),
	displayAsFeature: v.optional(v.boolean()),
});

const myGrantValidator = membershipDocs.membership_grants.extend({
	plan: v.union(
		v.null(),
		v.object({
			_id: v.id("membership_plans"),
			title: v.string(),
			slug: v.string(),
			description: v.optional(v.string()),
			priority: v.number(),
		}),
	),
	benefits: v.array(publicBenefitValidator),
});

const ruleWithPlansValidator = membershipDocs.membership_restriction_rules.extend({
	plans: v.array(planSummaryValidator),
});

async function loadPlanSummaries(
	ctx: { db: QueryCtx["db"] },
	planIds: Id<"membership_plans">[],
) {
	const plans = await Promise.all(
		planIds.map(async (pid) => {
			const plan = await ctx.db.get(pid);
			return plan ? { _id: plan._id, title: plan.title, slug: plan.slug } : null;
		}),
	);
	return plans.filter(
		(plan): plan is { _id: Id<"membership_plans">; title: string; slug: string } =>
			plan !== null,
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List all membership plans (admin).
 * Supports optional status filter. Returns plans sorted by priority (asc).
 */
export const listPlans = query({
	args: {
		status: v.optional(membershipPlanStatusValidator),
	},
	returns: v.union(
		v.null(),
		v.array(
			membershipDocs.membership_plans.extend({
				benefitCount: v.number(),
				activeGrantCount: v.number(),
			}),
		),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);
		await requireCan(ctx, "manage_options");

		let plans: Doc<"membership_plans">[];

		const status = args.status;
		if (status) {
			plans = await ctx.db
				.query("membership_plans")
				.withIndex("by_status", (q) => q.eq("status", status))
				.collect();
		} else {
			plans = await ctx.db.query("membership_plans").collect();
		}

		// Enrich with benefit count and active grant count
		const enriched = await Promise.all(
			plans.map(async (plan) => {
				const benefits = await ctx.db
					.query("membership_plan_benefits")
					.withIndex("by_plan", (q) => q.eq("planId", plan._id))
					.collect();

				const grants = await ctx.db
					.query("membership_grants")
					.withIndex("by_plan", (q) => q.eq("planId", plan._id))
					.collect();

				const activeGrants = grants.filter(
					(g) => g.status === "active" || g.status === "grace",
				);

				return {
					...plan,
					benefitCount: benefits.length,
					activeGrantCount: activeGrants.length,
				};
			}),
		);

		return enriched.sort((a, b) => a.priority - b.priority);
	},
});

/**
 * List published (active) plans for public display.
 * Returns plans with their benefits, sorted by priority.
 * No auth required — this is for the public-facing membership page.
 */
const publicPlanFields = membershipTables.membership_plans.validator.fields;
const publicBenefitFields = membershipTables.membership_plan_benefits.validator.fields;
export const listPublicPlans = query({
	args: {},
	returns: v.union(v.null(), v.array(v.object({
		_id: v.id("membership_plans"),
		title: publicPlanFields.title,
		slug: publicPlanFields.slug,
		description: publicPlanFields.description,
		grantMode: publicPlanFields.grantMode,
		linkedSubscriptionCode: publicPlanFields.linkedSubscriptionCode,
		priority: publicPlanFields.priority,
		benefits: v.array(v.object({
			_id: v.id("membership_plan_benefits"),
			code: publicBenefitFields.code,
			label: publicBenefitFields.label,
			description: publicBenefitFields.description,
			displayAsFeature: publicBenefitFields.displayAsFeature,
		})),
	}))),
	handler: async (ctx) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);

		const plans = await ctx.db
			.query("membership_plans")
			.withIndex("by_status", (q) => q.eq("status", "active"))
			.collect();

		const enriched = await Promise.all(
			plans.map(async (plan) => {
				const benefits = await ctx.db
					.query("membership_plan_benefits")
					.withIndex("by_plan", (q) => q.eq("planId", plan._id))
					.collect();

				return {
					_id: plan._id,
					title: plan.title,
					slug: plan.slug,
					description: plan.description,
					grantMode: plan.grantMode,
					linkedSubscriptionCode: plan.linkedSubscriptionCode,
					priority: plan.priority,
					benefits: benefits.map((b) => ({
						_id: b._id,
						code: b.code,
						label: b.label,
						description: b.description,
						displayAsFeature: b.displayAsFeature,
					})),
				};
			}),
		);

		return enriched.sort((a, b) => a.priority - b.priority);
	},
});

/**
 * Get single plan detail with benefits.
 */
export const getPlan = query({
	args: {
		planId: v.id("membership_plans"),
	},
	returns: v.union(
		v.null(),
		membershipDocs.membership_plans.extend({
			benefits: v.array(membershipDocs.membership_plan_benefits),
			linkedRole: v.union(
				v.null(),
				v.object({ _id: v.id("roles"), name: v.string(), slug: v.string() }),
			),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);

		const plan = await ctx.db.get(args.planId);
		if (!plan) return null;

		const benefits = await ctx.db
			.query("membership_plan_benefits")
			.withIndex("by_plan", (q) => q.eq("planId", plan._id))
			.collect();

		// Resolve linked role if present
		let linkedRole: { _id: Doc<"roles">["_id"]; name: string; slug: string } | null = null;
		if (plan.linkedRoleId) {
			const role = await ctx.db.get(plan.linkedRoleId);
			if (role) {
				linkedRole = {
					_id: role._id,
					name: role.name,
					slug: role.slug,
				};
			}
		}

		return {
			...plan,
			benefits,
			linkedRole,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// GRANT QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List membership grants (admin, with user and plan enrichment).
 */
export const listGrants = query({
	args: {
		planId: v.optional(v.id("membership_plans")),
		status: v.optional(membershipGrantStatusValidator),
		userId: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	returns: v.array(
		membershipDocs.membership_grants.extend({
			user: v.union(v.null(), memberUserSummaryValidator),
			plan: v.union(v.null(), planSummaryValidator),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return [];
		await requireMembershipEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const limit = args.limit ?? 100;
		let grants: Doc<"membership_grants">[] = [];

		const { userId, planId } = args;
		if (userId) {
			grants = await ctx.db
				.query("membership_grants")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect();
		} else if (planId) {
			grants = await ctx.db
				.query("membership_grants")
				.withIndex("by_plan", (q) => q.eq("planId", planId))
				.collect();
		} else {
			grants = await ctx.db.query("membership_grants").collect();
		}

		// Apply status filter
		if (args.status) {
			grants = grants.filter((g) => g.status === args.status);
		}

		// Sort by creation date descending and limit
		grants = grants
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, limit);

		// Enrich with user and plan data
		return Promise.all(
			grants.map(async (grant) => {
				const user = await ctx.db.get(grant.userId);
				const plan = await ctx.db.get(grant.planId);

				return {
					...grant,
					user: user
						? {
								_id: user._id,
								email: user.email,
								firstName: user.firstName,
								lastName: user.lastName,
								displayName: user.displayName,
								avatarUrl: user.avatarUrl ?? user.profilePictureUrl,
							}
						: null,
					plan: plan
						? {
								_id: plan._id,
								title: plan.title,
								slug: plan.slug,
							}
						: null,
				};
			}),
		);
	},
});

/**
 * Get current user's active membership grant(s).
 * Returns active and grace-period grants with plan details.
 */
export const getMyMembership = query({
	args: {},
	returns: v.union(
		v.null(),
		v.object({
			primaryGrant: myGrantValidator,
			allGrants: v.array(myGrantValidator),
		}),
	),
	handler: async (ctx) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);

		const user = await getCurrentUser(ctx);
		if (!user) return null;

		// Get active + grace grants
		const activeGrants = await ctx.db
			.query("membership_grants")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", user._id).eq("status", "active"),
			)
			.collect();

		const graceGrants = await ctx.db
			.query("membership_grants")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", user._id).eq("status", "grace"),
			)
			.collect();

		const allGrants = [...activeGrants, ...graceGrants];

		if (allGrants.length === 0) return null;

		// Filter out expired grace-period grants
		const now = Date.now();
		const validGrants = allGrants.filter((g) => {
			if (g.status === "grace" && g.graceEndsAt && g.graceEndsAt < now) {
				return false;
			}
			if (g.endsAt && g.endsAt < now && g.status !== "grace") {
				return false;
			}
			return true;
		});

		if (validGrants.length === 0) return null;

		// Enrich with plan details and benefits
		const enriched = await Promise.all(
			validGrants.map(async (grant) => {
				const plan = await ctx.db.get(grant.planId);
				let benefits: Doc<"membership_plan_benefits">[] = [];
				if (plan) {
					benefits = await ctx.db
						.query("membership_plan_benefits")
						.withIndex("by_plan", (q) => q.eq("planId", plan._id))
						.collect();
				}

				return {
					...grant,
					plan: plan
						? {
								_id: plan._id,
								title: plan.title,
								slug: plan.slug,
								description: plan.description,
								priority: plan.priority,
							}
						: null,
					benefits: benefits.map((b) => ({
						_id: b._id,
						code: b.code,
						label: b.label,
						description: b.description,
						displayAsFeature: b.displayAsFeature,
					})),
				};
			}),
		);

		// Return the highest-priority plan's grant first
		enriched.sort(
			(a, b) => (a.plan?.priority ?? 999) - (b.plan?.priority ?? 999),
		);

		const [primaryGrant] = enriched;
		if (!primaryGrant) return null;
		return {
			primaryGrant,
			allGrants: enriched,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE MEMBER DETAIL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a single member's detail (admin).
 * Returns the user with all their membership grants and plan info.
 */
export const getMember = query({
	args: {
		userId: v.id("users"),
	},
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id("users"),
			email: v.string(),
			firstName: v.optional(v.string()),
			lastName: v.optional(v.string()),
			displayName: v.optional(v.string()),
			avatarUrl: v.optional(v.string()),
			status: usersDocs.users.fields.status,
			grants: v.array(memberGrantValidator),
			activeGrants: v.array(memberGrantValidator),
			totalGrants: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const user = await ctx.db.get(args.userId);
		if (!user) return null;

		const grants = await ctx.db
			.query("membership_grants")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.collect();

		// Enrich grants with plan details
		const enrichedGrants = await Promise.all(
			grants.map(async (grant) => {
				const plan = await ctx.db.get(grant.planId);
				return {
					...grant,
					plan: plan
						? {
								_id: plan._id,
								title: plan.title,
								slug: plan.slug,
								priority: plan.priority,
							}
						: null,
				};
			}),
		);

		const activeGrants = enrichedGrants.filter(
			(g) => g.status === "active" || g.status === "grace",
		);

		return {
			_id: user._id,
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
			displayName: user.displayName,
			avatarUrl: user.avatarUrl ?? user.profilePictureUrl,
			status: user.status,
			grants: enrichedGrants.sort(
				(a, b) => b.createdAt - a.createdAt,
			),
			activeGrants,
			totalGrants: grants.length,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// RESTRICTION RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List content restriction rules (admin).
 * Returns rules with enriched plan names.
 */
export const listRestrictions = query({
	args: {
		resourceType: v.optional(membershipResourceTypeValidator),
	},
	returns: v.union(v.null(), v.array(ruleWithPlansValidator)),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);
		await requireCan(ctx, "manage_options");

		let rules: Doc<"membership_restriction_rules">[];

		if (args.resourceType) {
			// Filter by resource type — scan by_resource index prefix
			rules = await ctx.db.query("membership_restriction_rules").collect();
			rules = rules.filter((r) => r.resourceType === args.resourceType);
		} else {
			rules = await ctx.db.query("membership_restriction_rules").collect();
		}

		// Enrich with plan titles
		const enriched = await Promise.all(
			rules.map(async (rule) => ({
				...rule,
				plans: await loadPlanSummaries(ctx, rule.planIds),
			})),
		);

		return enriched.sort((a, b) => b.createdAt - a.createdAt);
	},
});

/**
 * List restriction rules attached to a specific resource (admin).
 *
 * Returns every rule indexed by (resourceType, resourceIdOrKey). Used by the
 * post/page metabox to prefill the rule editor and by the rule list to show
 * per-resource badges. Handles all 5 resource types.
 */
export const listRestrictionsByResource = query({
	args: {
		resourceType: membershipResourceTypeValidator,
		resourceIdOrKey: v.string(),
	},
	returns: v.union(v.null(), v.array(ruleWithPlansValidator)),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const rules = await ctx.db
			.query("membership_restriction_rules")
			.withIndex("by_resource", (q) =>
				q
					.eq("resourceType", args.resourceType)
					.eq("resourceIdOrKey", args.resourceIdOrKey),
			)
			.collect();

		// Enrich with plan summaries
		const enriched = await Promise.all(
			rules.map(async (rule) => ({
				...rule,
				plans: await loadPlanSummaries(ctx, rule.planIds),
			})),
		);

		return enriched.sort((a, b) => a.createdAt - b.createdAt);
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a user has access to a specific resource.
 *
 * Looks up restriction rules for the given resource. If no rules exist,
 * access is allowed by default. If rules exist, checks the user's active
 * membership grants against the required plans.
 *
 * Pure read — does NOT write to the access log. Callers that want to record
 * the check should also dispatch `recordAccessCheck` (internal mutation).
 *
 * Returns an access decision with teaser mode info for gated content.
 */
export const checkAccess = query({
	args: {
		resourceType: membershipResourceTypeValidator,
		resourceIdOrKey: v.string(),
	},
	returns: v.object({
   allowed: v.boolean(),
   reason: v.string(),
   teaserMode: v.union(v.null(), v.literal("excerpt"), v.literal("hide"), v.literal("custom_message")),
   customMessage: v.union(v.null(), v.string()),
   matchingPlanIds: v.array(v.string()),
 }),
	handler: async (ctx, args) => {
		return await evaluateMembershipAccess(ctx, args);
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// checkAccessAndLog (access check + deferred log write)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mutation wrapper around `checkAccess` that also persists the access
 * decision to `membership_access_log` (if `logAccessChecks` is enabled).
 *
 * Use this instead of `checkAccess` on high-value gated routes (e.g.,
 * SSR route restriction, product pages) where you want an audit trail.
 * For lightweight "can I show the upgrade button?" reads, `checkAccess`
 * is still fine and avoids an unnecessary write.
 *
 * Returns the same shape as `checkAccess`.
 */
export const checkAccessAndLog = mutation({
	args: {
		resourceType: membershipResourceTypeValidator,
		resourceIdOrKey: v.string(),
	},
	returns: v.object({
   allowed: v.boolean(),
   reason: v.string(),
   teaserMode: v.union(v.null(), v.literal("excerpt"), v.literal("hide"), v.literal("custom_message")),
   customMessage: v.union(v.null(), v.string()),
   matchingPlanIds: v.array(v.string()),
 }),
	handler: async (ctx, args) => {
		const result = await evaluateMembershipAccess(ctx, args);
		if (result.reason === "plugin_disabled") {
			return result;
		}

		const user = await getCurrentUser(ctx);
		await ctx.scheduler.runAfter(
			0,
			internal.membership.internals.recordAccessCheck,
			{
				userId: user?._id,
				resourceType: args.resourceType,
				resourceIdOrKey: args.resourceIdOrKey,
				allowed: result.allowed,
				reason: result.reason,
				matchingPlanIds: result.matchingPlanIds.flatMap((planId) => {
					const normalized = ctx.db.normalizeId("membership_plans", planId);
					return normalized ? [normalized] : [];
				}),
			},
		);

		return result;
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PRICING PAGE — BENEFIT DISPLAY QUERIES (Wave 6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return displayable benefits for a single membership plan.
 *
 * A benefit is included when `displayAsFeature !== false`; absence of the
 * field is treated as TRUE per Wave 1 schema convention.
 *
 * Public — no auth required. Plugin-gated: returns [] when membership is
 * disabled so pricing pages degrade gracefully.
 *
 * Shape: Array<{ _id, label, description?, sourcePlanId }>
 */
export const getDisplayableBenefitsForPlan = query({
	args: {
		planId: v.id("membership_plans"),
	},
	returns: v.array(displayableBenefitValidator),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return [];
		return getDisplayableBenefitsForPlanHelper(ctx, args.planId);
	},
});

/**
 * Return displayable benefits for a set of subscription entitlement codes.
 *
 * For each code, resolves `membership_plans` where `linkedSubscriptionCode
 * === code` AND `status === "active"`. Collects displayable benefits from all
 * matching plans, then dedupes by `label` (first occurrence wins; codes are
 * iterated in input order for determinism).
 *
 * Public — no auth required. Plugin-gated: returns [] when membership is
 * disabled. Returns [] on empty input without touching the DB.
 *
 * Shape: Array<{ _id, label, description?, sourcePlanId }>
 */
export const getDisplayableBenefitsForEntitlementCodes = query({
	args: {
		codes: v.array(v.string()),
	},
	returns: v.array(displayableBenefitValidator),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return [];
		return getDisplayableBenefitsForCodesHelper(ctx, args.codes);
	},
});

/**
 * Membership dashboard stats (admin).
 */
export const getStats = query({
	args: {},
	returns: v.union(v.null(), v.object({
   totalPlans: v.number(),
   activePlans: v.number(),
   totalGrants: v.number(),
   activeGrants: v.number(),
   graceGrants: v.number(),
   revokedGrants: v.number(),
   expiredGrants: v.number(),
   expiringSoon: v.number(),
   totalRestrictionRules: v.number(),
   planBreakdown: v.array(v.object({
     planId: v.id("membership_plans"),
     title: v.string(),
     slug: v.string(),
     activeMembers: v.number(),
   })),
 })),
	handler: async (ctx) => {
		if (!(await isPluginEnabled(ctx, "membership"))) return null;
		await requireMembershipEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const now = Date.now();
		const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

		// Plans
		const plans = await ctx.db.query("membership_plans").collect();
		const activePlans = plans.filter((p) => p.status === "active");

		// Grants
		const grants = await ctx.db.query("membership_grants").collect();
		const activeGrants = grants.filter((g) => g.status === "active");
		const graceGrants = grants.filter((g) => g.status === "grace");
		const revokedGrants = grants.filter((g) => g.status === "revoked");
		const expiredGrants = grants.filter((g) => g.status === "expired");

		// Expiring soon: active grants with endsAt within 30 days
		const expiringSoon = activeGrants.filter(
			(g) => g.endsAt && g.endsAt > now && g.endsAt <= thirtyDaysFromNow,
		);

		// Restriction rules
		const rules = await ctx.db.query("membership_restriction_rules").collect();

		// Plans breakdown
		const planBreakdown = await Promise.all(
			activePlans.map(async (plan) => {
				const planGrants = grants.filter(
					(g) =>
						g.planId === plan._id &&
						(g.status === "active" || g.status === "grace"),
				);
				return {
					planId: plan._id,
					title: plan.title,
					slug: plan.slug,
					activeMembers: planGrants.length,
				};
			}),
		);

		return {
			totalPlans: plans.length,
			activePlans: activePlans.length,
			totalGrants: grants.length,
			activeGrants: activeGrants.length,
			graceGrants: graceGrants.length,
			revokedGrants: revokedGrants.length,
			expiredGrants: expiredGrants.length,
			expiringSoon: expiringSoon.length,
			totalRestrictionRules: rules.length,
			planBreakdown,
		};
	},
});
