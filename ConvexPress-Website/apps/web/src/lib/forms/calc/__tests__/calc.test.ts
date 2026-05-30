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
import { MAX_FORMULA_LENGTH } from "../grammar";
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

// ════════════════════════════════════════════════════════════════════════════
// WAVE TWO — hardening: parser depth, evaluator edges, integer-cents money,
// pricing channels, DoS guards, and explicit regression tests for the two
// confirmed float-money / negative-zero bugs fixed in recompute.ts + format.ts.
// ════════════════════════════════════════════════════════════════════════════

// ─── Tokenizer / parser — precedence, parens, unary, whitespace, malformed ───

describe("parse — precedence & associativity (full table)", () => {
  test("comparison binds looser than arithmetic", () => {
    // 1 + 1 > 1 parses as (1+1) > 1 = 1 (true).
    expect(ev("1 + 1 > 1", scope({}))).toBe(1);
    // 2 * 3 == 6 parses as (2*3) == 6 = 1.
    expect(ev("2 * 3 == 6", scope({}))).toBe(1);
  });

  test("logical binds loosest of all", () => {
    // 1 > 0 && 2 > 5 parses as (1>0) && (2>5) = 1 && 0 = 0.
    expect(ev("1 > 0 && 2 > 5", scope({}))).toBe(0);
    // 0 || 3 > 2 parses as 0 || (3>2) = 0 || 1 = 1.
    expect(ev("0 || 3 > 2", scope({}))).toBe(1);
  });

  test("% shares precedence with * and /", () => {
    // 2 + 10 % 3 = 2 + 1 = 3 (% binds before +).
    expect(ev("2 + 10 % 3", scope({}))).toBe(3);
    // 10 % 3 * 2 = (10%3)*2 = 1*2 = 2 (left-assoc, same prec).
    expect(ev("10 % 3 * 2", scope({}))).toBe(2);
  });

  test("subtraction is left-associative", () => {
    // 10 - 3 - 2 = (10-3)-2 = 5, not 10-(3-2)=9.
    expect(ev("10 - 3 - 2", scope({}))).toBe(5);
    // 100 / 5 / 2 = (100/5)/2 = 10, not 100/(5/2)=40.
    expect(ev("100 / 5 / 2", scope({}))).toBe(10);
  });

  test("parentheses override precedence", () => {
    expect(ev("2 * (3 + 4)", scope({}))).toBe(14);
    expect(ev("((1 + 2) * (3 + 4))", scope({}))).toBe(21);
  });

  test("deeply nested parens still parse (under depth cap)", () => {
    const nested = "(".repeat(20) + "7" + ")".repeat(20);
    expect(ev(nested, scope({}))).toBe(7);
  });
});

describe("parse — unary minus interactions", () => {
  test("double unary minus", () => {
    expect(ev("--5", scope({}))).toBe(5);
    expect(ev("3 - -2", scope({}))).toBe(5);
  });

  test("unary plus is a no-op", () => {
    expect(ev("+5", scope({}))).toBe(5);
    expect(ev("3 + +2", scope({}))).toBe(5);
  });

  test("unary minus on a parenthesized expr", () => {
    expect(ev("-(3 + 4)", scope({}))).toBe(-7);
    expect(ev("-(2 ^ 3)", scope({}))).toBe(-8);
  });

  test("unary minus on a field reference", () => {
    expect(ev("-{a}", scope({ values: { a: 9 } }))).toBe(-9);
  });

  test("unary minus on a function call", () => {
    expect(ev("-abs(-4)", scope({}))).toBe(-4);
  });
});

describe("parse — whitespace tolerance", () => {
  test("arbitrary internal whitespace is ignored", () => {
    expect(ev("  2   +    3  ", scope({}))).toBe(5);
    expect(ev("sum( 1 , 2 , 3 )", scope({}))).toBe(6);
  });

  test("tabs and newlines are whitespace", () => {
    expect(ev("1\t+\n2\r+ 3", scope({}))).toBe(6);
  });

  test("whitespace inside a brace ref is trimmed", () => {
    expect(ev("{  a  } + 1", scope({ values: { a: 4 } }))).toBe(5);
  });
});

describe("parse — malformed input → defined CalcError, never a crash", () => {
  test("trailing operator", () => {
    expect(parseThrows("1 +")).toBe(true);
    expect(parseThrows("* 3")).toBe(true);
  });

  test("two operators in a row (non-unary)", () => {
    expect(parseThrows("1 * / 2")).toBe(true);
  });

  test("empty / whitespace-only formula", () => {
    expect(parseThrows("")).toBe(true);
    expect(parseThrows("   ")).toBe(true);
  });

  test("empty / bad brace references", () => {
    expect(parseThrows("{}")).toBe(true);
    expect(parseThrows("{row.}")).toBe(true);
    expect(parseThrows("{ }")).toBe(true);
  });

  test("unexpected character", () => {
    expect(parseThrows("1 @ 2")).toBe(true);
    expect(parseThrows("1 # 2")).toBe(true);
  });

  test("unclosed string literal", () => {
    expect(parseThrows('lookup({x}, "fees)')).toBe(true);
  });

  test("dangling comma / empty call arg", () => {
    expect(parseThrows("sum(1,)")).toBe(true);
    expect(parseThrows("sum(,1)")).toBe(true);
  });

  test("a bare string outside lookup() is rejected", () => {
    expect(parseThrows('"hello"')).toBe(true);
    expect(parseThrows('"hi" + 1')).toBe(true);
  });

  test("function name without a call is rejected", () => {
    expect(parseThrows("abs")).toBe(true);
    expect(parseThrows("abs + 1")).toBe(true);
  });

  test("a malformed formula throws a CalcError (named), not a generic crash", () => {
    let name = "";
    try {
      parse("1 @ 2");
    } catch (err) {
      name = err instanceof Error ? err.name : "";
    }
    expect(name).toBe("CalcError");
  });

  test("a too-large literal coerces to non-finite → friendly parse error", () => {
    // 400 nines overflows to Infinity; the parser rejects it with a message
    // rather than letting Infinity leak into the AST.
    expect(parseThrows("9".repeat(400))).toBe(true);
  });
});

// ─── Evaluator — arithmetic, /0, references, blanks, nesting ─────────────────

describe("evaluate — core arithmetic operators", () => {
  test("+ - * / on numbers", () => {
    expect(ev("7 + 8", scope({}))).toBe(15);
    expect(ev("20 - 6", scope({}))).toBe(14);
    expect(ev("6 * 7", scope({}))).toBe(42);
    expect(ev("84 / 4", scope({}))).toBe(21);
  });

  test("modulo, including negative operands", () => {
    expect(ev("10 % 3", scope({}))).toBe(1);
    expect(ev("-7 % 3", scope({}))).toBe(-1);
    expect(ev("7 % -3", scope({}))).toBe(1);
  });

  test("division by zero and modulo by zero both → 0 (never Infinity/NaN)", () => {
    expect(ev("5 / 0", scope({}))).toBe(0);
    expect(ev("5 % 0", scope({}))).toBe(0);
    expect(ev("{a} / {b}", scope({ values: { a: 10, b: 0 } }))).toBe(0);
  });

  test("nested expression evaluates inside-out", () => {
    expect(ev("((2 + 3) * (4 - 1)) / 5", scope({}))).toBe(3);
    expect(ev("sum(1, 2) * (max(3, 4) + 1)", scope({}))).toBe(15);
  });
});

describe("evaluate — field references & blank behavior (§9)", () => {
  test("missing field reference resolves to treatBlankAs", () => {
    expect(ev("{missing} + 5", scope({ values: {} }))).toBe(5);
    expect(ev("{missing} + 5", scope({ values: {}, treatBlankAs: 10 }))).toBe(15);
  });

  test("blank-string field resolves to treatBlankAs", () => {
    expect(ev("{a} * 2", scope({ values: { a: "" } }))).toBe(0);
    expect(ev("{a} * 2", scope({ values: { a: "   " } }))).toBe(0);
  });

  test("numeric string field is coerced", () => {
    expect(ev("{a} + {b}", scope({ values: { a: "3", b: "4.5" } }))).toBe(7.5);
  });

  test("non-numeric string field resolves to treatBlankAs (no NaN leak)", () => {
    expect(ev("{a} + 1", scope({ values: { a: "abc" } }))).toBe(1);
  });

  test("Infinity / NaN stored in a field never propagate", () => {
    expect(ev("{a} * 2", scope({ values: { a: Infinity } }))).toBe(0);
    expect(ev("{a} * 2", scope({ values: { a: NaN } }))).toBe(0);
    expect(ev("{a} + 1", scope({ values: { a: -Infinity } }))).toBe(1);
  });

  test("a field holding an object/array → treatBlankAs (no injection)", () => {
    // Arbitrary stored values cannot smuggle behavior into the evaluator: a
    // non-primitive coerces to the blank fallback, never executes.
    expect(ev("{a} + 1", scope({ values: { a: { evil: true } } }))).toBe(1);
    expect(ev("{a} + 1", scope({ values: { a: [1, 2, 3] } }))).toBe(1);
    expect(ev("{a} + 1", scope({ values: { a: () => 99 } }))).toBe(1);
  });
});

describe("evaluate — overflow guards", () => {
  test("pow that overflows to Infinity → 0", () => {
    expect(ev("10 ^ 400", scope({}))).toBe(0);
  });

  test("0 ^ -1 (Infinity) → 0", () => {
    expect(ev("0 ^ -1", scope({}))).toBe(0);
  });

  test("multiplication overflow via pow → 0", () => {
    // Scientific notation isn't part of the closed grammar, so overflow is
    // reached through repeated powers: (10^200)^2 = 10^400 = Infinity → 0.
    expect(ev("(10 ^ 200) ^ 2", scope({}))).toBe(0);
  });

  test("scientific-notation literals are NOT part of the grammar", () => {
    // Defensive: `1e308` tokenizes as a number then a stray identifier → reject.
    expect(parseThrows("1e308")).toBe(true);
  });
});

// ─── Functions — extra coverage ──────────────────────────────────────────────

describe("functions — additional behavior", () => {
  test("nested function calls", () => {
    expect(ev("round(abs(-3.14159), 2)", scope({}))).toBe(3.14);
    expect(ev("max(min(5, 3), 2)", scope({}))).toBe(3);
  });

  test("count / average accept exactly one argument (arity is closed at 1)", () => {
    // The grammar caps count/average at arity 1: their meaningful form is the
    // single aggregate `count({row.x})`. Multi-operand calls are parse errors,
    // NOT silently accepted — the closed grammar rejects them.
    expect(parseThrows("count(0, 1, 0, 5)")).toBe(true);
    expect(parseThrows("average(2, 4, 6)")).toBe(true);
    expect(parseThrows("count(1)")).toBe(false);
    expect(parseThrows("average(5)")).toBe(false);
  });

  test("count of a single non-zero scalar is 1, of zero is 0", () => {
    expect(ev("count(5)", scope({}))).toBe(1);
    expect(ev("count(0)", scope({}))).toBe(0);
  });

  test("average of a single scalar is that scalar", () => {
    expect(ev("average(8)", scope({}))).toBe(8);
  });

  test("if() branch only the taken side matters for the result", () => {
    expect(ev("if(0, 1 / 0, 42)", scope({}))).toBe(42);
    expect(ev("if(1, 7, 1 / 0)", scope({}))).toBe(7);
  });

  test("if() with a comparison condition", () => {
    expect(ev("if({a} > 100, 5, 9)", scope({ values: { a: 150 } }))).toBe(5);
    expect(ev("if({a} > 100, 5, 9)", scope({ values: { a: 50 } }))).toBe(9);
  });

  test("lookup with a numeric-keyed table", () => {
    const s = scope({
      values: { tier: "2" },
      tables: { tierPrice: { "1": 10, "2": 20, "3": 30 } },
    });
    expect(ev('lookup({tier}, "tierPrice")', s)).toBe(20);
  });

  test("lookup against a missing table → treatBlankAs", () => {
    const s = scope({ values: { x: "a" }, tables: {}, treatBlankAs: 0 });
    expect(ev('lookup({x}, "nope")', s)).toBe(0);
  });

  test("round clamps places into [0,10]", () => {
    // Negative places clamp to 0.
    expect(ev("round(3.7, -1)", scope({}))).toBe(4);
  });
});

// ─── Graph — topology & cycles in depth ──────────────────────────────────────

describe("buildDependencyGraph — topology", () => {
  test("diamond dependency orders all upstream before downstream", () => {
    const fields: CalcFieldDef[] = [
      calcField("d", "{b} + {c}"),
      calcField("b", "{a} + 1"),
      calcField("c", "{a} + 2"),
      calcField("a", "5"),
    ];
    const g = buildDependencyGraph(fields);
    expect(g.cycles).toEqual([]);
    const pos = (k: string) => g.order.indexOf(k);
    expect(pos("a") < pos("b")).toBe(true);
    expect(pos("a") < pos("c")).toBe(true);
    expect(pos("b") < pos("d")).toBe(true);
    expect(pos("c") < pos("d")).toBe(true);
  });

  test("three-stage chain orders transitively", () => {
    const fields: CalcFieldDef[] = [
      calcField("c", "{b} * 2"),
      calcField("a", "1"),
      calcField("b", "{a} + 1"),
    ];
    const g = buildDependencyGraph(fields);
    expect(g.cycles).toEqual([]);
    expect(g.order.indexOf("a") < g.order.indexOf("b")).toBe(true);
    expect(g.order.indexOf("b") < g.order.indexOf("c")).toBe(true);
  });

  test("references to plain (non-computed) inputs add no edges", () => {
    // {input} is not a computed field, so `total` has in-degree 0 and the graph
    // is acyclic with a single node ordered.
    const fields: CalcFieldDef[] = [
      calcField("total", "{input} * 2"),
      { key: "input", type: "number", settings: null },
    ];
    const g = buildDependencyGraph(fields);
    expect(g.cycles).toEqual([]);
    expect(g.order).toEqual(["total"]);
  });
});

describe("buildDependencyGraph — cycles", () => {
  test("three-node cycle a → c → b → a is detected and nameable", () => {
    const fields: CalcFieldDef[] = [
      calcField("a", "{c} + 1"),
      calcField("b", "{a} + 1"),
      calcField("c", "{b} + 1"),
    ];
    const g = buildDependencyGraph(fields);
    expect(g.cycles.length > 0).toBe(true);
    const named = formatCycle(g.cycles[0]!);
    expect(named.includes("a")).toBe(true);
    expect(named.includes("b")).toBe(true);
    expect(named.includes("c")).toBe(true);
  });

  test("a cycle plus an independent acyclic node: acyclic node still orders", () => {
    const fields: CalcFieldDef[] = [
      calcField("a", "{b} + 1"),
      calcField("b", "{a} + 1"),
      calcField("standalone", "10"),
    ];
    const g = buildDependencyGraph(fields);
    expect(g.cycles.length > 0).toBe(true);
    expect(g.order.includes("standalone")).toBe(true);
  });

  test("formatCycle renders the wrap-around arrow form", () => {
    expect(formatCycle(["a", "b"])).toBe("a → b → a");
    expect(formatCycle(["x"])).toBe("x → x");
    expect(formatCycle([])).toBe("");
  });

  test("self-reference produces a one-node cycle", () => {
    const fields: CalcFieldDef[] = [calcField("a", "{a} + 1")];
    const g = buildDependencyGraph(fields);
    expect(g.cycles.length > 0).toBe(true);
    expect(g.order.includes("a")).toBe(false);
  });
});

describe("graph — error collection edges", () => {
  test("multiple unknown refs across fields are all flagged", () => {
    const fields: CalcFieldDef[] = [
      calcField("x", "{ghost1} + 1"),
      calcField("y", "{ghost2} + {ghost1}"),
    ];
    const unknown = collectUnknownRefs(fields);
    const missing = unknown.map((u) => u.missingRef).sort();
    expect(missing.includes("ghost1")).toBe(true);
    expect(missing.includes("ghost2")).toBe(true);
  });

  test("a valid graph yields no unknown refs and no formula errors", () => {
    const fields: CalcFieldDef[] = [
      calcField("a", "1"),
      calcField("b", "{a} + 1"),
    ];
    expect(collectUnknownRefs(fields)).toEqual([]);
    expect(collectFormulaErrors(fields)).toEqual([]);
  });

  test("a non-computed field's bad formula is NOT collected (not in pipeline)", () => {
    const fields: CalcFieldDef[] = [
      { key: "plain", type: "text", settings: JSON.stringify({ formula: "1 +" }) },
    ];
    expect(collectFormulaErrors(fields)).toEqual([]);
  });
});

// ─── format — integer-cents correctness + display rules ──────────────────────

describe("formatNumber — integer-cents money (money is never a float)", () => {
  test("cents → dollars across magnitudes", () => {
    expect(formatNumber(0, { style: "currency", decimals: 2 }, true)).toBe("$0.00");
    expect(formatNumber(1, { style: "currency", decimals: 2 }, true)).toBe("$0.01");
    expect(formatNumber(99, { style: "currency", decimals: 2 }, true)).toBe("$0.99");
    expect(formatNumber(100, { style: "currency", decimals: 2 }, true)).toBe("$1.00");
    expect(formatNumber(74600, { style: "currency", decimals: 2 }, true)).toBe("$746.00");
    expect(
      formatNumber(123456789, { style: "currency", decimals: 2 }, true),
    ).toBe("$1,234,567.89");
  });

  test("a cents integer with no fraction still renders 2dp", () => {
    expect(formatNumber(50000, { style: "currency", decimals: 2 }, true)).toBe("$500.00");
  });

  test("zero-decimal currency (JPY) from minor units (scale 1)", () => {
    expect(
      formatNumber(1000, { style: "currency", currency: "JPY", decimals: 0 }, true),
    ).toBe("¥1,000");
  });

  test("unknown currency code falls back to a CODE prefix", () => {
    expect(
      formatNumber(500, { style: "currency", currency: "ZZZ", decimals: 2 }, true),
    ).toBe("ZZZ 5.00");
  });

  test("thousands separator can be disabled", () => {
    expect(
      formatNumber(1234567, { style: "decimal", decimals: 0, thousandsSeparator: false }),
    ).toBe("1234567");
  });

  test("negative currency renders a leading minus", () => {
    expect(formatNumber(-50000, { style: "currency", decimals: 2 }, true)).toBe("-$500.00");
  });

  test("REGRESSION: a value that rounds to zero never shows '-$0.00'", () => {
    // -0.001 → 0.00 at 2dp; sign must come from the rounded magnitude.
    expect(formatNumber(-0.001, { style: "currency", decimals: 2 })).toBe("$0.00");
    expect(formatNumber(-0.004, { style: "decimal", decimals: 2 })).toBe("0.00");
    expect(formatNumber(-0.4, { style: "decimal", decimals: 0 })).toBe("0");
    expect(formatNumber(-0, { style: "currency", decimals: 2 })).toBe("$0.00");
  });

  test("non-finite input renders as zero", () => {
    expect(formatNumber(Infinity, { style: "currency", decimals: 2 })).toBe("$0.00");
    expect(formatNumber(NaN, { style: "decimal", decimals: 2 })).toBe("0.00");
  });

  test("decimals are clamped to [0,4]", () => {
    expect(formatNumber(1.23456, { style: "decimal", decimals: 99 })).toBe("1.2346");
    expect(formatNumber(1.23456, { style: "decimal", decimals: -5 })).toBe("1");
  });
});

// ─── recompute — money correctness (integer cents, no penny drift) ───────────

describe("recomputeAuthoritative — integer cents are always safe integers", () => {
  test("REGRESSION: half-cent dollar values round half-up, never drop a penny", () => {
    // Pre-fix, roundMoney(1.005)=1.00 and toCents floated to 100 — a penny low.
    const cases: Array<[string, number]> = [
      ["1.005", 101],
      ["0.145", 15],
      ["1.255", 126],
      ["9.995", 1000],
      ["2.675", 268],
    ];
    for (const [formula, wantCents] of cases) {
      const fields = [calcField("t", formula, { priceKind: "oneTime" })];
      const r = recomputeAuthoritative(fields, {});
      expect(r.pricing.oneTime).toBe(wantCents);
    }
  });

  test("REGRESSION: the * scale step can't shave a cent (70.07 → 7007)", () => {
    // 70.07 * 100 is 7006.999999999999 in IEEE-754; must still emit 7007.
    const fields = [calcField("t", "70.07", { priceKind: "oneTime" })];
    expect(recomputeAuthoritative(fields, {}).pricing.oneTime).toBe(7007);
  });

  test("dollar-space roundMoney also rounds half-up (0.145 → 0.15)", () => {
    const fields = [calcField("t", "0.145", { priceKind: "oneTime" })];
    expect(recomputeForm(fields, {}).pricing.oneTime).toBe(0.15);
  });

  test("authoritative cents are integers for tax-like products", () => {
    const fields: CalcFieldDef[] = [
      {
        key: "p",
        type: "product",
        settings: JSON.stringify({
          computed: true,
          priceMode: "calculated",
          unitPriceFormula: "19.99 * 1.0825",
          priceKind: "oneTime",
        }),
      },
    ];
    const r = recomputeAuthoritative(fields, {});
    expect(Number.isInteger(r.pricing.oneTime)).toBe(true);
    const line = r.computed.p as { lineTotal: number };
    expect(Number.isInteger(line.lineTotal)).toBe(true);
  });

  test("aggregated float lines sum to an exact cents integer", () => {
    const fields: CalcFieldDef[] = [];
    for (let i = 0; i < 3; i++) {
      fields.push(calcField("l" + i, "0.10", { priceKind: "oneTime" }));
    }
    const r = recomputeAuthoritative(fields, {});
    expect(r.pricing.oneTime).toBe(30);
  });

  test("zero-decimal currency scale (JPY, scale 1) yields integers", () => {
    const fields = [calcField("t", "1000", { priceKind: "oneTime" })];
    const r = recomputeAuthoritative(fields, {}, {}, 1);
    expect(r.pricing.oneTime).toBe(1000);
  });
});

// ─── recompute — pricing channels in depth ───────────────────────────────────

describe("recomputeForm — pricing channel edge cases", () => {
  test("a zero-amount recurring bucket is omitted entirely", () => {
    // All recurring add-ons unchecked → the bucket nets to 0 → dropped.
    const fields: CalcFieldDef[] = [
      calcField("r", "if({on}, 50, 0)", { priceKind: "recurring", interval: "month" }),
    ];
    const r = recomputeForm(fields, { on: "0" });
    expect(r.pricing.recurring).toEqual([]);
  });

  test("multiple recurring lines on the SAME interval are summed into one bucket", () => {
    const fields: CalcFieldDef[] = [
      calcField("a", "10", { priceKind: "recurring", interval: "month" }),
      calcField("b", "15", { priceKind: "recurring", interval: "month" }),
    ];
    const r = recomputeForm(fields, {});
    expect(r.pricing.recurring).toEqual([{ interval: "month", amount: 25 }]);
  });

  test("plain derived numbers (priceKind none) never contribute to pricing", () => {
    const fields: CalcFieldDef[] = [
      calcField("derived", "{a} * 2"), // no priceKind → not money
      calcField("charge", "100", { priceKind: "oneTime" }),
    ];
    const r = recomputeForm(fields, { a: 50 });
    expect(r.computed.derived).toBe(100);
    expect(r.pricing.oneTime).toBe(100); // only `charge`, not `derived`
  });

  test("one-time + two distinct recurring intervals coexist", () => {
    const fields: CalcFieldDef[] = [
      calcField("now", "500", { priceKind: "oneTime" }),
      calcField("m", "9", { priceKind: "recurring", interval: "month" }),
      calcField("y", "90", { priceKind: "recurring", interval: "year" }),
    ];
    const r = recomputeForm(fields, {});
    expect(r.pricing.oneTime).toBe(500);
    const byInterval = Object.fromEntries(
      r.pricing.recurring.map((x) => [x.interval, x.amount]),
    );
    expect(byInterval.month).toBe(9);
    expect(byInterval.year).toBe(90);
  });

  test("multiple product line items aggregate into oneTime", () => {
    const product = (key: string, unitPrice: number): CalcFieldDef => ({
      key,
      type: "product",
      settings: JSON.stringify({
        computed: true,
        priceMode: "fixed",
        unitPrice,
        priceKind: "oneTime",
      }),
    });
    const r = recomputeForm([product("a", 99), product("b", 50), product("c", 25)], {});
    expect(r.pricing.oneTime).toBe(174);
  });

  test("userDefined product reads the respondent's entered unit price", () => {
    const fields: CalcFieldDef[] = [
      {
        key: "donation",
        type: "product",
        settings: JSON.stringify({
          computed: true,
          priceMode: "userDefined",
          priceKind: "oneTime",
        }),
      },
    ];
    const r = recomputeForm(fields, { donation: "42.50" });
    const line = r.computed.donation as { unitPrice: number; lineTotal: number };
    expect(line.unitPrice).toBe(42.5);
    expect(line.lineTotal).toBe(42.5);
  });

  test("a cyclic product resolves to a zeroed line and is flagged, never throws", () => {
    // Two products whose quantities reference each other form a cycle.
    const fields: CalcFieldDef[] = [
      {
        key: "p1",
        type: "product",
        settings: JSON.stringify({
          computed: true,
          priceMode: "fixed",
          unitPrice: 10,
          quantityFieldKey: "p2",
          priceKind: "oneTime",
        }),
      },
      {
        key: "p2",
        type: "product",
        settings: JSON.stringify({
          computed: true,
          priceMode: "fixed",
          unitPrice: 10,
          quantityFieldKey: "p1",
          priceKind: "oneTime",
        }),
      },
    ];
    const r = recomputeForm(fields, {});
    expect(r.errors.length).toBe(2);
    const p1 = r.computed.p1 as { lineTotal: number };
    expect(p1.lineTotal).toBe(0);
  });
});

// ─── DoS guards — explicit cap coverage ──────────────────────────────────────

describe("DoS guards (parser caps exist and fire)", () => {
  test("node-count cap: a long flat operator chain is rejected", () => {
    const big = "1" + "+1".repeat(400);
    expect(parseThrows(big)).toBe(true);
  });

  test("depth cap: deeply nested parens are rejected", () => {
    const deep = "(".repeat(100) + "1" + ")".repeat(100);
    let name = "";
    try {
      parse(deep);
    } catch (err) {
      name = err instanceof Error ? err.name : "";
    }
    expect(name).toBe("CalcError");
  });

  test("depth cap: deeply nested function calls are rejected", () => {
    let formula = "1";
    for (let i = 0; i < 100; i++) formula = `abs(${formula})`;
    expect(parseThrows(formula)).toBe(true);
  });

  test("length cap: a formula longer than MAX_FORMULA_LENGTH is rejected", () => {
    const huge = "1" + " + 1".repeat(MAX_FORMULA_LENGTH);
    let name = "";
    try {
      parse(huge);
    } catch (err) {
      name = err instanceof Error ? err.name : "";
    }
    expect(name).toBe("CalcError");
  });

  test("a formula right at a modest size still parses (cap is not over-tight)", () => {
    // 30 additions = ~61 nodes, well under MAX_NODES (256).
    const ok = "1" + "+1".repeat(30);
    expect(ev(ok, scope({}))).toBe(31);
  });
});
