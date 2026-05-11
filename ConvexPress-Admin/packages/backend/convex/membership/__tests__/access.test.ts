// @ts-expect-error Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
	evaluateRestrictionRules,
	type MembershipRuleLike,
	matchesRoutePattern,
} from "../access";

describe("matchesRoutePattern", () => {
	test("matches exact paths after normalization", () => {
		expect(matchesRoutePattern("/members-only/", "/members-only")).toBe(true);
		expect(matchesRoutePattern("members-only", "/members-only/")).toBe(true);
		expect(matchesRoutePattern("/members-only", "/different")).toBe(false);
	});

	test("matches prefix globs", () => {
		expect(matchesRoutePattern("/premium/*", "/premium")).toBe(true);
		expect(matchesRoutePattern("/premium/*", "/premium/articles/one")).toBe(
			true,
		);
		expect(matchesRoutePattern("/premium/*", "/premiums")).toBe(false);
	});

	test("matches catch-all globs", () => {
		expect(matchesRoutePattern("/*", "/")).toBe(true);
		expect(matchesRoutePattern("/*", "/anything/here")).toBe(true);
	});
});

describe("evaluateRestrictionRules", () => {
	test("unauthenticated users hit login_required when any matching rule requires login", () => {
		const rules: MembershipRuleLike[] = [
			{
				ruleMode: "allow_only",
				planIds: ["plan_pro"],
				teaserMode: "excerpt",
				loginRequired: true,
			},
		];

		const result = evaluateRestrictionRules(rules, {
			isAuthenticated: false,
			userPlanIds: [],
			capabilities: [],
		});

		expect(result).toEqual({
			allowed: false,
			reason: "login_required",
			teaserMode: "excerpt",
			customMessage: null,
			matchingPlanIds: ["plan_pro"],
		});
	});

	test("allow_only rules accept users with a matching plan and required capabilities", () => {
		const rules: MembershipRuleLike[] = [
			{
				ruleMode: "allow_only",
				planIds: ["plan_pro", "plan_vip"],
				requiredCapabilities: ["post.view_premium"],
				teaserMode: "hide",
			},
		];

		const result = evaluateRestrictionRules(rules, {
			isAuthenticated: true,
			userPlanIds: ["plan_vip"],
			capabilities: ["post.view_premium"],
		});

		expect(result.allowed).toBe(true);
		expect(result.reason).toBe("plan_match");
		expect(result.matchingPlanIds).toEqual(["plan_vip"]);
	});

	test("capability-only allow_only rules can grant access", () => {
		const rules: MembershipRuleLike[] = [
			{
				ruleMode: "allow_only",
				requiredCapabilities: ["download.premium_asset"],
				teaserMode: "custom_message",
				customMessage: "Upgrade required.",
			},
		];

		const result = evaluateRestrictionRules(rules, {
			isAuthenticated: true,
			userPlanIds: [],
			capabilities: ["download.premium_asset"],
		});

		expect(result.allowed).toBe(true);
		expect(result.reason).toBe("capability_match");
	});

	test("deny_if_missing rules reject users missing required capabilities", () => {
		const rules: MembershipRuleLike[] = [
			{
				ruleMode: "deny_if_missing",
				planIds: ["plan_pro"],
				requiredCapabilities: ["post.view_premium"],
				teaserMode: "custom_message",
				customMessage: "Members only.",
			},
		];

		const result = evaluateRestrictionRules(rules, {
			isAuthenticated: true,
			userPlanIds: ["plan_pro"],
			capabilities: [],
		});

		expect(result).toEqual({
			allowed: false,
			reason: "missing_required_capability",
			teaserMode: "custom_message",
			customMessage: "Members only.",
			matchingPlanIds: ["plan_pro"],
		});
	});

	test("deny_if_missing rules still block access when an allow_only rule matches", () => {
		const rules: MembershipRuleLike[] = [
			{
				ruleMode: "allow_only",
				planIds: ["plan_pro"],
				teaserMode: "hide",
			},
			{
				ruleMode: "deny_if_missing",
				requiredCapabilities: ["post.view_premium"],
				teaserMode: "excerpt",
			},
		];

		const result = evaluateRestrictionRules(rules, {
			isAuthenticated: true,
			userPlanIds: ["plan_pro"],
			capabilities: [],
		});

		expect(result.allowed).toBe(false);
		expect(result.reason).toBe("missing_required_capability");
		expect(result.teaserMode).toBe("excerpt");
	});

	test("allow_only failures keep the upgrade candidate plan ids", () => {
		const rules: MembershipRuleLike[] = [
			{
				ruleMode: "allow_only",
				planIds: ["plan_pro", "plan_vip"],
				teaserMode: "excerpt",
			},
		];

		const result = evaluateRestrictionRules(rules, {
			isAuthenticated: true,
			userPlanIds: ["plan_basic"],
			capabilities: [],
		});

		expect(result).toEqual({
			allowed: false,
			reason: "no_matching_plan",
			teaserMode: "excerpt",
			customMessage: null,
			matchingPlanIds: ["plan_pro", "plan_vip"],
		});
	});
});
