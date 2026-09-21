import { expect, test } from "bun:test";
import { validateComposition, resolveComposition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composition";
import { copyCompositionJson, parseExpression, evaluateExpression } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/compositionExpressions";
import { primitiveNames } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/primitiveContracts";

const wrap = (root: unknown) => ({ version: 1, root });
const text = (bind = "attrs.title", more = {}) => ({ el: "Text", bind, ...more });
const roots = new Set(["attrs", "data"]);
const evalText = (value: string, attrs: unknown = {}) => evaluateExpression(parseExpression(value, roots), { attrs, data: null });
const offer = wrap({ el: "Section", props: { tone: "muted" }, children: [
  { el: "Heading", props: { level: 2 }, bind: "attrs.title" },
  { el: "Grid", props: { columns: { base: 1, md: 3 } }, each: "data.products", as: "product", children: [
    { el: "Card", if: "product.available", children: [
      { el: "Heading", props: { level: 3 }, bind: "product.title" },
      { el: "Stat", bind: { label: "'Price'", value: "currency(product.amount, product.currency)" } },
      { el: "Button", bind: { label: "'Explore ' + product.title", href: "product.href" } },
    ] },
  ] },
] });

test("closed compositions bind typed data inside one grid and retain input immutability", () => {
  const input = { attrs: { title: "Three thoughtful choices" }, data: { products: [
    { title: "Notebook", amount: 2499, currency: "USD", href: "/products/notebook", available: true },
    { title: "Hidden", amount: 900, currency: "USD", href: "/private", available: false },
    { title: "Tea", amount: 1000, currency: "JPY", href: "/products/tea", available: true },
  ] } };
  const before = JSON.stringify({ offer, input });
  const result = resolveComposition(offer, input)!;
  expect(result.children[0].text).toBe("Three thoughtful choices");
  const grid = result.children[1];
  expect(grid.el).toBe("Grid"); expect(grid.children).toHaveLength(2);
  expect(grid.children[0].children[1].props.value).toBe("$24.99");
  expect(grid.children[1].children[1].props.value).toBe("¥1,000");
  expect(grid.children[0].children[2].props.label).toBe("Explore Notebook");
  expect(JSON.stringify(result)).not.toContain("/private");
  expect(JSON.stringify({ offer, input })).toBe(before);
});

test("expressions consume the entire grammar and never reach prototypes or executable code", () => {
  expect(evalText("'Hello, ' + attrs.name", { name: "visitor" })).toBe("Hello, visitor");
  expect(evalText('"She said \\"hello\\""')).toBe('She said "hello"');
  expect(evalText("plural(attrs.count, 'item', 'items')", { count: 2 })).toBe("2 items");
  expect(evalText("date('2026-09-15')")).toBe("September 15, 2026");
  for (const expression of ["globalThis", "process.env", "attrs.__proto__", "attrs.constructor.name", "attrs['title']", "attrs.title()", "eval('1')", "Function('return 1')", "attrs.title; alert(1)", "attrs.x || 1", "attrs.x * 3", "'unterminated", "currency(10)", "plural(1,'item')", "date('2026-01-01','UTC')"])
    expect(() => parseExpression(expression, roots)).toThrow();
  expect(() => evalText("attrs.missing", {})).toThrow("Unavailable");
  expect(() => evalText("date('2026-02-30')")).toThrow();
  expect(() => evalText("currency(1.5,'USD')")).toThrow();
  expect(() => evalText("'unsafe ' + attrs.object", { object: {} })).toThrow();
});

test("all primitive properties remain closed at both authoring and evaluation", () => {
  expect(primitiveNames).toHaveLength(25);
  for (const root of [
    { el: "script", props: { src: "https://bad.test" } },
    text("attrs.title", { props: { className: "escape" } }),
    text("attrs.title", { props: null }),
    text("attrs.title", { props: { style: { color: "red" } } }),
    { el: "Section", props: { blockId: "another-block" } },
    { el: "Button", props: { label: "Click", href: "javascript:alert(1)" } },
    { el: "Button", bind: { onClick: "attrs.action", href: "attrs.href", label: "attrs.title" } },
    { el: "Button", props: { label: "Click" }, bind: { label: "attrs.title", href: "attrs.href" } },
    { el: "Image", children: [text()] },
    { el: "Text", bind: "attrs.title", fetch: "https://private.test" },
    { el: "Text" },
  ]) expect(() => validateComposition(wrap(root))).toThrow();
  const button = wrap({ el: "Button", bind: { label: "attrs.label", href: "attrs.href" } });
  expect(() => resolveComposition(button, { attrs: { label: "Click", href: "javascript:alert(1)" } })).toThrow();
  expect(() => resolveComposition(button, { attrs: { label: {}, href: "/safe" } })).toThrow();
  expect(() => resolveComposition(wrap({ el: "Tabs", bind: { label: "'Tabs'", items: "attrs.items" } }), { attrs: { items: [{ id: "same", title: "A", body: "A" }, { id: "same", title: "B", body: "B" }] } })).toThrow("unique");
});

test("conditions are booleans, loop aliases are lexical and host slots are opt-in", () => {
  expect(resolveComposition(wrap(text("attrs.title", { if: "false" })), { attrs: {} })).toBeNull();
  expect(() => resolveComposition(wrap(text("attrs.title", { if: "attrs.visible" })), { attrs: { title: "Hello", visible: "false" } })).toThrow("boolean");
  for (const alias of ["attrs", "data", "constructor", "true", "currency"])
    expect(() => validateComposition(wrap({ el: "Grid", each: "attrs.items", as: alias, children: [text()] }))).toThrow();
  expect(() => validateComposition(wrap({ el: "Stack", children: [{ el: "Grid", each: "attrs.items", as: "row", children: [text("row.title")] }, text("row.title")] }))).toThrow();
  expect(() => resolveComposition(wrap({ el: "Slot", props: { name: "private" } }), { attrs: {} })).toThrow("not exposed");
  expect(resolveComposition(wrap({ el: "Slot", props: { name: "aside" } }), { attrs: {} }, { allowedSlots: ["aside"] })?.props.name).toBe("aside");
});

test("source depth, source nodes, expansion and output bytes are independently bounded", () => {
  let nested: unknown = text("'leaf'");
  for (let i = 0; i < 8; i++) nested = { el: "Stack", children: [nested] };
  expect(() => validateComposition(wrap(nested))).toThrow("depth8");
  expect(() => validateComposition(wrap({ el: "Stack", children: Array.from({ length: 300 }, () => text("'node'")) }))).toThrow("300");
  const repeated = wrap({ el: "Grid", each: "attrs.items", as: "row", children: [text("'a'"), text("'b'"), text("'c'")] });
  expect(() => resolveComposition(repeated, { attrs: { items: Array(100).fill(1) } })).toThrow("Expanded");
  expect(() => resolveComposition(repeated, { attrs: { items: Array(101).fill(1) } })).toThrow("at most100");
  const hiddenWork = wrap({ el: "Grid", each: "attrs.items", as: "outer", children: [
    { el: "Grid", each: "attrs.items", as: "inner", children: [text("'hidden'", { if: "false" })] },
  ] });
  expect(() => resolveComposition(hiddenWork, { attrs: { items: Array(100).fill(1) } })).toThrow("work limit");
  const large = wrap({ el: "Grid", each: "attrs.items", as: "row", children: [text("attrs.long")] });
  expect(() => resolveComposition(large, { attrs: { items: Array(30).fill(1), long: "x".repeat(20000) } })).toThrow("512KiB");
  expect(() => resolveComposition(wrap({ el: "Stack", children: [
    { el: "Heading", props: { anchor: "same" }, bind: "'One'" },
    { el: "Heading", props: { anchor: "same" }, bind: "'Two'" },
  ] }), { attrs: {} })).toThrow("anchors must be unique");
});

test("JSON ingress rejects cycles, functions, accessors, sparse arrays and unsafe keys without executing them", () => {
  let calls = 0;
  const accessor = Object.defineProperty({}, "title", { enumerable: true, get() { calls++; return "unsafe"; } });
  const arrayAccessor = Object.defineProperty([1], "0", { get() { calls++; return "unsafe"; } });
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const sparse: unknown[] = []; sparse.length = 3;
  for (const input of [accessor, arrayAccessor, cycle, { fn() {} }, new Date(), [undefined], sparse, JSON.parse('{"__proto__":{"title":"unsafe"}}'), { value: Infinity }, { [Symbol("secret")]: 1 }])
    expect(() => copyCompositionJson(input)).toThrow();
  expect(calls).toBe(0);
  expect(() => copyCompositionJson({ title: "x".repeat(512 * 1024 + 1) })).toThrow("512KiB");
});
