/**
 * ConvexPress Forms — Calculation & Pricing core: evaluator
 *
 * CANONICAL SOURCE (authored once, mirrored byte-identically). See grammar.ts.
 * MIRRORS:
 *   - Admin FE: apps/web/src/components/forms/calc/evaluate.ts
 *   - Website:  ConvexPress-Website/apps/web/src/lib/forms/calc/evaluate.ts
 *
 * `evalAst(node, scope) -> number`. A pure, deterministic, side-effect-free
 * recursive walk over the closed AST. NO `eval`/`Function`. The result is ALWAYS
 * a finite number:
 *   - non-numeric / empty / NaN operands coerce to `scope.treatBlankAs` (def 0);
 *   - divide-by-zero and modulo-by-zero return 0 (never Infinity/NaN);
 *   - comparisons and logical ops return 1 / 0.
 *
 * `FN_TABLE` is a static record of hand-written implementations. Aggregate
 * functions (`sum/min/max/count/average`) fold a `{row.x}` sub-key over the rows
 * of `scope.repeaters[scope.repeaterKey]`. `lookup(ref, "table")` resolves a value
 * from `scope.tables`.
 */

import { CalcError, type BinOp, type FnName, type Node } from "./grammar";

// ─── Scope ──────────────────────────────────────────────────────────────────

/** A single repeater row: a map of sub-field key → raw value. */
export type RepeaterRow = Record<string, unknown>;

/** Evaluation scope passed to {@link evalAst}. */
export interface Scope {
  /** fieldKey -> raw value (string/number/etc.). Coerced via toNumber. */
  values: Record<string, unknown>;
  /** repeaterKey -> array of row value maps (for `{row.x}` aggregation). */
  repeaters: Record<string, RepeaterRow[]>;
  /** The enclosing repeater key for `{row.x}` refs in THIS formula (if any). */
  repeaterKey?: string;
  /** Named lookup tables for `lookup(ref, "table")`. tableName -> key -> number. */
  tables?: Record<string, Record<string, number>>;
  /** Value a blank/non-numeric/missing operand resolves to (default 0). */
  treatBlankAs: number;
}

// ─── Coercion ───────────────────────────────────────────────────────────────

/**
 * Coerce an arbitrary stored value to a finite number. Empty string, null,
 * undefined, non-numeric strings, booleans-as-strings, and NaN all fall back to
 * `treatBlankAs`. "1"/"0"/"true"/"false" (true_false fields) map to 1/0. Never
 * propagates NaN/Infinity.
 */
export function toNumber(value: unknown, treatBlankAs: number): number {
  if (value === null || value === undefined) return treatBlankAs;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : treatBlankAs;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return treatBlankAs;
    if (trimmed === "true") return 1;
    if (trimmed === "false") return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : treatBlankAs;
  }
  return treatBlankAs;
}

/** Round half-up to `places` decimals; finite-safe. */
export function roundHalfUp(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  const p = Math.max(0, Math.min(10, Math.trunc(places)));
  const factor = Math.pow(10, p);
  // Epsilon nudges values like 2.675 that float-represent just below the half.
  const shifted = value * factor;
  const rounded = Math.floor(shifted + 0.5 + Number.EPSILON * Math.abs(shifted));
  const result = rounded / factor;
  return Number.isFinite(result) ? result : 0;
}

// ─── Binary ops ─────────────────────────────────────────────────────────────

/** Apply a binary operator with all the §9 guards. Always returns finite. */
export function applyBinOp(op: BinOp, l: number, r: number): number {
  switch (op) {
    case "+":
      return finite(l + r);
    case "-":
      return finite(l - r);
    case "*":
      return finite(l * r);
    case "/":
      return r === 0 ? 0 : finite(l / r);
    case "%":
      return r === 0 ? 0 : finite(l % r);
    case "^":
      return finite(Math.pow(l, r));
    case "<":
      return l < r ? 1 : 0;
    case "<=":
      return l <= r ? 1 : 0;
    case ">":
      return l > r ? 1 : 0;
    case ">=":
      return l >= r ? 1 : 0;
    case "==":
      return l === r ? 1 : 0;
    case "!=":
      return l !== r ? 1 : 0;
    case "&&":
      return l !== 0 && r !== 0 ? 1 : 0;
    case "||":
      return l !== 0 || r !== 0 ? 1 : 0;
  }
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

// ─── Aggregate fold ─────────────────────────────────────────────────────────

/** Collect the numeric values of a `{row.x}` sub-key across the scoped rows. */
function rowValues(rowKey: string, scope: Scope): number[] {
  const key = scope.repeaterKey;
  const rows = key ? scope.repeaters[key] ?? [] : [];
  return rows.map((row) => toNumber(row[rowKey], scope.treatBlankAs));
}

/** Fold an aggregate over `{row.x}` rows. `count` = rows whose value !== 0. */
function aggregate(fn: FnName, rowKey: string, scope: Scope): number {
  const vals = rowValues(rowKey, scope);
  switch (fn) {
    case "sum":
      return finite(vals.reduce((a, b) => a + b, 0));
    case "min":
      return vals.length ? finite(Math.min(...vals)) : 0;
    case "max":
      return vals.length ? finite(Math.max(...vals)) : 0;
    case "count":
      return vals.filter((v) => v !== 0).length;
    case "average":
      return vals.length
        ? finite(vals.reduce((a, b) => a + b, 0) / vals.length)
        : 0;
    default:
      return 0;
  }
}

// ─── Function table ─────────────────────────────────────────────────────────

/**
 * Resolve a lookup(ref, "table") — the ref's CURRENT value (as a string key)
 * indexes the named table. Missing table / missing key → treatBlankAs.
 */
function evalLookup(args: Node[], scope: Scope): number {
  const refNode = args[0]!;
  const tableNode = args[1]!;
  if (tableNode.kind !== "str") return scope.treatBlankAs;

  // The lookup key is the RAW value of the referenced field (a string label like
  // "New York"), not its numeric coercion.
  let rawKey: unknown;
  if (refNode.kind === "ref") {
    rawKey = scope.values[refNode.key];
  } else {
    // Non-ref first arg: evaluate numerically and stringify as the key.
    rawKey = String(evalAst(refNode, scope));
  }
  const keyStr = rawKey === null || rawKey === undefined ? "" : String(rawKey);

  const table = scope.tables?.[tableNode.value];
  if (!table) return scope.treatBlankAs;
  const hit = table[keyStr];
  return typeof hit === "number" && Number.isFinite(hit)
    ? hit
    : scope.treatBlankAs;
}

/** Apply a function node. Aggregate `{row.x}` forms fold; the rest are scalar. */
function applyFn(fn: FnName, args: Node[], scope: Scope): number {
  // Aggregate single-arg `{row.x}` form.
  const first = args[0];
  if (args.length === 1 && first && first.kind === "rowref") {
    return aggregate(fn, first.key, scope);
  }

  switch (fn) {
    case "sum":
      return finite(args.reduce((acc, a) => acc + evalAst(a, scope), 0));
    case "min":
      return finite(Math.min(...args.map((a) => evalAst(a, scope))));
    case "max":
      return finite(Math.max(...args.map((a) => evalAst(a, scope))));
    case "count":
      // count() over operands = number of non-zero operands.
      return args.filter((a) => evalAst(a, scope) !== 0).length;
    case "average": {
      if (args.length === 0) return 0;
      const total = args.reduce((acc, a) => acc + evalAst(a, scope), 0);
      return finite(total / args.length);
    }
    case "round": {
      const value = evalAst(args[0]!, scope);
      const places = args.length > 1 ? evalAst(args[1]!, scope) : 0;
      return roundHalfUp(value, places);
    }
    case "ceil":
      return finite(Math.ceil(evalAst(args[0]!, scope)));
    case "floor":
      return finite(Math.floor(evalAst(args[0]!, scope)));
    case "abs":
      return finite(Math.abs(evalAst(args[0]!, scope)));
    case "if": {
      const cond = evalAst(args[0]!, scope);
      return cond !== 0 ? evalAst(args[1]!, scope) : evalAst(args[2]!, scope);
    }
    case "lookup":
      return evalLookup(args, scope);
  }
}

// ─── Walker ─────────────────────────────────────────────────────────────────

/**
 * Evaluate a parsed AST node against a scope. Pure + deterministic; the result is
 * always a finite number. A stray `rowref` outside an aggregate (which the parser
 * already rejects) would throw — but that path is unreachable for parsed ASTs.
 */
export function evalAst(node: Node, scope: Scope): number {
  switch (node.kind) {
    case "num":
      return Number.isFinite(node.value) ? node.value : scope.treatBlankAs;
    case "str":
      // A bare string has no numeric meaning outside lookup(); treat as blank.
      return scope.treatBlankAs;
    case "ref":
      return toNumber(scope.values[node.key], scope.treatBlankAs);
    case "rowref":
      // Unreachable for parsed ASTs (parser forbids bare rowrefs). Defensive.
      throw new CalcError("Repeater reference outside an aggregate.", 0);
    case "unary":
      return finite(-evalAst(node.arg, scope));
    case "binary": {
      const l = evalAst(node.left, scope);
      const r = evalAst(node.right, scope);
      return applyBinOp(node.op, l, r);
    }
    case "call":
      return applyFn(node.fn, node.args, scope);
  }
}
