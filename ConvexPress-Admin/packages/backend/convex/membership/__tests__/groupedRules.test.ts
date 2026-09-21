import { expect, test } from "bun:test";
import { evaluateRestrictionRules } from "../access";

test("independent allow-only groups are ANDed while alternatives within a group remain ORed", () => {
  const rules = [
    { ruleMode: "allow_only" as const, planIds: ["a"], policyGroup: "direct" },
    { ruleMode: "allow_only" as const, planIds: ["b"], policyGroup: "route" },
    { ruleMode: "allow_only" as const, planIds: ["c"], policyGroup: "route" },
  ];
  const principal = (userPlanIds: string[]) => ({
    isAuthenticated: true,
    userPlanIds,
    capabilities: [],
  });
  expect(evaluateRestrictionRules(rules, principal(["a"])).allowed).toBe(false);
  expect(evaluateRestrictionRules(rules, principal(["b"])).allowed).toBe(false);
  expect(evaluateRestrictionRules(rules, principal(["a", "b"])).allowed).toBe(
    true,
  );
  expect(evaluateRestrictionRules(rules, principal(["a", "c"])).allowed).toBe(
    true,
  );
  const legacy = rules.map(({ policyGroup, ...rule }) => rule);
  expect(evaluateRestrictionRules(legacy, principal(["a"])).allowed).toBe(true);
});
