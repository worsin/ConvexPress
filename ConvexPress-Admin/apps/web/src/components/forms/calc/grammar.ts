/**
 * ConvexPress Forms — Calculation & Pricing core: grammar
 *
 * CANONICAL SOURCE. This file is authored ONCE here, under the Admin backend
 * forms extension (so the server submit path imports it directly), then mirrored
 * BYTE-IDENTICALLY to the Admin frontend and the Website. Keep all three copies
 * in lockstep — same node union, same tables, same caps. The only thing that may
 * EVER differ between copies is nothing: these files are diff-identical.
 *
 * MIRRORS (must stay byte-identical):
 *   - Admin FE: apps/web/src/components/forms/calc/grammar.ts
 *   - Website:  ConvexPress-Website/apps/web/src/lib/forms/calc/grammar.ts
 *
 * Pure module: no `window`, no Convex, no React, NO `eval`/`Function`/dynamic
 * code path. The formula text is tokenized → parsed to this closed AST → walked
 * by a hand-written evaluator. There is nothing to escape into.
 *
 * The grammar is intentionally small and CLOSED (anything not listed is a parse
 * error): number literals, `{field_key}` references, `{row.subKey}` aggregate
 * references, the operators below, parentheses, and a fixed function allow-list.
 */

// ─── AST node union (closed) ────────────────────────────────────────────────

/** Binary operators, in no particular order (precedence lives in BIN_PRECEDENCE). */
export type BinOp =
  | "^"
  | "*"
  | "/"
  | "%"
  | "+"
  | "-"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||";

/** The fixed function allow-list. Anything else is a parse error. */
export type FnName =
  | "sum"
  | "min"
  | "max"
  | "count"
  | "average"
  | "round"
  | "ceil"
  | "floor"
  | "abs"
  | "if"
  | "lookup";

/**
 * The closed AST node union the evaluator walks. No identifiers, property
 * access, indexing, string methods, or function values exist — there is no path
 * from formula text to host capabilities.
 */
export type Node =
  | { kind: "num"; value: number }
  | { kind: "ref"; key: string } // {field_key}
  | { kind: "rowref"; key: string } // {row.subKey} — aggregate scope only
  | { kind: "str"; value: string } // string literal — only as lookup() table name
  | { kind: "unary"; op: "-"; arg: Node }
  | { kind: "binary"; op: BinOp; left: Node; right: Node }
  | { kind: "call"; fn: FnName; args: Node[] };

// ─── Operator precedence ────────────────────────────────────────────────────

/**
 * Binary operator precedence (higher binds tighter). `^` is right-associative
 * and highest; logical `&& ||` are lowest. Used by the Pratt parser.
 */
export const BIN_PRECEDENCE: Record<BinOp, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "^": 7,
};

/** Operators that associate right-to-left (only `^`). */
export const RIGHT_ASSOC: Partial<Record<BinOp, true>> = {
  "^": true,
};

/**
 * NOTE on unary minus: the parser resolves unary `-` into a COMPLETE primary
 * before any binary operator (including `^`) is considered, so `-2 ^ 2` parses
 * as `(-2) ^ 2` = 4, not `-(2 ^ 2)`. Write `-(2 ^ 2)` for the latter. This is a
 * deliberate, unambiguous choice; form formulas never rely on the alternative.
 */

// ─── Function arity allow-list ──────────────────────────────────────────────

/**
 * Allowed argument counts per function. `min`/`max` is inclusive; an exact arity
 * sets min===max. A function whose call arity falls outside [min, max] is a parse
 * error. `sum/min/max` accept n-ary operands OR a single aggregate `{row.x}` arg;
 * `count/average` require exactly one aggregate arg; `lookup` is `(ref, "table")`.
 */
export const FN_ARITY: Record<FnName, { min: number; max: number }> = {
  sum: { min: 1, max: 64 },
  min: { min: 1, max: 64 },
  max: { min: 1, max: 64 },
  count: { min: 1, max: 1 },
  average: { min: 1, max: 1 },
  round: { min: 1, max: 2 },
  ceil: { min: 1, max: 1 },
  floor: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  if: { min: 3, max: 3 },
  lookup: { min: 2, max: 2 },
};

/** Aggregate functions: their single `{row.x}` form folds over repeater rows. */
export const AGGREGATE_FNS: Set<FnName> = new Set([
  "sum",
  "min",
  "max",
  "count",
  "average",
]);

// ─── DoS caps ───────────────────────────────────────────────────────────────

/** Max AST nodes per formula (parser rejects past this — DoS guard). */
export const MAX_NODES = 256;

/** Max AST nesting depth per formula (parser rejects past this — DoS guard). */
export const MAX_DEPTH = 32;

/** Max raw formula string length accepted by the tokenizer (DoS guard). */
export const MAX_FORMULA_LENGTH = 4096;

// ─── Error type ─────────────────────────────────────────────────────────────

/**
 * Friendly, position-aware error thrown by the parser. The evaluator never
 * throws CalcError at runtime (it degrades to a finite number); CalcError is a
 * SAVE-TIME / parse-time signal surfaced in the builder.
 */
export class CalcError extends Error {
  /** Character offset into the formula where the error was detected (best-effort). */
  readonly position: number;

  constructor(message: string, position = 0) {
    super(message);
    this.name = "CalcError";
    this.position = position;
  }
}
