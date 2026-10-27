import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/** Selector specificity as [ids, classes/attributes/pseudo-classes, types], with
 * :is()/:not() taking their most specific argument and :where() counting nothing. */
function specificity(selector: string): [number, number, number] {
  let s = selector.trim();
  const total: [number, number, number] = [0, 0, 0];
  const add = (v: [number, number, number]) => { total[0] += v[0]; total[1] += v[1]; total[2] += v[2]; };
  const max = (list: string) => splitList(list).map(specificity).reduce((a, b) => (compare(a, b) >= 0 ? a : b), [0, 0, 0] as [number, number, number]);
  while (s.length) {
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^:(is|not|where|has)\(/))) {
      const inner = balanced(s, m[0].length - 1);
      if (m[1] !== "where") add(max(inner));
      s = s.slice(m[0].length + inner.length + 1);
    } else if ((m = s.match(/^#[\w-]+/))) { total[0]++; s = s.slice(m[0].length); }
    else if ((m = s.match(/^(\.[\w-]+|\[[^\]]*\]|:[\w-]+)/))) { total[1]++; s = s.slice(m[0].length); }
    else if ((m = s.match(/^::[\w-]+/))) { total[2]++; s = s.slice(m[0].length); }
    else if ((m = s.match(/^[a-zA-Z][\w-]*/))) { total[2]++; s = s.slice(m[0].length); }
    else s = s.slice(1);
  }
  return total;
}
function balanced(s: string, open: number) { let depth = 0; for (let i = open; i < s.length; i++) { if (s[i] === "(") depth++; else if (s[i] === ")" && --depth === 0) return s.slice(open + 1, i); } throw Error("unbalanced"); }
function splitList(list: string) { const out: string[] = []; let depth = 0, start = 0; for (let i = 0; i < list.length; i++) { if (list[i] === "(") depth++; else if (list[i] === ")") depth--; else if (list[i] === "," && depth === 0) { out.push(list.slice(start, i)); start = i + 1; } } out.push(list.slice(start)); return out; }
function compare(a: number[], b: number[]) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!; return 0; }
const selectors = (file: string) => [...readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].flatMap((m) => splitList(m[1]!.trim()));

describe("the embedded form's field styles", () => {
  const base = selectors("./form-embed.css").find((sel) => sel.includes('input:not([type="checkbox"])'))!;

  test("the calculator counts the way browsers do", () => {
    expect(specificity('.a :is(input:not([type="checkbox"]):not([type="radio"]),textarea)')).toEqual([0, 3, 1]);
    expect(specificity('.a :is(:where(input:not([type="checkbox"])),textarea)')).toEqual([0, 1, 1]);
    expect(specificity('#x .a [data-slot="f"] ::placeholder')).toEqual([1, 2, 1]);
  });

  test("its base rule stays as light as one class and a field", () => {
    expect(base).toBeDefined();
    expect(specificity(base)).toEqual([0, 1, 1]);
  });

  test("block and theme rules for the same fields outrank it, as written", () => {
    const contact = selectors("./contact-form.css").find((sel) => sel.includes('.cp-library-contact [data-slot="form-field"]'))!;
    expect(compare(specificity(contact), specificity(base))).toBeGreaterThan(0);
    // A site's own focus ring (the CaseMedix pack's, for one) is a class, a slot, a field and :focus-visible.
    expect(compare(specificity('.site [data-slot="form-field"] :is(input,select,textarea):focus-visible'), specificity(base))).toBeGreaterThan(0);
  });

  test("its own textarea and select refinements, after it, now apply", () => {
    for (const sel of [".cp-embedded-form textarea", ".cp-embedded-form select"]) expect(compare(specificity(sel), specificity(base))).toBe(0);
  });
});
