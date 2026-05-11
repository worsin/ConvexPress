import { describe, expect, test } from "bun:test";

import { evaluateRule } from "../rulesEngine/evaluator";
import { validateRuleAST } from "../rulesEngine/validator";
import type { RuleContext } from "../rulesEngine/types";

const ctx: RuleContext = {
  cart: {
    subtotalAmount: 75,
    weightOz: 32,
    itemCount: 3,
    currencyCode: "USD",
    appliedDiscountCode: "FREESHIP",
    shippingClasses: ["fragile"],
    productIds: ["p1", "p2"],
    productTags: ["sale"],
  },
  shipping: {
    destinationCountryCode: "US",
    destinationPostalCode: "90210",
    zoneId: "z1",
    zoneName: "US",
  },
  customer: {
    tags: ["vip"],
    isGuest: false,
    totalOrdersCount: 5,
    totalLifetimeAmount: 500,
  },
};

describe("evaluateRule — comparison operators", () => {
  test("eq / neq", () => {
    expect(
      evaluateRule({ op: "eq", field: "cart.itemCount", value: 3 }, ctx),
    ).toBe(true);
    expect(
      evaluateRule({ op: "neq", field: "cart.itemCount", value: 4 }, ctx),
    ).toBe(true);
  });

  test("gt / gte / lt / lte", () => {
    expect(
      evaluateRule({ op: "gt", field: "cart.subtotalAmount", value: 50 }, ctx),
    ).toBe(true);
    expect(
      evaluateRule({ op: "gte", field: "cart.subtotalAmount", value: 75 }, ctx),
    ).toBe(true);
    expect(
      evaluateRule({ op: "lt", field: "cart.subtotalAmount", value: 100 }, ctx),
    ).toBe(true);
    expect(
      evaluateRule({ op: "lte", field: "cart.subtotalAmount", value: 75 }, ctx),
    ).toBe(true);
  });
});

describe("evaluateRule — collection operators", () => {
  test("in / not_in", () => {
    expect(
      evaluateRule(
        { op: "in", field: "cart.currencyCode", value: ["USD", "EUR"] },
        ctx,
      ),
    ).toBe(true);
    expect(
      evaluateRule(
        { op: "not_in", field: "cart.currencyCode", value: ["GBP"] },
        ctx,
      ),
    ).toBe(true);
  });

  test("contains on array fields", () => {
    expect(
      evaluateRule(
        { op: "contains", field: "cart.shippingClasses", value: "fragile" },
        ctx,
      ),
    ).toBe(true);
    expect(
      evaluateRule(
        { op: "contains", field: "cart.shippingClasses", value: "hazmat" },
        ctx,
      ),
    ).toBe(false);
    expect(
      evaluateRule(
        { op: "not_contains", field: "customer.tags", value: "blocked" },
        ctx,
      ),
    ).toBe(true);
  });
});

describe("evaluateRule — string operators", () => {
  test("starts_with", () => {
    expect(
      evaluateRule(
        { op: "starts_with", field: "shipping.destinationPostalCode", value: "902" },
        ctx,
      ),
    ).toBe(true);
  });

  test("regex_match", () => {
    expect(
      evaluateRule(
        { op: "regex_match", field: "shipping.destinationPostalCode", value: "^9\\d{4}$" },
        ctx,
      ),
    ).toBe(true);
  });

  test("regex with invalid pattern returns false (not throw)", () => {
    expect(
      evaluateRule(
        { op: "regex_match", field: "cart.currencyCode", value: "[invalid" },
        ctx,
      ),
    ).toBe(false);
  });
});

describe("evaluateRule — between + exists", () => {
  test("between is inclusive", () => {
    expect(
      evaluateRule({ op: "between", field: "cart.weightOz", value: [30, 40] }, ctx),
    ).toBe(true);
    expect(
      evaluateRule({ op: "between", field: "cart.weightOz", value: [40, 50] }, ctx),
    ).toBe(false);
  });

  test("exists checks not-null", () => {
    expect(
      evaluateRule({ op: "exists", field: "cart.appliedDiscountCode" }, ctx),
    ).toBe(true);
    expect(
      evaluateRule({ op: "exists", field: "customer.userId" }, ctx),
    ).toBe(false);
  });
});

describe("evaluateRule — combinators", () => {
  test("and", () => {
    expect(
      evaluateRule(
        {
          op: "and",
          rules: [
            { op: "gt", field: "cart.subtotalAmount", value: 50 },
            { op: "contains", field: "cart.shippingClasses", value: "fragile" },
          ],
        },
        ctx,
      ),
    ).toBe(true);
  });

  test("or", () => {
    expect(
      evaluateRule(
        {
          op: "or",
          rules: [
            { op: "eq", field: "cart.itemCount", value: 999 },
            { op: "contains", field: "customer.tags", value: "vip" },
          ],
        },
        ctx,
      ),
    ).toBe(true);
  });

  test("not", () => {
    expect(
      evaluateRule(
        {
          op: "not",
          rules: [{ op: "eq", field: "customer.isGuest", value: true }],
        },
        ctx,
      ),
    ).toBe(true);
  });
});

describe("validateRuleAST", () => {
  test("accepts well-formed rules", () => {
    expect(
      validateRuleAST({ op: "eq", field: "cart.itemCount", value: 1 }),
    ).toEqual([]);
  });

  test("rejects unknown operator", () => {
    const errors = validateRuleAST({ op: "foo", field: "cart.itemCount", value: 1 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("Unknown operator");
  });

  test("rejects unknown field", () => {
    const errors = validateRuleAST({ op: "eq", field: "fake.field", value: 1 });
    expect(errors[0].message).toContain("not allowed");
  });

  test("rejects missing value (except exists)", () => {
    const errors = validateRuleAST({ op: "eq", field: "cart.itemCount" });
    expect(errors[0].message).toContain("requires a 'value'");
  });

  test("between requires [min, max] tuple", () => {
    const errors = validateRuleAST({
      op: "between",
      field: "cart.weightOz",
      value: 5,
    });
    expect(errors[0].message).toContain("[min, max]");
  });

  test("not requires exactly 1 child", () => {
    const errors = validateRuleAST({
      op: "not",
      rules: [
        { op: "eq", field: "cart.itemCount", value: 1 },
        { op: "eq", field: "cart.itemCount", value: 2 },
      ],
    });
    expect(errors[0].message).toContain("exactly 1");
  });

  test("invalid regex caught at validation", () => {
    const errors = validateRuleAST({
      op: "regex_match",
      field: "cart.currencyCode",
      value: "[bad",
    });
    expect(errors[0].message).toContain("Invalid regex");
  });

  test("rejects rules deeper than 8 levels", () => {
    let rule: any = { op: "eq", field: "cart.itemCount", value: 1 };
    for (let i = 0; i < 10; i++) {
      rule = { op: "not", rules: [rule] };
    }
    const errors = validateRuleAST(rule);
    expect(errors.some((e) => e.message.includes("depth exceeds"))).toBe(true);
  });
});
