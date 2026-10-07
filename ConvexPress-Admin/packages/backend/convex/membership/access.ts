import type { RuleResult, RuleArgs, GrantResult, BlockRuleBatchArgs, ContentRuleBatchArgs } from "./policyReads";
import { makeFunctionReference } from "convex/server";
import type { RequestReadLedger, MeasuredPolicyPage } from "../helpers/requestReadLedger";
import { readMembershipAuthorityGrants, membershipAuthorityReader } from "../helpers/membershipAuthority";
const rulesRead = makeFunctionReference<"query", RuleArgs, RuleResult[]>("membership/policyReads:rules");
const measuredRulesRead = makeFunctionReference<"query", RuleArgs, MeasuredPolicyPage<RuleResult>>("membership/policyReads:measuredRules");
const measuredBlockRulesRead = makeFunctionReference<"query", BlockRuleBatchArgs, MeasuredPolicyPage<RuleResult>>("membership/policyReads:measuredBlockRules");
const measuredContentRulesRead = makeFunctionReference<"query", ContentRuleBatchArgs, MeasuredPolicyPage<RuleResult>>("membership/policyReads:measuredContentRules");
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isMembershipPluginEnabled } from "../commerce/helpers";
import { getCurrentUser, resolveUserRole } from "../helpers/permissions";

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
	policyGroup?: string;
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
	// Preserve the exact legacy decision path when all rules share one group.
	const groups = new Map<string | undefined, MembershipRuleLike[]>();
	for (const rule of rules) {
		const group = groups.get(rule.policyGroup) ?? [];
		group.push(rule);
		groups.set(rule.policyGroup, group);
	}
	if (groups.size <= 1) return evaluateRestrictionGroup(rules, principal);
	const matches: string[] = [];
	for (const group of groups.values()) {
		const decision = evaluateRestrictionGroup(group, principal);
		if (!decision.allowed) return decision;
		matches.push(...decision.matchingPlanIds);
	}
	return { allowed: true, reason: "all_rules_passed", teaserMode: null,
		customMessage: null, matchingPlanIds: uniqueStrings(matches) };
}

function evaluateRestrictionGroup(
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

async function readRules(
  ctx: MembershipCtx, resourceType: MembershipResourceType, resourceIdOrKey: string, budget?: RequestReadLedger,
): Promise<RuleResult[]> {
  if (!budget) return ctx.runQuery(rulesRead, { resourceType, resourceIdOrKey });
  budget.beforeRead();
  const measured = await ctx.runQuery(measuredRulesRead, { resourceType, resourceIdOrKey });
  budget.recordPage(measured);
  return measured.items;
}
function matchingRules(rules: RuleResult[], resourceType: MembershipResourceType, resourceIdOrKey: string): RuleResult[] {
  if (resourceType !== "route") return rules;
  const normalizedPath = normalizePathname(resourceIdOrKey);
  return rules.filter(rule => rule.resourceType === "route" && matchesRoutePattern(rule.resourceIdOrKey, normalizedPath)).sort(compareRouteRuleSpecificity);
}
export async function loadMatchingRules(
	ctx: MembershipCtx,
	resourceType: MembershipResourceType,
	resourceIdOrKey: string,
	budget?: RequestReadLedger,
): Promise<RuleResult[]> {
  return matchingRules(await readRules(ctx, resourceType, resourceIdOrKey, budget), resourceType, resourceIdOrKey);
}

export async function getValidMembershipGrants(
	ctx: MembershipCtx,
	userId: Id<"users">,
	budget?: RequestReadLedger,
): Promise<GrantResult[]> {
  return readMembershipAuthorityGrants(ctx, userId, budget);
}

async function getValidUserPlanIds(
	ctx: MembershipCtx,
	userId: Id<"users">,
	budget?: RequestReadLedger,
): Promise<string[]> {
	const grants = await getValidMembershipGrants(ctx, userId, budget);
	const reader = membershipAuthorityReader(ctx, budget);
  const ids: string[] = [];
  for (const grant of grants) {
    const plan = await reader.plan(grant.planId);
    if (plan?.status === "active") ids.push(String(plan._id));
  }
  return uniqueStrings(ids);
}

async function getUserById(
	ctx: MembershipCtx,
	userId: Id<"users"> | string,
	budget?: RequestReadLedger,
): Promise<any | null> {
	budget?.beforeRead();
	const user = await ctx.db.get("users", userId as Id<"users">);
	budget?.record(user);
	if (!user || user.status !== "active") return null;
	return user;
}

async function getGrantedCapabilitiesForRules(
	ctx: MembershipCtx,
	rules: MembershipRuleLike[],
	user: any,
	budget?: RequestReadLedger,
): Promise<string[]> {
	const requiredCapabilities = uniqueStrings(
		rules.flatMap((rule) => rule.requiredCapabilities ?? []),
	);

	if (requiredCapabilities.length === 0) return [];

	const requiredSet = new Set(requiredCapabilities);
	const grantedCapabilities: string[] = [];

	const role = await resolveUserRole(ctx as any, user, budget);
	const roleCapabilities: string[] = Array.isArray(
		(role as any)?.capabilities,
	)
		? (role as any).capabilities
		: [];
	for (const capability of roleCapabilities) {
		if (requiredSet.has(capability)) {
			grantedCapabilities.push(capability);
		}
	}

	const grants = await getValidMembershipGrants(ctx, user._id, budget);
	const reader = membershipAuthorityReader(ctx, budget);
	for (const grant of grants) {
		const plan = await reader.plan(grant.planId as Id<"membership_plans">);
		if (!plan || plan.status !== "active") continue;
		const linkedCapabilities: string[] = Array.isArray(plan.linkedCapabilities)
			? plan.linkedCapabilities
			: [];
		for (const capability of linkedCapabilities) {
			if (requiredSet.has(capability)) {
				grantedCapabilities.push(capability);
			}
		}
	}

	return uniqueStrings(grantedCapabilities);
}

type AccessArgs = { resourceType: MembershipResourceType; resourceIdOrKey: string; userId?: Id<"users"> | string };
/** A fresh evaluator belongs to one read-only query snapshot. Never retain this
 * closure across requests or reuse it after writes in a mutation. */
export function createMembershipAccessEvaluator(ctx: QueryCtx, budget?: RequestReadLedger) {
  let enabled: Promise<boolean> | undefined;
  const rulesByTarget = new Map<string, Promise<RuleResult[]>>();
  const evaluate = async (args: AccessArgs): Promise<MembershipAccessDecision> => {
    enabled ??= isMembershipPluginEnabled(ctx, budget);
    if (!(await enabled)) return { allowed: true, reason: "plugin_disabled", teaserMode: null, customMessage: null, matchingPlanIds: [] };
    // The route reader returns the complete bounded route-policy set, so one
    // measured read can serve every product URL in this query snapshot.
    const key = args.resourceType === "route" ? "route" : JSON.stringify([args.resourceType, args.resourceIdOrKey]);
    let source = rulesByTarget.get(key);
    if (!source) { source = readRules(ctx, args.resourceType, args.resourceIdOrKey, budget); rulesByTarget.set(key, source); }
    return evaluateRulesForViewer(ctx, args, matchingRules(await source, args.resourceType, args.resourceIdOrKey), budget);
  };
  const preloadBlocks = async (keys: readonly string[]): Promise<void> => {
    if (!keys.length) return;
    enabled ??= isMembershipPluginEnabled(ctx, budget);
    if (!await enabled) return;
    const missing = [...new Set(keys)].filter(key => !rulesByTarget.has(JSON.stringify(["block", key])));
    for (let offset = 0; offset < missing.length; offset += 128) {
      const selected = missing.slice(offset, offset + 128);
      budget?.beforeRead();
      const result = await ctx.runQuery(measuredBlockRulesRead, { keys: selected });
      budget?.recordPage(result);
      for (const key of selected) rulesByTarget.set(JSON.stringify(["block", key]), Promise.resolve(result.items.filter(rule => rule.resourceIdOrKey === key)));
    }
  };
  const preloadContent = async (resourceType: "page" | "post", keys: readonly string[]): Promise<void> => {
    if (!keys.length) return;
    enabled ??= isMembershipPluginEnabled(ctx, budget);
    if (!await enabled) return;
    const missing = [...new Set(keys)].filter(key => !rulesByTarget.has(JSON.stringify([resourceType, key])));
    for (let offset = 0; offset < missing.length; offset += 128) {
      const selected = missing.slice(offset, offset + 128);
      budget?.beforeRead();
      const result = await ctx.runQuery(measuredContentRulesRead, { resourceType, keys: selected });
      budget?.recordPage(result);
      for (const key of selected) rulesByTarget.set(JSON.stringify([resourceType, key]), Promise.resolve(result.items.filter(rule => rule.resourceIdOrKey === key)));
    }
  };
  return Object.assign(evaluate, { preloadBlocks, preloadContent });
}
export async function evaluateMembershipAccess(ctx: MembershipCtx, args: AccessArgs, budget?: RequestReadLedger): Promise<MembershipAccessDecision> {
  if (!(await isMembershipPluginEnabled(ctx, budget)))
    return { allowed: true, reason: "plugin_disabled", teaserMode: null, customMessage: null, matchingPlanIds: [] };
  return evaluateRulesForViewer(ctx, args, await loadMatchingRules(ctx, args.resourceType, args.resourceIdOrKey, budget), budget);
}
async function evaluateRulesForViewer(ctx: MembershipCtx, args: AccessArgs, rules: RuleResult[], budget?: RequestReadLedger): Promise<MembershipAccessDecision> {
	if (rules.length === 0) {
		return {
			allowed: true,
			reason: "no_restriction",
			teaserMode: null,
			customMessage: null,
			matchingPlanIds: [],
		};
	}

	const user = args.userId
		? await getUserById(ctx, args.userId, budget)
		: await getCurrentUser(ctx as any, budget);
	if (!user || user.status !== "active") {
		return evaluateRestrictionRules(rules, {
			isAuthenticated: false,
			userPlanIds: [],
			capabilities: [],
		});
	}

	const userPlanIds = await getValidUserPlanIds(ctx, user._id, budget);
	const capabilities = await getGrantedCapabilitiesForRules(ctx, rules, user, budget);

	return evaluateRestrictionRules(rules, {
		isAuthenticated: true,
		userPlanIds,
		capabilities,
	});
}
