import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isMembershipPluginEnabled } from "../commerce/helpers";
import { currentUserCan, getCurrentUser } from "../helpers/permissions";

type MembershipCtx = QueryCtx | MutationCtx;

export type MembershipResourceType =
	| "page"
	| "post"
	| "route"
	| "product"
	| "course"
	| "block";

export type MembershipTeaserMode = "hide" | "excerpt" | "custom_message";

export interface MembershipRuleLike {
	resourceType?: MembershipResourceType;
	resourceIdOrKey?: string;
	ruleMode: "allow_only" | "deny_if_missing";
	planIds?: Array<string | Id<"membership_plans">>;
	requiredCapabilities?: string[];
	teaserMode?: MembershipTeaserMode | null;
	customMessage?: string | null;
	loginRequired?: boolean;
}

export interface MembershipAccessDecision {
	allowed: boolean;
	reason: string;
	teaserMode: MembershipTeaserMode | null;
	customMessage: string | null;
	matchingPlanIds: string[];
}

interface PrincipalAccessInput {
	isAuthenticated: boolean;
	userPlanIds: string[];
	capabilities: string[];
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
	return Array.from(
		new Set(
			values
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter(Boolean),
		),
	);
}

function normalizePathname(pathname: string): string {
	const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
	if (withLeadingSlash === "/") return "/";
	return withLeadingSlash.replace(/\/+$/, "");
}

function collectRulePlanIds(rules: MembershipRuleLike[]): string[] {
	return uniqueStrings(
		rules.flatMap((rule) =>
			(rule.planIds ?? []).map((planId) => String(planId)),
		),
	);
}

function denialPayload(
	rule: MembershipRuleLike | undefined,
	reason: string,
	matchingPlanIds: string[],
): MembershipAccessDecision {
	return {
		allowed: false,
		reason,
		teaserMode: rule?.teaserMode ?? "hide",
		customMessage: rule?.customMessage ?? null,
		matchingPlanIds,
	};
}

function evaluateRule(
	rule: MembershipRuleLike,
	principal: PrincipalAccessInput,
): {
	satisfied: boolean;
	matchingPlanIds: string[];
	missingPlan: boolean;
	missingCapabilities: string[];
} {
	const requiredPlanIds = uniqueStrings(
		(rule.planIds ?? []).map((planId) => String(planId)),
	);
	const requiredCapabilities = uniqueStrings(rule.requiredCapabilities ?? []);
	const planSet = new Set(principal.userPlanIds);
	const capabilitySet = new Set(principal.capabilities);

	const matchingPlanIds = requiredPlanIds.filter((planId) =>
		planSet.has(planId),
	);
	const missingCapabilities = requiredCapabilities.filter(
		(capability) => !capabilitySet.has(capability),
	);

	const plansSatisfied =
		requiredPlanIds.length === 0 || matchingPlanIds.length > 0;
	const capabilitiesSatisfied = missingCapabilities.length === 0;

	return {
		satisfied: plansSatisfied && capabilitiesSatisfied,
		matchingPlanIds,
		missingPlan: !plansSatisfied,
		missingCapabilities,
	};
}

function denialReasonFromFailure(input: {
	missingPlan: boolean;
	missingCapabilities: string[];
	allowOnly: boolean;
}): string {
	if (input.missingPlan && input.missingCapabilities.length > 0) {
		return "missing_required_access";
	}
	if (input.missingCapabilities.length > 0) {
		return "missing_required_capability";
	}
	if (input.missingPlan) {
		return input.allowOnly ? "no_matching_plan" : "missing_required_plan";
	}
	return input.allowOnly ? "no_matching_plan" : "missing_required_access";
}

export function evaluateRestrictionRules(
	rules: MembershipRuleLike[],
	principal: PrincipalAccessInput,
): MembershipAccessDecision {
	if (rules.length === 0) {
		return {
			allowed: true,
			reason: "no_restriction",
			teaserMode: null,
			customMessage: null,
			matchingPlanIds: [],
		};
	}

	const denyRules = rules.filter((rule) => rule.ruleMode === "deny_if_missing");
	const allowOnlyRules = rules.filter((rule) => rule.ruleMode === "allow_only");

	if (!principal.isAuthenticated) {
		const loginRule = rules.find((rule) => rule.loginRequired);
		const representativeRule =
			loginRule ?? denyRules[0] ?? allowOnlyRules[0] ?? rules[0];
		return denialPayload(
			representativeRule,
			loginRule ? "login_required" : "membership_required",
			collectRulePlanIds(rules),
		);
	}

	for (const rule of denyRules) {
		const evaluation = evaluateRule(rule, principal);
		if (!evaluation.satisfied) {
			return denialPayload(
				rule,
				denialReasonFromFailure({
					missingPlan: evaluation.missingPlan,
					missingCapabilities: evaluation.missingCapabilities,
					allowOnly: false,
				}),
				uniqueStrings([
					...collectRulePlanIds([rule]),
					...evaluation.matchingPlanIds,
				]),
			);
		}
	}

	if (allowOnlyRules.length === 0) {
		return {
			allowed: true,
			reason: "all_rules_passed",
			teaserMode: null,
			customMessage: null,
			matchingPlanIds: principal.userPlanIds,
		};
	}

	let allowSatisfied = false;
	const allowMatches: string[] = [];
	for (const rule of allowOnlyRules) {
		const evaluation = evaluateRule(rule, principal);
		if (evaluation.satisfied) {
			allowSatisfied = true;
			allowMatches.push(...evaluation.matchingPlanIds);
		}
	}

	if (allowSatisfied) {
		return {
			allowed: true,
			reason: allowMatches.length > 0 ? "plan_match" : "capability_match",
			teaserMode: null,
			customMessage: null,
			matchingPlanIds:
				allowMatches.length > 0
					? uniqueStrings(allowMatches)
					: principal.userPlanIds,
		};
	}

	const firstAllowRule = allowOnlyRules[0];
	const firstAllowEvaluation = evaluateRule(firstAllowRule, principal);
	return denialPayload(
		firstAllowRule,
		denialReasonFromFailure({
			missingPlan: firstAllowEvaluation.missingPlan,
			missingCapabilities: firstAllowEvaluation.missingCapabilities,
			allowOnly: true,
		}),
		collectRulePlanIds(allowOnlyRules),
	);
}

export function matchesRoutePattern(
	pattern: string,
	pathname: string,
): boolean {
	const normalizedPattern = normalizePathname(pattern);
	const normalizedPathname = normalizePathname(pathname);

	if (!normalizedPattern.includes("*")) {
		return normalizedPattern === normalizedPathname;
	}

	if (normalizedPattern.endsWith("/*")) {
		const prefix = normalizedPattern.slice(0, -2);
		if (prefix.length === 0) return true;
		return (
			normalizedPathname === prefix ||
			normalizedPathname.startsWith(`${prefix}/`)
		);
	}

	const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
	return regex.test(normalizedPathname);
}

function compareRouteRuleSpecificity(
	a: MembershipRuleLike,
	b: MembershipRuleLike,
): number {
	const aKey = a.resourceIdOrKey ?? "";
	const bKey = b.resourceIdOrKey ?? "";
	const aHasWildcard = aKey.includes("*");
	const bHasWildcard = bKey.includes("*");

	if (aHasWildcard !== bHasWildcard) {
		return aHasWildcard ? 1 : -1;
	}

	if (aKey.length !== bKey.length) {
		return bKey.length - aKey.length;
	}

	return aKey.localeCompare(bKey);
}

async function loadMatchingRules(
	ctx: MembershipCtx,
	resourceType: MembershipResourceType,
	resourceIdOrKey: string,
): Promise<MembershipRuleLike[]> {
	if (resourceType !== "route") {
		return await ctx.db
			.query("membership_restriction_rules")
			.withIndex("by_resource", (q: any) =>
				q
					.eq("resourceType", resourceType)
					.eq("resourceIdOrKey", resourceIdOrKey),
			)
			.collect();
	}

	const normalizedPath = normalizePathname(resourceIdOrKey);
	const rules = await ctx.db.query("membership_restriction_rules").collect();
	return rules
		.filter(
			(rule: any) =>
				rule.resourceType === "route" &&
				matchesRoutePattern(rule.resourceIdOrKey, normalizedPath),
		)
		.sort(compareRouteRuleSpecificity);
}

async function getValidUserPlanIds(
	ctx: MembershipCtx,
	userId: Id<"users">,
): Promise<string[]> {
	const now = Date.now();
	const [activeGrants, graceGrants] = await Promise.all([
		ctx.db
			.query("membership_grants")
			.withIndex("by_user_status", (q: any) =>
				q.eq("userId", userId).eq("status", "active"),
			)
			.collect(),
		ctx.db
			.query("membership_grants")
			.withIndex("by_user_status", (q: any) =>
				q.eq("userId", userId).eq("status", "grace"),
			)
			.collect(),
	]);

	return uniqueStrings(
		[...activeGrants, ...graceGrants]
			.filter((grant: any) => {
				if (
					grant.status === "grace" &&
					grant.graceEndsAt &&
					grant.graceEndsAt < now
				) {
					return false;
				}
				if (grant.endsAt && grant.endsAt < now && grant.status !== "grace") {
					return false;
				}
				return true;
			})
			.map((grant: any) => String(grant.planId)),
	);
}

async function getGrantedCapabilitiesForRules(
	ctx: MembershipCtx,
	rules: MembershipRuleLike[],
): Promise<string[]> {
	const requiredCapabilities = uniqueStrings(
		rules.flatMap((rule) => rule.requiredCapabilities ?? []),
	);

	if (requiredCapabilities.length === 0) return [];

	const grantedCapabilities: string[] = [];
	for (const capability of requiredCapabilities) {
		if (await currentUserCan(ctx as any, capability as any)) {
			grantedCapabilities.push(capability);
		}
	}

	return grantedCapabilities;
}

export async function evaluateMembershipAccess(
	ctx: MembershipCtx,
	args: {
		resourceType: MembershipResourceType;
		resourceIdOrKey: string;
	},
): Promise<MembershipAccessDecision> {
	if (!(await isMembershipPluginEnabled(ctx))) {
		return {
			allowed: true,
			reason: "plugin_disabled",
			teaserMode: null,
			customMessage: null,
			matchingPlanIds: [],
		};
	}

	const normalizedResourceId =
		args.resourceType === "route"
			? normalizePathname(args.resourceIdOrKey)
			: args.resourceIdOrKey;
	const rules = await loadMatchingRules(
		ctx,
		args.resourceType,
		normalizedResourceId,
	);

	if (rules.length === 0) {
		return {
			allowed: true,
			reason: "no_restriction",
			teaserMode: null,
			customMessage: null,
			matchingPlanIds: [],
		};
	}

	const user = await getCurrentUser(ctx as any);
	if (!user) {
		return evaluateRestrictionRules(rules, {
			isAuthenticated: false,
			userPlanIds: [],
			capabilities: [],
		});
	}

	const userPlanIds = await getValidUserPlanIds(ctx, user._id);
	const capabilities = await getGrantedCapabilitiesForRules(ctx, rules);

	return evaluateRestrictionRules(rules, {
		isAuthenticated: true,
		userPlanIds,
		capabilities,
	});
}
