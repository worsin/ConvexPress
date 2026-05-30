/**
 * ConvexPress Forms — Calculation & Pricing core: pure engine tests.
 * Run: `bun test convex/extensions/forms/calc/__tests__/calc.test.ts`
 *
 * Covers the contract the submit mutation depends on + every PRD §9 edge case:
 *   - parser: grammar, arity, {row.x} scoping, DoS caps, friendly errors;
 *   - evaluator: blank/missing → 0, /0 & %0 → 0, NaN coercion, precedence,
 *     functions (sum/min/max/round/avg/if/lookup), aggregate folds;
 *   - graph: topo order (grand_total after subtotal), cycle + self-ref naming,
 *     unknown-ref detection;
 *   - recompute: two-channel pricing, repeater aggregation, runtime cycle = 0
 *     (no throw), mixed recurring + one-time, multi-interval;
 *   - the EZ §10 worked example reproduced in integer cents.
 *
 * Matcher discipline: ONLY `.toBe` / `.toEqual` (the web bun:test type shim has
 * no `.not`/`.toThrow`). Errors are asserted by catching into a boolean/string.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import { parse, collectRefs } from "../parse";
import { evalAst, toNumber, applyBinOp, roundHalfUp } from "../evaluate";
import type { Scope } from "../evaluate";
import { formatNumber } from "../format";
import {
  buildDependencyGraph,
  collectUnknownRefs,
  collectFormulaErrors,
  formatCycle,
} from "../graph";
import type { CalcFieldDef } from "../graph";
import { recomputeForm, recomputeAuthoritative } from "../recompute";

// ─── Helpers ────────────────────────────────────────────────────────────────

function scope(partial: Partial<Scope>): Scope {
  return {
    values: {},
    repeaters: {},
    treatBlankAs: 0,
    ...partial,
  };
}

/** Evaluate a formula string against a scope. */
function ev(formula: string, s: Scope): number {
  return evalAst(parse(formula), s);
}

/** Returns true if parsing the formula throws (a CalcError). */
function parseThrows(formula: string): boolean {
  try {
    parse(formula);
    return false;
  } catch {
    return true;
  }
}

/** Returns the thrown message, or "" if parsing succeeded. */
function parseError(formula: string): string {
  try {
    parse(formula);
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function calcField(key: string, formula: string, extra: Record<string, unknown> = {}): CalcFieldDef {
  return {
    key,
    type: "calculation",
    settings: JSON.stringify({ computed: true, formula, ...extra }),
  };
}

// ─── Tokenizer / parser ─────────────────────────────────────────────────────

describe("parse — grammar + errors", () => {
  test("number literals (int + decimal)", () => {
    expect(ev("42", scope({}))).toBe(42);
    expect(ev("3.14", scope({}))).toBe(3.14);
    expect(ev("0.07", scope({}))).toBe(0.07);
  });

  test("operator precedence: * binds tighter than +", () => {
    expect(ev("2 + 3 * 4", scope({}))).toBe(14);
    expect(ev("(2 + 3) * 4", scope({}))).toBe(20);
  });

  test("^ is right-associative and highest binary op", () => {
    expect(ev("2 ^ 3 ^ 2", scope({}))).toBe(512); // 2^(3^2) = 2^9
  });

  test("unary minus binds tighter than ^ (a complete primary)", () => {
    // `-2 ^ 2` parses as `(-2)^2` = 4. Unary `-` is resolved into a complete
    // operand before any binary operator (incl. ^) is considered. To get
    // -(2^2), write it explicitly: `-(2^2)` = -4.
    expect(ev("-2 ^ 2", scope({}))).toBe(4);
    expect(ev("-(2 ^ 2)", scope({}))).toBe(-4);
  });

  test("unary minus", () => {
    expect(ev("-5 + 2", scope({}))).toBe(-3);
    expect(ev("3 * -2", scope({}))).toBe(-6);
  });

  test("field references resolve from scope.values", () => {
    expect(ev("{a} + {b}", scope({ values: { a: 10, b: 5 } }))).toBe(15);
  });

  test("unknown function is a parse error", () => {
    expect(parseThrows("frobnicate(1)")).toBe(true);
  });

  test("wrong arity is a parse error", () => {
    expect(parseThrows("round(1, 2, 3)")).toBe(true);
    expect(parseThrows("if(1, 2)")).toBe(true);
    expect(parseThrows("abs()")).toBe(true);
  });

  test("bare {row.x} outside an aggregate is a parse error", () => {
    expect(parseThrows("{row.qty} + 1")).toBe(true);
    expect(parseThrows("round({row.qty})")).toBe(true);
  });

  test("{row.x} inside an aggregate parses", () => {
    expect(parseThrows("sum({row.qty})")).toBe(false);
  });

  test("lookup requires a quoted table name as 2nd arg", () => {
    expect(parseThrows("lookup({state}, fees)")).toBe(true);
    expect(parseThrows('lookup({state}, "fees")')).toBe(false);
  });

  test("unbalanced parens / unclosed brace error", () => {
    expect(parseThrows("(1 + 2")).toBe(true);
    expect(parseThrows("{unclosed")).toBe(true);
  });

  test("oversize formula is rejected (DoS cap)", () => {
    // A long "+1+1+1..." chain exceeds MAX_NODES (256).
    const big = "1" + "+1".repeat(400);
    expect(parseThrows(big)).toBe(true);
  });

  test("error message is friendly + non-empty", () => {
    const msg = parseError("1 +");
    expect(msg.length > 0).toBe(true);
  });
});

describe("collectRefs", () => {
  test("separates field refs from row refs", () => {
    const ast = parse("{a} + {b} + sum({row.qty})");
    const refs = collectRefs(ast);
    expect(refs.fieldRefs.has("a")).toBe(true);
    expect(refs.fieldRefs.has("b")).toBe(true);
    expect(refs.rowRefs.has("qty")).toBe(true);
    expect(refs.fieldRefs.has("qty")).toBe(false);
  });
});

// ─── toNumber / applyBinOp / round ──────────────────────────────────────────

describe("toNumber coercion (§9)", () => {
  test("blank / missing / non-numeric → treatBlankAs", () => {
    expect(toNumber("", 0)).toBe(0);
    expect(toNumber(undefined, 0)).toBe(0);
    expect(toNumber(null, 0)).toBe(0);
    expect(toNumber("abc", 0)).toBe(0);
    expect(toNumber("abc", 7)).toBe(7);
  });

  test("NaN never propagates", () => {
    expect(toNumber(NaN, 0)).toBe(0);
    expect(toNumber(Infinity, 0)).toBe(0);
  });

  test("true_false strings map to 1/0", () => {
    expect(toNumber("true", 0)).toBe(1);
    expect(toNumber("false", 0)).toBe(0);
    expect(toNumber("1", 0)).toBe(1);
    expect(toNumber("0", 0)).toBe(0);
  });
});

describe("applyBinOp guards (§9)", () => {
  test("divide-by-zero → 0", () => {
    expect(applyBinOp("/", 10, 0)).toBe(0);
  });
  test("modulo-by-zero → 0", () => {
    expect(applyBinOp("%", 10, 0)).toBe(0);
  });
  test("comparisons and logical → 1/0", () => {
    expect(applyBinOp(">", 3, 2)).toBe(1);
    expect(applyBinOp("<", 3, 2)).toBe(0);
    expect(applyBinOp("==", 2, 2)).toBe(1);
    expect(applyBinOp("&&", 1, 0)).toBe(0);
    expect(applyBinOp("||", 0, 1)).toBe(1);
  });

  test("divide-by-zero via a parsed formula → 0", () => {
    expect(ev("10 / 0", scope({}))).toBe(0);
    expect(ev("10 % 0", scope({}))).toBe(0);
  });
});

describe("roundHalfUp", () => {
  test("half rounds up", () => {
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(2.345, 2)).toBe(2.35);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
  });
});

// ─── Functions ──────────────────────────────────────────────────────────────

describe("functions", () => {
  test("sum / min / max n-ary", () => {
    expect(ev("sum(1, 2, 3, 4)", scope({}))).toBe(10);
    expect(ev("min(5, 2, 8)", scope({}))).toBe(2);
    expect(ev("max(5, 2, 8)", scope({}))).toBe(8);
  });

  test("round with places", () => {
    expect(ev("round(3.14159, 2)", scope({}))).toBe(3.14);
    expect(ev("round(2.5)", scope({}))).toBe(3);
  });

  test("ceil / floor / abs", () => {
    expect(ev("ceil(1.2)", scope({}))).toBe(2);
    expect(ev("floor(1.8)", scope({}))).toBe(1);
    expect(ev("abs(-5)", scope({}))).toBe(5);
  });

  test("if(cond, a, b)", () => {
    expect(ev("if(1, 10, 20)", scope({}))).toBe(10);
    expect(ev("if(0, 10, 20)", scope({}))).toBe(20);
    expect(ev("if({checked}, 99, 0)", scope({ values: { checked: "1" } }))).toBe(99);
    expect(ev("if({checked}, 99, 0)", scope({ values: { checked: "0" } }))).toBe(0);
  });

  test("lookup against a named table", () => {
    const s = scope({
      values: { state: "New York" },
      tables: { filingFees: { "New York": 200, Texas: 300, Wyoming: 100 } },
    });
    expect(ev('lookup({state}, "filingFees")', s)).toBe(200);
  });

  test("lookup miss → treatBlankAs", () => {
    const s = scope({
      values: { state: "Atlantis" },
      tables: { filingFees: { "New York": 200 } },
      treatBlankAs: 0,
    });
    expect(ev('lookup({state}, "filingFees")', s)).toBe(0);
  });
});

// ─── Aggregates over repeater rows (§3.6) ────────────────────────────────────

describe("repeater aggregation", () => {
  const rows = [{ qty: 2 }, { qty: 3 }, { qty: 0 }, { qty: 5 }];
  const s = scope({ repeaters: { items: rows }, repeaterKey: "items" });

  test("sum over rows", () => {
    expect(ev("sum({row.qty})", s)).toBe(10);
  });
  test("min / max over rows", () => {
    expect(ev("min({row.qty})", s)).toBe(0);
    expect(ev("max({row.qty})", s)).toBe(5);
  });
  test("count = rows with non-zero value", () => {
    expect(ev("count({row.qty})", s)).toBe(3);
  });
  test("average over rows", () => {
    expect(ev("average({row.qty})", s)).toBe(2.5);
  });
  test("empty repeater → aggregates 0", () => {
    const empty = scope({ repeaters: { items: [] }, repeaterKey: "items" });
    expect(ev("sum({row.qty})", empty)).toBe(0);
    expect(ev("average({row.qty})", empty)).toBe(0);
    expect(ev("min({row.qty})", empty)).toBe(0);
  });
});

// ─── format ─────────────────────────────────────────────────────────────────

describe("formatNumber (display)", () => {
  test("currency from minor units", () => {
    expect(formatNumber(74600, { style: "currency", currency: "USD", decimals: 2 }, true)).toBe(
      "$746.00",
    );
  });
  test("decimal with thousands separator", () => {
    expect(formatNumber(1234567, { style: "decimal", decimals: 0 })).toBe("1,234,567");
  });
  test("percent", () => {
    expect(formatNumber(0.075, { style: "percent", decimals: 1 })).toBe("7.5%");
  });
  test("prefix + suffix", () => {
    expect(formatNumber(398, { style: "currency", currency: "USD", decimals: 0, suffix: "/yr" })).toBe(
      "$398/yr",
    );
  });
});

// ─── Dependency graph ───────────────────────────────────────────────────────

describe("buildDependencyGraph", () => {
  test("grand_total evaluates after subtotal", () => {
    const fields: CalcFieldDef[] = [
      calcField("subtotal", "{a} + {b}"),
      calcField("grand_total", "{subtotal} * 1.1"),
    ];
    const g = buildDependencyGraph(fields);
    expect(g.cycles).toEqual([]);
    expect(g.order.indexOf("subtotal") < g.order.indexOf("grand_total")).toBe(true);
  });

  test("a → b → a cycle is detected + nameable", () => {
    const fields: CalcFieldDef[] = [
      calcField("a", "{b} + 1"),
      calcField("b", "{a} + 1"),
    ];
    const g = buildDependencyGraph(fields);
    expect(g.cycles.length > 0).toBe(true);
    const named = formatCycle(g.cycles[0]!);
    expect(named.includes("a")).toBe(true);
    expect(named.includes("b")).toBe(true);
  });

  test("self-reference a → a is a cycle", () => {
    const fields: CalcFieldDef[] = [calcField("a", "{a} + 1")];
    const g = buildDependencyGraph(fields);
    expect(g.cycles.length > 0).toBe(true);
  });

  test("collectUnknownRefs flags a missing field key", () => {
    const fields: CalcFieldDef[] = [calcField("total", "{nope} + 1")];
    const unknown = collectUnknownRefs(fields);
    expect(unknown.length).toBe(1);
    expect(unknown[0]!.missingRef).toBe("nope");
  });

  test("collectFormulaErrors flags an invalid formula", () => {
    const fields: CalcFieldDef[] = [calcField("bad", "1 +")];
    const errs = collectFormulaErrors(fields);
    expect(errs.length).toBe(1);
    expect(errs[0]!.fieldKey).toBe("bad");
  });
});

// ─── recompute ──────────────────────────────────────────────────────────────

describe("recomputeForm — cascade + cycle safety", () => {
  test("subtotal → grand_total cascades in one pass", () => {
    const fields: CalcFieldDef[] = [
      calcField("subtotal", "{a} + {b}"),
      calcField("grand_total", "{subtotal} + 100"),
    ];
    const r = recomputeForm(fields, { a: 10, b: 20 });
    expect(r.computed.subtotal).toBe(30);
    expect(r.computed.grand_total).toBe(130);
    expect(r.errors).toEqual([]);
  });

  test("runtime cycle resolves to 0 and is flagged — never throws", () => {
    const fields: CalcFieldDef[] = [
      calcField("a", "{b} + 1"),
      calcField("b", "{a} + 1"),
    ];
    const r = recomputeForm(fields, {});
    expect(r.computed.a).toBe(0);
    expect(r.computed.b).toBe(0);
    expect(r.errors.length).toBe(2);
  });
});

describe("recomputeForm — pricing (two-channel)", () => {
  test("mixed one-time + recurring kept in separate channels", () => {
    const fields: CalcFieldDef[] = [
      calcField("today", "746", { priceKind: "oneTime" }),
      calcField("yearly", "398", { priceKind: "recurring", interval: "year" }),
    ];
    const r = recomputeForm(fields, {});
    expect(r.pricing.oneTime).toBe(746);
    expect(r.pricing.recurring).toEqual([{ interval: "year", amount: 398 }]);
  });

  test("multiple recurring intervals → separate buckets", () => {
    const fields: CalcFieldDef[] = [
      calcField("m", "10", { priceKind: "recurring", interval: "month" }),
      calcField("y", "120", { priceKind: "recurring", interval: "year" }),
    ];
    const r = recomputeForm(fields, {});
    const byInterval = Object.fromEntries(
      r.pricing.recurring.map((x) => [x.interval, x.amount]),
    );
    expect(byInterval.month).toBe(10);
    expect(byInterval.year).toBe(120);
  });

  test("product line one-time contributes its lineTotal to oneTime", () => {
    const fields: CalcFieldDef[] = [
      {
        key: "ein",
        type: "product",
        settings: JSON.stringify({
          computed: true,
          priceMode: "fixed",
          unitPrice: 99,
          priceKind: "oneTime",
        }),
      },
    ];
    const r = recomputeForm(fields, {});
    expect(r.pricing.oneTime).toBe(99);
    const line = r.computed.ein;
    expect(typeof line === "object" && (line as { lineTotal: number }).lineTotal).toBe(99);
  });

  test("recurring product: first-period amount → oneTime, lineTotal → recurring", () => {
    // The EZ "Registered Agent: $99 first year, then $199/yr" model as a product.
    const fields: CalcFieldDef[] = [
      {
        key: "reg_agent",
        type: "product",
        settings: JSON.stringify({
          computed: true,
          priceMode: "fixed",
          unitPrice: 199, // ongoing recurring amount
          priceKind: "recurring",
          interval: "year",
          firstPeriodAmount: 99, // due today
          recurringLabel: "first year, then $199/yr",
        }),
      },
    ];
    const r = recomputeForm(fields, {});
    expect(r.pricing.oneTime).toBe(99); // first-period due today
    expect(r.pricing.recurring).toEqual([
      { interval: "year", amount: 199, label: "first year, then $199/yr" },
    ]);
  });

  test("product quantity driven by another field", () => {
    const fields: CalcFieldDef[] = [
      {
        key: "seats",
        type: "product",
        settings: JSON.stringify({
          computed: true,
          priceMode: "fixed",
          unitPrice: 25,
          quantityFieldKey: "qty",
          priceKind: "oneTime",
        }),
      },
    ];
    const r = recomputeForm(fields, { qty: "4" });
    const line = r.computed.seats as { lineTotal: number; quantity: number };
    expect(line.quantity).toBe(4);
    expect(line.lineTotal).toBe(100);
  });
});

// ─── EZ §10 worked example (authoritative, integer cents) ────────────────────

describe("EZ Entity Setup worked example (PRD §10)", () => {
  // NY, Advanced package, Registered Agent + Compliance + EIN.
  const fields: CalcFieldDef[] = [
    // Lookup-driven derived fields.
    calcField("state_fee", 'lookup({state}, "filingFees")', {
      tables: { filingFees: { "New York": 200, Texas: 300, Wyoming: 100 } },
    }),
    calcField("package_price", 'lookup({package}, "packages")', {
      tables: { packages: { Starter: 0, Advanced: 249, Premium: 399 } },
    }),
    // Intermediate one-time line amounts (plain derived numbers, priceKind none).
    calcField("line_ra_first", "if({addon_registered_agent}, 99, 0)"),
    calcField("line_compliance_first", "if({addon_compliance}, 99, 0)"),
    calcField("line_ein", "if({addon_ein}, 99, 0)"),
    // Totals (the money channels).
    calcField(
      "subtotal_one_time",
      "{state_fee} + {package_price} + {line_ra_first} + {line_compliance_first} + {line_ein}",
      { priceKind: "oneTime" },
    ),
    calcField(
      "recurring_yearly",
      "if({addon_registered_agent}, 199, 0) + if({addon_compliance}, 199, 0)",
      { priceKind: "recurring", interval: "year" },
    ),
  ];

  const answers = {
    state: "New York",
    package: "Advanced",
    addon_registered_agent: "1",
    addon_compliance: "1",
    addon_ein: "1",
  };

  test("dollar-space recompute reproduces $746 today + $398/yr", () => {
    const r = recomputeForm(fields, answers);
    expect(r.computed.state_fee).toBe(200);
    expect(r.computed.package_price).toBe(249);
    expect(r.computed.subtotal_one_time).toBe(746);
    expect(r.computed.recurring_yearly).toBe(398);
    expect(r.pricing.oneTime).toBe(746);
    expect(r.pricing.recurring).toEqual([{ interval: "year", amount: 398 }]);
  });

  test("authoritative recompute emits integer cents (74600 + 39800/yr)", () => {
    const r = recomputeAuthoritative(fields, answers);
    expect(r.pricing.oneTime).toBe(74600);
    expect(r.pricing.recurring).toEqual([{ interval: "year", amount: 39800 }]);
    // Money-flagged calculations are scaled to cents; plain derived stay as-is.
    expect(r.computed.subtotal_one_time).toBe(74600);
    expect(r.computed.recurring_yearly).toBe(39800);
    expect(r.computed.state_fee).toBe(200); // plain derived number, not money
  });

  test("unchecked add-ons drop their lines", () => {
    const r = recomputeAuthoritative(fields, {
      state: "Wyoming",
      package: "Starter",
    });
    // Wyoming $100 + Starter $0 + no add-ons = $100 today, nothing recurring.
    expect(r.pricing.oneTime).toBe(10000);
    expect(r.pricing.recurring).toEqual([]);
  });

  test("tamper test: a bogus client computed value is discarded (P4 trust boundary)", () => {
    // The submit mutation overwrites every computed field with the SERVER
    // recompute. Even if the client smuggles a tampered `subtotal_one_time`
    // value into the value map, recomputeAuthoritative re-derives the real one.
    const r = recomputeAuthoritative(fields, {
      ...answers,
      subtotal_one_time: "1", // bogus client value — must be ignored
      recurring_yearly: "1", // bogus client value — must be ignored
    });
    expect(r.computed.subtotal_one_time).toBe(74600); // recomputed, not 1
    expect(r.computed.recurring_yearly).toBe(39800); // recomputed, not 1
    expect(r.pricing.oneTime).toBe(74600);
  });
});
