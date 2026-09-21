import { test, expect } from "bun:test";
import { planCanonicalData } from "./planner";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";
const scope = { websiteKey: "site", instanceKey: "staging" };
const policy = { enabledPlugins: [], capabilities: ["reference.targetResolution"], disabledBlocks: [] };
const block = (id: string, attrs = {}) => ({ id, name: "core/post-grid", version: 1, attrs });
const card = { id: "story", title: "Public story", href: "/blog/story", excerpt: null, publishedAt: 1, author: null, image: null };
test("grid planning binds authored filters separately from each visitor cursor", () => {
  const tree = [block("one", { query: { category: "category", author: "author" } }), block("two")];
  const plan = planCanonicalData(tree, scope, policy, { one: "cursor-1" });
  expect(plan.jobs.map(job => job.args)).toEqual([
    { query: { category: "category", author: "author" }, limit: 6, showExcerpt: true, cursor: "cursor-1" },
    { query: {}, limit: 6, showExcerpt: true, cursor: null },
  ]);
  expect(planCanonicalData([block("one"), block("two")], scope, policy).jobs).toHaveLength(1);
  expect(planCanonicalData([block("one"), block("two")], scope, policy, { one: "cursor" }).jobs).toHaveLength(2);
  for (const request of [{ missing: "cursor" }, { heading: "cursor" }])
    expect(() => planCanonicalData([...tree, { id: "heading", name: "core/heading", version: 2, attrs: {} }], scope, policy, request)).toThrow("missing or non-paginated block");
  expect(() => planCanonicalData([{ id: "latest", name: "core/latest-posts", version: 2, attrs: {} }], scope, policy, { latest: "cursor" })).toThrow("does not support visitor pagination");
});
test("missing trusted grid reader refuses the entire plan before any other read", async () => {
  let reads = 0;
  await expect(resolveCanonicalData([block("grid")], scope, policy, async () => { reads++; return { page: null }; })).rejects.toThrow("Trusted Post Grid reader");
  expect(reads).toBe(0);
});
test("server and consumer bind grid result pages, disclosure, filter and environment", async () => {
  const tree = [block("grid", { limit: 1, showExcerpt: false })];
  const request = { grid: "page-two" };
  const envelope = await resolveCanonicalData(tree, scope, policy, async () => null, undefined, undefined,
    async args => ({ items: [card], cursor: args.cursor, nextCursor: "page-three" }), request);
  expect(validateCanonicalData(tree, scope, policy, envelope, request)).toEqual(envelope);
  expect(() => validateCanonicalData(tree, scope, policy, envelope)).toThrow("another pagination request");
  expect(() => validateCanonicalData(tree, { ...scope, instanceKey: "production" }, policy, envelope, request)).toThrow("another environment");
  expect(() => validateCanonicalData([block("grid", { limit: 1, showExcerpt: false, query: { tag: "another" } })], scope, policy, envelope, request)).toThrow("current canonical attributes");
  for (const result of [
    { items: [card], cursor: null, nextCursor: null },
    { items: [{ ...card, excerpt: "Not requested" }], cursor: "page-two", nextCursor: null },
    { items: [card, { ...card, id: "extra" }], cursor: "page-two", nextCursor: null },
  ]) {
    await expect(resolveCanonicalData(tree, scope, policy, async () => null, undefined, undefined, async () => result, request)).rejects.toThrow("selected page or disclosure");
    const stale = structuredClone(envelope); stale.dataByBlock.grid.data = result;
    expect(() => validateCanonicalData(tree, scope, policy, stale, request)).toThrow("current canonical attributes");
  }
});
