/**
 * PRD A6 Rules Engine evaluator — pure function, no ctx.
 * Returns true if the rule matches the given context.
 */

import type {
  CombinatorRule,
  LeafRule,
  RuleAST,
  RuleContext,
} from "./types";

function getFieldValue(context: RuleContext, path: string): unknown {
  const parts = path.split(".");
  let current: any = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function isLeaf(rule: RuleAST): rule is LeafRule {
  return rule.op !== "and" && rule.op !== "or" && rule.op !== "not";
}

function evaluateLeaf(rule: LeafRule, context: RuleContext): boolean {
  const value = getFieldValue(context, rule.field);
  const target = rule.value;

  switch (rule.op) {
    case "eq":
      return value === target;
    case "neq":
      return value !== target;
    case "gt":
      return typeof value === "number" && typeof target === "number" && value > target;
    case "gte":
      return typeof value === "number" && typeof target === "number" && value >= target;
    case "lt":
      return typeof value === "number" && typeof target === "number" && value < target;
    case "lte":
      return typeof value === "number" && typeof target === "number" && value <= target;
    case "in":
      return Array.isArray(target) && target.includes(value as any);
    case "not_in":
      return Array.isArray(target) && !target.includes(value as any);
    case "contains":
      if (Array.isArray(value)) return value.includes(target as any);
      if (typeof value === "string" && typeof target === "string") return value.includes(target);
      return false;
    case "not_contains":
      if (Array.isArray(value)) return !value.includes(target as any);
      if (typeof value === "string" && typeof target === "string") return !value.includes(target);
      return true;
    case "starts_with":
      return typeof value === "string" && typeof target === "string" && value.startsWith(target);
    case "regex_match":
      if (typeof value !== "string" || typeof target !== "string") return false;
      try {
        return new RegExp(target).test(value);
      } catch {
        return false;
      }
    case "between":
      if (
        typeof value !== "number" ||
        !Array.isArray(target) ||
        target.length !== 2 ||
        typeof target[0] !== "number" ||
        typeof target[1] !== "number"
      ) {
        return false;
      }
      return value >= target[0] && value <= target[1];
    case "exists":
      return value !== undefined && value !== null;
    default:
      return false;
  }
}

function evaluateCombinator(rule: CombinatorRule, context: RuleContext): boolean {
  if (rule.op === "and") {
    return rule.rules.every((r) => evaluateRule(r, context));
  }
  if (rule.op === "or") {
    return rule.rules.some((r) => evaluateRule(r, context));
  }
  if (rule.op === "not") {
    // `not` must have exactly one child rule; evaluate and negate.
    if (rule.rules.length !== 1) return false;
    return !evaluateRule(rule.rules[0]!, context);
  }
  return false;
}

export function evaluateRule(rule: RuleAST, context: RuleContext): boolean {
  if (isLeaf(rule)) return evaluateLeaf(rule, context);
  return evaluateCombinator(rule as CombinatorRule, context);
}

/**
 * PRD A6 §4 — tracing evaluator. Returns the boolean verdict plus a
 * structured explanation of which sub-rule produced the result. Used by the
 * admin RuleBuilder preview and by pipeline diagnostics.
 */
export type RuleTrace = {
  passed: boolean;
  node: RuleAST;
  details?: string;
  children?: RuleTrace[];
};

export function evaluateRuleWithTrace(
  rule: RuleAST,
  context: RuleContext,
): RuleTrace {
  if (isLeaf(rule)) {
    const passed = evaluateLeaf(rule, context);
    return {
      passed,
      node: rule,
      details: `${(rule as any).field} ${(rule as any).op} ${JSON.stringify(
        (rule as any).value,
      )} → ${passed}`,
    };
  }
  const combinator = rule as CombinatorRule;
  const children = combinator.rules.map((r) => evaluateRuleWithTrace(r, context));
  let passed = false;
  if (combinator.op === "and") passed = children.every((c) => c.passed);
  else if (combinator.op === "or") passed = children.some((c) => c.passed);
  else if (combinator.op === "not")
    passed = children.length === 1 ? !children[0]!.passed : false;
  return {
    passed,
    node: rule,
    details: `${combinator.op}(${children.length}) → ${passed}`,
    children,
  };
}
