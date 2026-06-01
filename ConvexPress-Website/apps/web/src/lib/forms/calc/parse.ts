/**
 * ConvexPress Forms — Calculation & Pricing core: tokenizer + Pratt parser
 *
 * CANONICAL SOURCE (authored once, mirrored byte-identically). See grammar.ts.
 * MIRRORS:
 *   - Admin FE: apps/web/src/components/forms/calc/parse.ts
 *   - Website:  ConvexPress-Website/apps/web/src/lib/forms/calc/parse.ts
 *
 * `parse(formula) -> Node` turns a formula string into the closed AST from
 * grammar.ts using a hand-written scanner + Pratt parser only.
 * Enforces: the function allow-list + arity, `{row.x}` only as an aggregate
 * function argument, and node-count / depth caps (DoS guard). On any violation it
 * throws CalcError with a friendly message + position.
 *
 * `collectRefs(ast)` returns the `{field_key}` and `{row.x}` leaves so the
 * dependency graph + the aggregate resolver know what a formula reads.
 */

import {
  BIN_PRECEDENCE,
  RIGHT_ASSOC,
  FN_ARITY,
  AGGREGATE_FNS,
  MAX_NODES,
  MAX_DEPTH,
  MAX_FORMULA_LENGTH,
  CalcError,
  type BinOp,
  type FnName,
  type Node,
} from "./grammar";

// ─── Tokens ─────────────────────────────────────────────────────────────────

type TokKind =
  | "num"
  | "ref" // {field_key}
  | "rowref" // {row.subKey}
  | "ident" // bare function name (followed by "(")
  | "op" // operator
  | "lparen"
  | "rparen"
  | "comma"
  | "string"
  | "eof";

interface Token {
  kind: TokKind;
  value: string;
  pos: number;
}

const KNOWN_FN_NAMES: Set<string> = new Set(Object.keys(FN_ARITY));

/** Multi-char operators must be tried before their single-char prefixes. */
const MULTI_OPS = ["<=", ">=", "==", "!=", "&&", "||"];
const SINGLE_OPS = new Set([
  "^",
  "*",
  "/",
  "%",
  "+",
  "-",
  "<",
  ">",
]);

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isIdentChar(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

/** Tokenize a formula string into a flat token list (+ trailing eof). */
function tokenize(src: string): Token[] {
  if (src.length > MAX_FORMULA_LENGTH) {
    throw new CalcError("Formula is too long.", 0);
  }
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // Whitespace.
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }

    // Number literal: digits with an optional single decimal point.
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      const start = i;
      let seenDot = false;
      while (i < n) {
        const d = src[i];
        if (isDigit(d)) {
          i += 1;
        } else if (d === "." && !seenDot) {
          seenDot = true;
          i += 1;
        } else {
          break;
        }
      }
      tokens.push({ kind: "num", value: src.slice(start, i), pos: start });
      continue;
    }

    // Reference: {field_key} or {row.subKey}.
    if (c === "{") {
      const start = i;
      const end = src.indexOf("}", i + 1);
      if (end === -1) {
        throw new CalcError("Unclosed '{' in field reference.", start);
      }
      const inner = src.slice(i + 1, end).trim();
      if (inner.length === 0) {
        throw new CalcError("Empty field reference '{}'.", start);
      }
      if (inner.startsWith("row.")) {
        const subKey = inner.slice(4).trim();
        if (subKey.length === 0) {
          throw new CalcError("Empty repeater reference '{row.}'.", start);
        }
        tokens.push({ kind: "rowref", value: subKey, pos: start });
      } else {
        tokens.push({ kind: "ref", value: inner, pos: start });
      }
      i = end + 1;
      continue;
    }

    // String literal (double or single quoted) — only valid as a lookup() arg.
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      let j = i + 1;
      let out = "";
      while (j < n && src[j] !== quote) {
        out += src[j];
        j += 1;
      }
      if (j >= n) {
        throw new CalcError("Unclosed string literal.", start);
      }
      tokens.push({ kind: "string", value: out, pos: start });
      i = j + 1;
      continue;
    }

    // Identifier (function name) — must be immediately applied as a call.
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentChar(src[i])) i += 1;
      tokens.push({ kind: "ident", value: src.slice(start, i), pos: start });
      continue;
    }

    // Parens / comma.
    if (c === "(") {
      tokens.push({ kind: "lparen", value: "(", pos: i });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen", value: ")", pos: i });
      i += 1;
      continue;
    }
    if (c === ",") {
      tokens.push({ kind: "comma", value: ",", pos: i });
      i += 1;
      continue;
    }

    // Operators: try multi-char first, then single-char.
    const two = src.slice(i, i + 2);
    if (MULTI_OPS.includes(two)) {
      tokens.push({ kind: "op", value: two, pos: i });
      i += 2;
      continue;
    }
    if (SINGLE_OPS.has(c)) {
      tokens.push({ kind: "op", value: c, pos: i });
      i += 1;
      continue;
    }

    throw new CalcError(`Unexpected character '${c}'.`, i);
  }

  tokens.push({ kind: "eof", value: "", pos: n });
  return tokens;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * A recursive-descent / Pratt parser over the token list. Tracks a running node
 * count and recursion depth so an oversize/over-nested formula is rejected.
 */
class Parser {
  private readonly tokens: Token[];
  private idx = 0;
  private nodeCount = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.idx]!;
  }

  private next(): Token {
    return this.tokens[this.idx++]!;
  }

  private expect(kind: TokKind, what: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new CalcError(`Expected ${what}.`, t.pos);
    }
    return this.next();
  }

  /** Count a node toward the DoS cap; throws once the cap is exceeded. */
  private count(node: Node): Node {
    this.nodeCount += 1;
    if (this.nodeCount > MAX_NODES) {
      throw new CalcError("Formula is too large.", this.peek().pos);
    }
    return node;
  }

  parseProgram(): Node {
    const expr = this.parseExpr(0, 1);
    const t = this.peek();
    if (t.kind !== "eof") {
      throw new CalcError(`Unexpected token '${t.value || t.kind}'.`, t.pos);
    }
    return expr;
  }

  /**
   * Pratt expression parser. `minPrec` is the minimum binary precedence allowed
   * to bind here; `depth` is the current nesting depth (DoS guard).
   */
  private parseExpr(minPrec: number, depth: number): Node {
    if (depth > MAX_DEPTH) {
      throw new CalcError("Formula is nested too deeply.", this.peek().pos);
    }

    let left = this.parseUnary(depth);

    // Binary loop.
    while (true) {
      const t = this.peek();
      if (t.kind !== "op") break;
      const op = t.value as BinOp;
      const prec = BIN_PRECEDENCE[op];
      if (prec === undefined || prec < minPrec) break;

      this.next(); // consume operator
      const rightMinPrec = RIGHT_ASSOC[op] ? prec : prec + 1;
      const right = this.parseExpr(rightMinPrec, depth + 1);
      left = this.count({ kind: "binary", op, left, right });
    }

    return left;
  }

  /** Unary minus (and a redundant unary plus, treated as a no-op). */
  private parseUnary(depth: number): Node {
    const t = this.peek();
    if (t.kind === "op" && (t.value === "-" || t.value === "+")) {
      this.next();
      const arg = this.parseUnary(depth + 1);
      if (t.value === "-") {
        return this.count({ kind: "unary", op: "-", arg });
      }
      return arg; // unary plus is a no-op
    }
    return this.parsePrimary(depth);
  }

  /** Primary: number, ref, rowref, parenthesized expr, or a function call. */
  private parsePrimary(depth: number): Node {
    const t = this.peek();

    switch (t.kind) {
      case "num": {
        this.next();
        const value = Number(t.value);
        if (!Number.isFinite(value)) {
          throw new CalcError(`Invalid number '${t.value}'.`, t.pos);
        }
        return this.count({ kind: "num", value });
      }

      case "ref": {
        this.next();
        return this.count({ kind: "ref", key: t.value });
      }

      case "rowref": {
        // A bare {row.x} outside an aggregate function argument is illegal. The
        // call parser consumes rowrefs as args directly; reaching here means it
        // appeared in operand position.
        throw new CalcError(
          `'{row.${t.value}}' is only valid as an aggregate function argument.`,
          t.pos,
        );
      }

      case "string": {
        // A bare string outside lookup() is illegal.
        throw new CalcError(
          "String literals are only valid as a lookup() table name.",
          t.pos,
        );
      }

      case "lparen": {
        this.next();
        const inner = this.parseExpr(0, depth + 1);
        this.expect("rparen", "')'");
        return inner;
      }

      case "ident": {
        return this.parseCall(depth);
      }

      default:
        throw new CalcError(
          `Unexpected token '${t.value || t.kind}'.`,
          t.pos,
        );
    }
  }

  /** Function call: `name( arg (, arg)* )` with allow-list + arity enforcement. */
  private parseCall(depth: number): Node {
    const nameTok = this.next(); // ident
    const fnRaw = nameTok.value;
    if (!KNOWN_FN_NAMES.has(fnRaw)) {
      throw new CalcError(`Unknown function '${fnRaw}'.`, nameTok.pos);
    }
    const fn = fnRaw as FnName;

    this.expect("lparen", `'(' after '${fnRaw}'`);

    const args: Node[] = [];
    if (this.peek().kind !== "rparen") {
      args.push(this.parseCallArg(fn, depth + 1));
      while (this.peek().kind === "comma") {
        this.next();
        args.push(this.parseCallArg(fn, depth + 1));
      }
    }
    this.expect("rparen", `')' to close '${fnRaw}('`);

    // Arity check.
    const arity = FN_ARITY[fn];
    if (args.length < arity.min || args.length > arity.max) {
      const range =
        arity.min === arity.max
          ? `${arity.min}`
          : `${arity.min}–${arity.max}`;
      throw new CalcError(
        `'${fnRaw}' expects ${range} argument(s), got ${args.length}.`,
        nameTok.pos,
      );
    }

    // lookup(ref, "table"): the 2nd argument MUST be a string literal table name.
    if (fn === "lookup") {
      const tableArg = args[1];
      if (!tableArg || tableArg.kind !== "str") {
        throw new CalcError(
          "lookup()'s second argument must be a quoted table name.",
          nameTok.pos,
        );
      }
    }

    // Aggregate with a {row.x} arg must be the SINGLE-arg aggregate form.
    if (AGGREGATE_FNS.has(fn)) {
      const rowArgs = args.filter((a) => a.kind === "rowref");
      if (rowArgs.length > 0 && args.length !== 1) {
        throw new CalcError(
          `'${fnRaw}({row.x})' aggregate form takes exactly one repeater reference.`,
          nameTok.pos,
        );
      }
    }

    return this.count({ kind: "call", fn, args });
  }

  /**
   * Parse a single call argument. A `{row.x}` rowref is ONLY accepted directly
   * here for an aggregate function; a string literal is ONLY accepted for the
   * lookup() table-name position. Everything else parses as a normal expression.
   */
  private parseCallArg(fn: FnName, depth: number): Node {
    const t = this.peek();

    if (t.kind === "rowref") {
      if (!AGGREGATE_FNS.has(fn)) {
        throw new CalcError(
          `'{row.${t.value}}' is only valid inside sum/min/max/count/average.`,
          t.pos,
        );
      }
      this.next();
      return this.count({ kind: "rowref", key: t.value });
    }

    if (t.kind === "string") {
      this.next();
      return this.count({ kind: "str", value: t.value });
    }

    return this.parseExpr(0, depth);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Parse a formula string into the closed AST. Throws CalcError on any error. */
export function parse(formula: string): Node {
  const tokens = tokenize(formula);
  return new Parser(tokens).parseProgram();
}

/**
 * Collect the references a formula reads:
 *   - `fieldRefs`: `{field_key}` leaves (edges in the dependency graph).
 *   - `rowRefs`:   `{row.subKey}` leaves (aggregate fold sub-keys).
 */
export function collectRefs(ast: Node): {
  fieldRefs: Set<string>;
  rowRefs: Set<string>;
} {
  const fieldRefs = new Set<string>();
  const rowRefs = new Set<string>();

  function walk(node: Node): void {
    switch (node.kind) {
      case "num":
      case "str":
        return;
      case "ref":
        fieldRefs.add(node.key);
        return;
      case "rowref":
        rowRefs.add(node.key);
        return;
      case "unary":
        walk(node.arg);
        return;
      case "binary":
        walk(node.left);
        walk(node.right);
        return;
      case "call":
        for (const arg of node.args) walk(arg);
        return;
    }
  }

  walk(ast);
  return { fieldRefs, rowRefs };
}
