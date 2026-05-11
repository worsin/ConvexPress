/**
 * PRD A6 Shipping Rules Engine — AST type definitions.
 *
 * Rules are pure JSON — no function references, no eval, no JS strings.
 * Max nested depth: 8 levels (enforced in validator).
 */

export type RuleOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "regex_match"
  | "between"
  | "exists";

export type RuleCombinator = "and" | "or" | "not";

export type LeafRule = {
  op: RuleOperator;
  field: string; // dot-notation path (e.g., "cart.weightOz")
  value?: unknown;
};

export type CombinatorRule = {
  op: RuleCombinator;
  rules: RuleAST[];
};

export type RuleAST = LeafRule | CombinatorRule;

export type RuleContext = {
  cart: {
    subtotalAmount: number;
    weightOz: number;
    itemCount: number;
    currencyCode: string;
    appliedDiscountCode?: string;
    shippingClasses: string[]; // array of class slugs
    productIds: string[];
    productTags: string[];
  };
  shipping: {
    destinationCountryCode?: string;
    destinationPostalCode?: string;
    zoneId?: string;
    zoneName?: string;
  };
  customer: {
    userId?: string;
    tags: string[];
    isGuest: boolean;
    totalOrdersCount?: number;
    totalLifetimeAmount?: number;
  };
};

export const MAX_RULE_DEPTH = 8;
