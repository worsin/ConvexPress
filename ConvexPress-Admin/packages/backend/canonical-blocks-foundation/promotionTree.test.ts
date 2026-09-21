import { expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateCanonicalTree } from "./generated/instances";
import { exportCanonicalPromotionTree, importCanonicalPromotionTree, parseCanonicalPromotionTree } from "./promotionTree";
const source = () => [{ id: "group", name: "core/group", version: 1, attrs: {}, anchor: "makers", children: [
            { id: "image", name: "core/image", version: 2, attrs: { mediaId: "source-media", alt: "source-media", caption: "@promotion:media:source-media", href: "/about" } },
            { id: "page", name: "core/featured-page", version: 1, attrs: { page: "source-page", ctaLabel: "source-page" } },
            { id: "products", name: "commerce/product-showcase", version: 2, attrs: { source: "slugs", productSlugs: ["source-product", "another-product"], categorySlug: "source-category" } },
        ] }];
const exported = () => exportCanonicalPromotionTree(source(), async (r) => `${r.kind}:${r.storage}:${r.value}`);
test("nested canonical promotion maps metadata references, preserving literal text, anchors and source input", async () => {
    const original = source(), copy = structuredClone(original), portable = await exportCanonicalPromotionTree(original, async (r) => `${r.kind}:${r.storage}:${r.value}`);
    expect(original).toEqual(copy);
    expect(portable.references.map(r => [r.kind, r.storage])).toEqual([["media", "id"], ["page", "id"], ["productCategory", "slug"], ["product", "slug"], ["product", "slug"]]);
    const result = await importCanonicalPromotionTree(portable, async (r) => "target-" + r.key.split(":").at(-1));
    const expected = source();
    expected[0]!.children[0]!.attrs.mediaId = "target-source-media";
    expected[0]!.children[1]!.attrs.page = "target-source-page";
    expected[0]!.children[2]!.attrs.categorySlug = "target-source-category";
    expected[0]!.children[2]!.attrs.productSlugs = ["target-source-product", "target-another-product"];
    expect(result).toEqual(validateCanonicalTree(expected));
    expect(portable.blocks).not.toEqual(result);
    expect(portable.blocks[0]!.children![0]!.attrs.alt).toBe("source-media");
});
test("missing, additional, moved, retagged and raw references fail before any target reader", async () => {
    const good = await exported();
    const changes = [
        (v: typeof good) => { v.references.pop(); }, (v: typeof good) => { v.references.push({ ...v.references[0]! }); },
        (v: typeof good) => { v.references[0]!.path = ["caption"]; }, (v: typeof good) => { v.references[0]!.path = ["__proto__", "polluted"]; },
        (v: typeof good) => { v.references[0]!.kind = "product"; }, (v: typeof good) => { v.references[0]!.storage = "slug"; },
        (v: typeof good) => { v.blocks[0]!.children![0]!.attrs.mediaId = "foreign-source-id"; }, (v: typeof good) => { v.references[1]!.key = v.references[0]!.key; },
    ];
    for (const change of changes) {
        const bad = structuredClone(good);
        change(bad);
        let calls = 0;
        await expect(importCanonicalPromotionTree(bad, async () => { calls++; return "target"; })).rejects.toThrow();
        expect(calls).toBe(0);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
test("optional empty references remain empty and repeated dependencies use one target resolution", async () => {
    const tree = [{ id: "empty", name: "core/image", version: 2, attrs: {} }, { id: "one", name: "core/image", version: 2, attrs: { mediaId: "shared" } }, { id: "two", name: "core/image", version: 2, attrs: { mediaId: "shared" } }];
    const portable = await exportCanonicalPromotionTree(tree, async (r) => `media:${r.value}`);
    expect(portable.references).toHaveLength(2);
    let calls = 0;
    const result = await importCanonicalPromotionTree(portable, async () => { calls++; return "target-image"; });
    expect(calls).toBe(1);
    expect(result[0]!.attrs.mediaId).toBe("");
    expect(result[1]!.attrs.mediaId).toBe("target-image");
    expect(result[2]!.attrs.mediaId).toBe("target-image");
});
test("unresolved tokens and invalid destination values cannot become a canonical document", async () => {
    const good = await exported();
    for (const value of ["", "@promotion:media:source", "@promotion-url:media:source", "promotion-reference-12", "x".repeat(300)])
        await expect(importCanonicalPromotionTree(good, async () => value)).rejects.toThrow();
});
test("transport is closed and enforces canonical identity and byte budgets before export reads", async () => {
    const good = await exported();
    expect(() => parseCanonicalPromotionTree({ ...good, scope: { instanceKey: "source" } })).toThrow();
    expect(() => parseCanonicalPromotionTree({ ...good, extra: "x".repeat(501 * 1024) })).toThrow();
    const invalid = source();
    invalid[0]!.children[1]!.id = "image";
    let calls = 0;
    await expect(exportCanonicalPromotionTree(invalid, async () => { calls++; return "key"; })).rejects.toThrow();
    expect(calls).toBe(0);
});
test("distinct source resources cannot collapse onto one exported dependency key", async () => {
    await expect(exportCanonicalPromotionTree(source(), async () => "same-key")).rejects.toThrow("Distinct source");
});
import catalog from "./generated/catalog.json";
test("every catalog example preserves its exact canonical tree through portable identity mapping", async () => {
    let examples = 0;
    for (const spec of catalog)
        for (const [index, attrs] of spec.examples.entries()) {
            const input = [{ id: `example-${index}`, name: spec.name, version: spec.version, attrs }];
            const original = validateCanonicalTree(input), values = new Map<string, string>();
            const portable = await exportCanonicalPromotionTree(input, async (reference) => { const key = JSON.stringify([reference.kind, reference.storage, reference.value]); values.set(key, reference.value); return key; });
            const restored = await importCanonicalPromotionTree(portable, async (reference) => values.get(reference.key)!);
            expect(restored).toEqual(original);
            examples++;
        }
    const root = fileURLToPath(new URL("../../../../blocks/", import.meta.url));
    const sourceSpecs = readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
        .flatMap(category => readdirSync(join(root, category.name), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => join(root, category.name, entry.name, "block.json")))
        .filter(file => existsSync(file))
        .map(file => JSON.parse(readFileSync(file, "utf8")));
    expect(sourceSpecs.length).toBeGreaterThan(0);
    expect(catalog.map(spec => spec.name).sort()).toEqual(sourceSpecs.map(spec => spec.name).sort());
    expect(examples).toBe(sourceSpecs.reduce((count, spec) => count + spec.examples.length, 0));
});

test("one resource can bind by both ID and slug without reusing the wrong destination representation",async()=>{
 const tree=[{id:"hero",name:"commerce/product-hero",version:1,attrs:{product:"source-product-id"}},{id:"showcase",name:"commerce/product-showcase",version:2,attrs:{source:"slugs",productSlugs:["source-product-slug"]}}];
 const portable=await exportCanonicalPromotionTree(tree,async()=>"product:one");
 const requested:string[]=[];
 const result=await importCanonicalPromotionTree(portable,async reference=>{requested.push(reference.storage);return reference.storage==="id"?"target-product-id":"target-product-slug";});
 expect(requested).toEqual(["id","slug"]);expect(result[0]!.attrs.product).toBe("target-product-id");expect(result[1]!.attrs.productSlugs).toEqual(["target-product-slug"]);
});
