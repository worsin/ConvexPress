import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dependencyDescriptors } from "./generated/metadata";
import { validateBlockAttrs } from "./generated/schemas";
import { assertAuthoringResolverArgs, parseBoundResolverArgs } from "./resolverBindings";
import { prepareCanonicalSave, prepareCanonicalRestore, prepareCanonicalPublication } from "./documentState";

test("every shipped example retains valid resolver authoring arguments", () => {
  let examples = 0;
  for (const [name, descriptor] of Object.entries(dependencyDescriptors)) {
    const spec = JSON.parse(readFileSync(new URL(`../../../../${descriptor.source}`, import.meta.url), "utf8"));
    for (const example of spec.examples) {
      const attrs = validateBlockAttrs(name, example);
      try { assertAuthoringResolverArgs(name, attrs); } catch (error) { throw new Error(`${name}: ${String(error)}`); }
      examples++;
    }
  }
  expect(examples).toBe(285);
});

test("old fractional counts stay readable and recoverable but new writes and publication require repair", () => {
  for (const name of ["blocks/product-collection", "commerce/product-showcase"] as const) {
    const attrs = validateBlockAttrs(name, { count: 1.5 });
    const blocks = [{ id: "products", name, version: 2, attrs }];
    const current = { _id: "page", title: "Products", status: "draft", blocksVersion: 2, contentMode: "blocks", blocksRevision: 3, blocks };
    expect(attrs.count).toBe(1.5);
    expect(() => prepareCanonicalSave(current, { expectedRevision: 3, title: "Products", blocks })).toThrow();
    for (const status of ["publish", "private", "future"] as const)
      expect(() => prepareCanonicalPublication(current, { expectedRevision: 3, status, ...(status === "future" ? { scheduledAt: 200 } : {}) }, 100)).toThrow();
    expect(prepareCanonicalPublication({ ...current, status: "publish" }, { expectedRevision: 3, status: "draft" }, 100).blocks).toEqual(blocks);
    const snapshot = { ...current, parentId: "page" };
    expect(prepareCanonicalRestore({ ...current, blocks: [] }, snapshot, { expectedRevision: 3, postId: "page" }).blocks).toEqual(blocks);
    expect(() => prepareCanonicalRestore({ ...current, status: "publish" }, snapshot, { expectedRevision: 3, postId: "page" })).toThrow();
    const repaired = [{ ...blocks[0], attrs: { ...attrs, count: 2 } }];
    expect(prepareCanonicalSave(current, { expectedRevision: 3, title: "Products", blocks: repaired }).blocks).toEqual(repaired);
  }
});

test("custom resolver aliases report nested authoring paths and do not rewrite data", () => {
  const attrs = { selection: { amount: 1.5, category: "" } };
  const descriptor = { resolver: "commerce.productShowcase", args: { source: "category", count: "attrs.selection.amount", categorySlug: "attrs.selection.category" } };
  try {
    assertAuthoringResolverArgs("composed/products", attrs, descriptor);
    throw Error("Expected invalid count");
  } catch (error: any) {
    expect(error.issues.some((issue: any) => issue.path.join(".") === "selection.amount")).toBe(true);
  }
  expect(attrs.selection.amount).toBe(1.5);
  expect(() => assertAuthoringResolverArgs("composed/products", { selection: { amount: 2, category: "studio" } }, descriptor)).not.toThrow();
});

test("collection groups discard authored presentation but retain query selection", () => {
  const name = "blocks/product-collection";
  const attrs = validateBlockAttrs(name, { groups: [{ label: "Studio", productIds: ["product-one"], products: [{ title: "Authored card" }] }] });
  const result = parseBoundResolverArgs(name, attrs, "products", dependencyDescriptors[name].data, "block");
  expect(result.success).toBe(true);
  if (result.success) expect(result.data).toMatchObject({ groups: [{ productIds: ["product-one"] }] });
});
