/**
 * Forms Entry Export — pure-helper + CSV-injection tests.
 * Run: `bun test convex/extensions/forms/__tests__/export.test.ts`
 *
 * Covers the Convex-FREE units `exportEntries` is built from:
 *   - decodeCell: JSON arrays → "; "-joined; objects → JSON; scalars → String;
 *     parse-failure → raw fallback; null/undefined → "".
 *   - neutralizeFormula / csvCell: CSV FORMULA INJECTION guard — a cell that
 *     BEGINS with `=`,`+`,`-`,`@`,TAB,CR is prefixed with `'` so it stays inert
 *     text in a spreadsheet; ordinary numbers/text are untouched. Plus the
 *     pre-existing comma/quote/newline quoting (now applied AFTER the guard).
 *   - csvRow: per-cell encoding joined with commas.
 *   - selectColumns: filters LAYOUT_OR_NO_VALUE; label falls back to name;
 *     `fields` name-list filters + orders + collects unknown names as warnings.
 *
 * `.toBe` / `.toEqual` only; errors surfaced via a try/catch flag.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  decodeCell,
  neutralizeFormula,
  csvCell,
  csvRow,
  selectColumns,
} from "../export";

// ─── decodeCell ──────────────────────────────────────────────────────────────

describe("decodeCell", () => {
  test("null / undefined → empty string", () => {
    expect(decodeCell(undefined)).toBe("");
    // raw is typed string|undefined; null is the documented absent case.
    expect(decodeCell(null as unknown as undefined)).toBe("");
  });

  test("a JSON array joins with '; '", () => {
    expect(decodeCell(JSON.stringify(["a", "b", "c"]))).toBe("a; b; c");
  });

  test("a JSON array renders null/undefined members as empty", () => {
    expect(decodeCell(JSON.stringify(["a", null, "c"]))).toBe("a; ; c");
  });

  test("an empty JSON array → empty string", () => {
    expect(decodeCell("[]")).toBe("");
  });

  test("a JSON object is re-stringified", () => {
    expect(decodeCell('{"x":1,"y":"z"}')).toBe('{"x":1,"y":"z"}');
  });

  test("JSON scalars are coerced with String()", () => {
    expect(decodeCell("42")).toBe("42");
    expect(decodeCell("true")).toBe("true");
    expect(decodeCell('"hello"')).toBe("hello");
    // JSON null parses to the value null → String(null) = "null".
    expect(decodeCell("null")).toBe("null");
  });

  test("a non-JSON string falls back to the raw value", () => {
    expect(decodeCell("just a plain answer")).toBe("just a plain answer");
    expect(decodeCell("a@b.com")).toBe("a@b.com");
  });
});

// ─── neutralizeFormula (CSV injection guard) ────────────────────────────────

describe("neutralizeFormula — CSV formula injection", () => {
  test("a leading = is defanged with a single quote", () => {
    // The canonical RCE payload: must NOT survive as a live formula.
    expect(neutralizeFormula("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
  });

  test("each formula-trigger lead (= + - @) is neutralized", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("+1")).toBe("'+1");
    expect(neutralizeFormula("-1+2")).toBe("'-1+2");
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  test("leading TAB and CR are neutralized (importer-trim front-load)", () => {
    expect(neutralizeFormula("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizeFormula("\r=1+1")).toBe("'\r=1+1");
  });

  test("ordinary numbers and text are UNTOUCHED", () => {
    expect(neutralizeFormula("42")).toBe("42");
    expect(neutralizeFormula("3.14")).toBe("3.14");
    expect(neutralizeFormula("hello world")).toBe("hello world");
    // A trigger char only matters when it LEADS — interior is fine.
    expect(neutralizeFormula("a-b")).toBe("a-b");
    expect(neutralizeFormula("a=b")).toBe("a=b");
    expect(neutralizeFormula("user@host")).toBe("user@host");
  });

  test("empty string stays empty (no spurious quote)", () => {
    expect(neutralizeFormula("")).toBe("");
  });
});

// ─── csvCell ─────────────────────────────────────────────────────────────────

describe("csvCell — quoting + injection guard together", () => {
  test("a plain value is returned as-is", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell("42")).toBe("42");
  });

  test("null / undefined coerces to empty", () => {
    expect(csvCell(null as unknown as string)).toBe("");
    expect(csvCell(undefined as unknown as string)).toBe("");
  });

  test("a comma forces quoting", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  test("an embedded quote is doubled and wrapped", () => {
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  test("a newline forces quoting", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  test("a formula lead is neutralized even without a comma", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@x")).toBe("'@x");
  });

  test("a formula lead AND a comma → defanged then quoted (both applied)", () => {
    // Guard runs before quoting: '=1,2  →  "'=1,2"
    expect(csvCell("=1,2")).toBe("\"'=1,2\"");
  });

  test("a formula lead with an embedded quote → defanged then quote-escaped", () => {
    // ="x"  → '="x"  → wrapped + doubled inner quotes.
    expect(csvCell('="x"')).toBe("\"'=\"\"x\"\"\"");
  });
});

// ─── csvRow ──────────────────────────────────────────────────────────────────

describe("csvRow", () => {
  test("joins encoded cells with commas", () => {
    expect(csvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  test("encodes each cell (quoting + injection guard) inline", () => {
    expect(csvRow(["plain", "a,b", "=evil"])).toBe('plain,"a,b",\'=evil');
  });

  test("an empty cell list → empty string", () => {
    expect(csvRow([])).toBe("");
  });
});

// ─── selectColumns ───────────────────────────────────────────────────────────

const DEFS = [
  { name: "first", label: "First Name", key: "f_first", type: "text" },
  { name: "intro", label: "Intro", key: "f_intro", type: "message" }, // layout
  { name: "email", label: "Email", key: "f_email", type: "email" },
  { name: "pb", label: "PB", key: "f_pb", type: "page_break" }, // layout
  { name: "color", label: "", key: "f_color", type: "select" }, // empty label
];

describe("selectColumns", () => {
  test("drops LAYOUT_OR_NO_VALUE types (message, page_break, ...)", () => {
    const { columns } = selectColumns(DEFS);
    expect(columns.map((c) => c.name)).toEqual(["first", "email", "color"]);
  });

  test("label falls back to name when blank", () => {
    const { columns } = selectColumns(DEFS);
    const color = columns.find((c) => c.name === "color");
    expect(color?.label).toBe("color");
  });

  test("non-empty label is preserved", () => {
    const { columns } = selectColumns(DEFS);
    expect(columns.find((c) => c.name === "first")?.label).toBe("First Name");
  });

  test("with no `fields`, warnings is empty", () => {
    expect(selectColumns(DEFS).warnings).toEqual([]);
  });

  test("`fields` filters AND reorders to the requested names", () => {
    const { columns } = selectColumns(DEFS, ["email", "first"]);
    expect(columns.map((c) => c.name)).toEqual(["email", "first"]);
  });

  test("unknown requested names are dropped and collected as warnings", () => {
    const { columns, warnings } = selectColumns(DEFS, [
      "email",
      "ghost",
      "first",
      "nope",
    ]);
    expect(columns.map((c) => c.name)).toEqual(["email", "first"]);
    expect(warnings).toEqual(["ghost", "nope"]);
  });

  test("a requested LAYOUT field is treated as unknown (already filtered out)", () => {
    // `intro` is a message field — not a data column — so naming it warns.
    const { columns, warnings } = selectColumns(DEFS, ["intro", "email"]);
    expect(columns.map((c) => c.name)).toEqual(["email"]);
    expect(warnings).toEqual(["intro"]);
  });

  test("an empty `fields` array means 'all columns' (no filtering)", () => {
    const { columns } = selectColumns(DEFS, []);
    expect(columns.map((c) => c.name)).toEqual(["first", "email", "color"]);
  });

  test("no field group / empty defs → empty columns, no warnings", () => {
    const { columns, warnings } = selectColumns([]);
    expect(columns).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
