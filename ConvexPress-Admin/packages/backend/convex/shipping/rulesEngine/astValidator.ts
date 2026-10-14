/**
 * PRD A6 Rules Engine — exact transport for a rule AST.
 *
 * A rule is a leaf comparison or an and/or/not combinator over child rules.
 * Convex validators cannot recurse, so the tree is unrolled to the depth the
 * semantic validator allows: `validateRuleAST` rejects any node deeper than
 * MAX_RULE_DEPTH, so MAX_RULE_DEPTH + 1 node levels cover every rule it can
 * accept. Operator/field rules that are not structural (the field allow-list,
 * `between` arity, regex syntax, combinator child counts) stay in
 * `validateRuleAST`, which handlers still run.
 */
import { v, type Validator } from "convex/values";

import { boundedTreeValidator } from "../../helpers/boundedTree";
import { MAX_RULE_DEPTH, type RuleAST } from "./types";

const ruleScalarValidator = v.union(v.string(), v.number(), v.boolean(), v.null());

/** A leaf's comparison value: one scalar, or a list for in/not_in/between. */
export const ruleValueValidator = v.union(ruleScalarValidator, v.array(ruleScalarValidator));

const leafOperatorValidator = v.union(
  v.literal("eq"),
  v.literal("neq"),
  v.literal("gt"),
  v.literal("gte"),
  v.literal("lt"),
  v.literal("lte"),
  v.literal("in"),
  v.literal("not_in"),
  v.literal("contains"),
  v.literal("not_contains"),
  v.literal("starts_with"),
  v.literal("regex_match"),
  v.literal("between"),
  v.literal("exists"),
);

const leafRuleValidator = v.object({
  op: leafOperatorValidator,
  field: v.string(),
  value: v.optional(ruleValueValidator),
});

/** Node levels a rule may have: depths 0 through MAX_RULE_DEPTH. */
export const RULE_AST_LEVELS = MAX_RULE_DEPTH + 1;

export const ruleAstValidator: Validator<RuleAST, "required", string> = boundedTreeValidator<RuleAST>(
  RULE_AST_LEVELS,
  (children) =>
    v.union(
      leafRuleValidator,
      v.object({ op: v.union(v.literal("and"), v.literal("or"), v.literal("not")), rules: children }),
    ),
);
