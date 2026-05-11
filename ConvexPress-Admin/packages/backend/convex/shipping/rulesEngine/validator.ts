/**
 * PRD A6 Rules Engine — AST validator. Runs at save time to reject malformed rules.
 */

import type { RuleAST, RuleCombinator, RuleOperator } from "./types";
import { MAX_RULE_DEPTH } from "./types";

const LEAF_OPERATORS: ReadonlySet<RuleOperator> = new Set<RuleOperator>([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "starts_with",
  "regex_match",
  "between",
  "exists",
]);

const COMBINATORS: ReadonlySet<RuleCombinator> = new Set<RuleCombinator>([
  "and",
  "or",
  "not",
]);

const ALLOWED_FIELDS = new Set([
  "cart.subtotalAmount",
  "cart.weightOz",
  "cart.itemCount",
  "cart.currencyCode",
  "cart.appliedDiscountCode",
  "cart.shippingClasses",
  "cart.productIds",
  "cart.productTags",
  "shipping.destinationCountryCode",
  "shipping.destinationPostalCode",
  "shipping.zoneId",
  "shipping.zoneName",
  "customer.userId",
  "customer.tags",
  "customer.isGuest",
  "customer.totalOrdersCount",
  "customer.totalLifetimeAmount",
]);

export type ValidationError = { path: string; message: string };

export function validateRuleAST(
  rule: unknown,
  depth = 0,
  path = "$",
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (depth > MAX_RULE_DEPTH) {
    errors.push({ path, message: `Rule depth exceeds ${MAX_RULE_DEPTH}.` });
    return errors;
  }

  if (!rule || typeof rule !== "object") {
    errors.push({ path, message: "Rule must be an object." });
    return errors;
  }

  const r = rule as { op?: unknown; field?: unknown; value?: unknown; rules?: unknown };

  if (typeof r.op !== "string") {
    errors.push({ path, message: "Rule must have a string 'op' field." });
    return errors;
  }

  const op = r.op as RuleOperator | RuleCombinator;

  if (COMBINATORS.has(op as RuleCombinator)) {
    if (!Array.isArray(r.rules)) {
      errors.push({ path, message: `Combinator '${op}' requires 'rules' array.` });
      return errors;
    }
    if (op === "not" && r.rules.length !== 1) {
      errors.push({ path, message: `'not' combinator requires exactly 1 child rule.` });
    }
    if ((op === "and" || op === "or") && r.rules.length === 0) {
      errors.push({ path, message: `'${op}' requires at least 1 child rule.` });
    }
    r.rules.forEach((child, i) => {
      errors.push(...validateRuleAST(child, depth + 1, `${path}.rules[${i}]`));
    });
    return errors;
  }

  if (!LEAF_OPERATORS.has(op as RuleOperator)) {
    errors.push({ path, message: `Unknown operator '${op}'.` });
    return errors;
  }

  if (typeof r.field !== "string") {
    errors.push({ path, message: `Leaf rule requires a string 'field'.` });
    return errors;
  }
  if (!ALLOWED_FIELDS.has(r.field)) {
    errors.push({
      path,
      message: `Field '${r.field}' is not allowed. See PRD A6 §5 for the full list.`,
    });
  }

  if (op !== "exists" && r.value === undefined) {
    errors.push({ path, message: `Operator '${op}' requires a 'value'.` });
  }

  if (op === "between") {
    if (!Array.isArray(r.value) || r.value.length !== 2) {
      errors.push({ path, message: `'between' requires value = [min, max].` });
    }
  }

  if (op === "in" || op === "not_in") {
    if (!Array.isArray(r.value)) {
      errors.push({ path, message: `'${op}' requires an array value.` });
    }
  }

  if (op === "regex_match" && typeof r.value === "string") {
    try {
      new RegExp(r.value);
    } catch (e) {
      errors.push({
        path,
        message: `Invalid regex: ${(e as Error).message}`,
      });
    }
  }

  return errors;
}

export function isValidRuleAST(rule: unknown): rule is RuleAST {
  return validateRuleAST(rule).length === 0;
}
