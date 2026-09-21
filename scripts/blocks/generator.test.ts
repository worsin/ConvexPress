import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, unlink, rmdir, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { discoverBlocks } from "./discovery.mjs";
import { dependencyFields, generateArtifacts, syncBlocks } from "./generator.mjs";
import { attrsSchema, parseBlockSpec } from "./schema.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../ConvexPress-Admin/packages/backend/package.json", import.meta.url));
const { convexTest } = require("convex-test");
const { defineSchema, defineTable } = require("convex/server");
const modules = { "./convex/_generated/server.js": () => import("../../ConvexPress-Admin/packages/backend/convex/_generated/server.js") };
const roots: string[] = [];
async function removeFixture(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeFixture(child); else await unlink(child);
  }
  await rmdir(dir);
}
afterEach(async () => { for (const dir of roots.splice(0)) await removeFixture(dir); });
async function fixture() { const dir = await mkdtemp(path.join(repo, "ConvexPress-Admin/.block-spec-test-")); roots.push(dir); return dir; }
const spec = async () => JSON.parse(await readFile(path.join(repo, "blocks/events/upcoming/block.json"), "utf8"));
async function put(root: string, folder: string, value: unknown) {
  await mkdir(path.join(root, folder), { recursive: true });
  await writeFile(path.join(root, folder, "block.json"), JSON.stringify(value));
}
describe("schema-first generation", () => {
  test("renderer coverage distinguishes missing, shared and owned renderers and pack hiding", async () => {
    const root = await fixture(), s = await spec();
    await put(root, "blocks/events/upcoming", s);
    const found = await discoverBlocks(root);
    found.packs = [{ id: "sample", path: "packs/sample", hidden: [s.name], renderers: {} }];
    const read = async (name: string) => {
      const output = await generateArtifacts(found), file = path.join(root, name + ".ts");
      await writeFile(file, output["renderer-coverage.ts"]);
      return (await import(pathToFileURL(file).href)).rendererCoverage[0].blocks[0];
    };
    expect(await read("missing")).toMatchObject({ renderer: "missing", hidden: true });
    found.blocks[0].hasRenderer = true;
    expect(await read("shared")).toMatchObject({ renderer: "library", hidden: true });
    found.packs[0].renderers[s.name] = "./blocks/events/upcoming.tsx";
    expect(await read("owned")).toMatchObject({ renderer: "owned", hidden: true });
  });
  test("generated validators initialize only on first use and retain defaults, field access and schema identity", async () => {
    const root=await fixture(),s=await spec();await put(root,"blocks/events/upcoming",s);await put(root,"blocks/core/upcoming",{...s,name:"core/upcoming"});await syncBlocks({root});
    const file=path.join(root,"blocks/.generated/schemas.ts"),source=await readFile(file,"utf8");
    expect(source).toContain("value=create()");
    await writeFile(file,'let constructions=0; export const schemaConstructions=()=>constructions;\n'+source.replace("value=create()","constructions++;value=create()"));
    const generated=await import(pathToFileURL(file).href);
    expect(Object.keys(generated.blockSchemas)).toHaveLength(2);expect(generated.schemaConstructions()).toBe(0);
    const schema=generated.blockSchemas["events/upcoming"];expect(generated.schemaConstructions()).toBe(1);expect(generated.blockSchemas["events/upcoming"]).toBe(schema);expect(generated.validateBlockAttrs("events/upcoming",{})).toEqual(attrsSchema(parseBlockSpec(s).fields).parse({}));expect(generated.validateBlockField("events/upcoming",["count"],5)).toBe(5);expect(generated.schemaConstructions()).toBe(1);
    expect(()=>generated.validateBlockTreatment("events/upcoming",{name:"unknown",values:{}})).toThrow();expect(generated.schemaConstructions()).toBe(2);
    expect(generated.blockSchemas["core/upcoming"]).not.toBe(schema);expect(generated.schemaConstructions()).toBe(3);
  });
  test("discover core, library, plugin and pack provenance without a registry; duplicate and unsafe folders fail", async () => {
    const root = await fixture(), s = await spec();
    await put(root, "blocks/core/upcoming", { ...s, name: "core/upcoming" });
    await put(root, "blocks/events/upcoming", s);
    await put(root, "extensions/calendar/blocks/calendar", { ...s, name: "calendar/calendar" });
    await put(root, "packs/journal/blocks/calendar", { ...s, name: "journal/calendar" });
    const found = await discoverBlocks(root);
    expect(found.blocks.map((b: any) => [b.spec.name, b.provenance.kind])).toEqual([["calendar/calendar", "plugin"], ["core/upcoming", "core"], ["events/upcoming", "library"], ["journal/calendar", "pack"]]);
    await put(root, "plugins/events/blocks/upcoming", s);
    await expect(discoverBlocks(root)).rejects.toThrow("Duplicate block name");
    const other = await fixture();
    await put(other, "blocks/events/upcoming", { ...s, name: "core/upcoming" });
    await expect(discoverBlocks(other)).rejects.toThrow("folder ownership");
    const linked = await fixture();
    await symlink(root, path.join(linked, "blocks"));
    await expect(discoverBlocks(linked)).rejects.toThrow("symlink");
  });
  test("deterministic outputs and field-level drift, examples, stale files and output symlink detection", async () => {
    const root = await fixture(), s = await spec();
    await put(root, "blocks/events/upcoming", s);
    const generated = await syncBlocks({ root });
    expect(generated.changed.length).toBe(26);
    expect(generated.changed).toContain("spec-runtime.mjs");
    expect(generated.changed).toContain("spec-runtime.d.mts");
    expect(generated.changed).toContain("patterns.ts");
    expect((await syncBlocks({ root })).changed).toEqual([]);
    const first = await generateArtifacts(await discoverBlocks(root));
    const reordered = Object.fromEntries(Object.entries(s).reverse());
    await put(root, "blocks/events/upcoming", reordered);
    expect(await generateArtifacts(await discoverBlocks(root))).toEqual(first);
    s.fields[0].max = 161;
    await put(root, "blocks/events/upcoming", s);
    await expect(syncBlocks({ root, check: true })).rejects.toThrow("Generated block drift");
    await syncBlocks({ root });
    s.examples = [{ count: 0 }];
    await put(root, "blocks/events/upcoming", s);
    await expect(syncBlocks({ root })).rejects.toThrow();
    s.examples = [{}];
    await put(root, "blocks/events/upcoming", s);
    await writeFile(path.join(root, "blocks/.generated/stale.ts"), "unowned");
    await expect(syncBlocks({ root })).rejects.toThrow("Unexpected generated files");
    await expect(syncBlocks({ root, output: "../escape" })).rejects.toThrow("inside the project");
    const linked = await fixture();
    await put(linked, "blocks/events/upcoming", await spec());
    await symlink(path.join(root, "blocks/.generated"), path.join(linked, "blocks/.generated"));
    await expect(syncBlocks({ root: linked })).rejects.toThrow("symlink");
  });
  test("generated dependency paths and coverage feed promotion and BlockDemo without guessed fields", async () => {
    const s = await spec();
    s.fields = [{ id: "items", type: "repeater", fields: [{ id: "card", type: "object", fields: [{ id: "image", type: "media" }, { id: "post", type: "reference", of: "post" }, { id: "menu", type: "menu" }, { id: "form", type: "form" }] }] }];
    s.examples = [{}]; s.preview = "{items.length}"; s.data = null;
    const parsed = parseBlockSpec(s), fields = dependencyFields(parsed.fields);
    expect(fields).toEqual([
      { path: ["items", "*", "card", "image"], type: "media", valuePath: ["id"] },
      { path: ["items", "*", "card", "post"], type: "reference", of: "post", valuePath: [] },
      { path: ["items", "*", "card", "menu"], type: "menu", valuePath: [] },
      { path: ["items", "*", "card", "form"], type: "form", valuePath: [] },
    ]);
    const root = await fixture(); await put(root, "blocks/events/upcoming", parsed); await mkdir(path.join(root, "packs/journal"), { recursive: true });
    await syncBlocks({ root });
    const descriptors = JSON.parse(await readFile(path.join(root, "blocks/.generated/dependencies.json"), "utf8"));
    expect(descriptors["events/upcoming"].fields).toEqual(fields);
    const coverage = JSON.parse(await readFile(path.join(root, "blocks/.generated/coverage.json"), "utf8"));
    expect(coverage.blocks[0].category).toBe("site");
    expect(coverage.blocks[0].libraryRenderer).toBeNull();
    expect(coverage.blocks[0].treatments).toEqual([{ packId: "journal", status: "not-verified", screenshot: null }]);
  });
  test("every field emits executable Zod and structural Convex validators with matching shape", async () => {
    const root = await fixture(), s = await spec();
    s.fields = [
      { id: "rich", type: "richtext", max: 20 }, { id: "link", type: "link" }, { id: "media", type: "media" },
      { id: "icon", type: "icon" }, { id: "tone", type: "color-role" }, { id: "date", type: "date" },
      { id: "ref", type: "reference", of: "event" }, { id: "menu", type: "menu" }, { id: "form", type: "form" },
      { id: "choice", type: "select", options: ["a"] }, { id: "note", type: "text", nullable: true, default: null },
      { id: "rows", type: "repeater", fields: [{ id: "nested", type: "object", fields: [{ id: "enabled", type: "boolean" }, { id: "count", type: "number", integer: true, min: 1 }] }] },
    ]; s.preview = "{note}"; s.data = null; s.examples = [{}];
    const input = { rich: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Aster", marks: [{ type: "bold" }, { type: "link", attrs: { href: "/events" } }] }] }] }, link: { label: "Read", href: "/read", newTab: false }, media: { id: "media-id", focalPoint: { x: 0.3, y: 0.6 } }, icon: "calendar", tone: "muted", date: "2026-09-05", ref: "event-id", menu: "menu-id", form: "form-id", choice: "a", rows: [{ nested: { enabled: true, count: 1 } }] };
    s.examples.push(input);
    await put(root, "blocks/events/upcoming", s); await syncBlocks({ root });
    const generated = await import(pathToFileURL(path.join(root, "blocks/.generated/convex.ts")).href);
    const attrs = generated.validateBlockAttrs(s.name, input);
    expect(attrs).toEqual(attrsSchema(parseBlockSpec(s).fields).parse(input));
    const t = convexTest(defineSchema({ blocks: defineTable({ attrs: generated.blockAttrsValidators[s.name] }) }), modules);
    await t.run(async (ctx: any) => { const id = await ctx.db.insert("blocks", { attrs }); expect((await ctx.db.get(id)).attrs).toEqual(attrs); });
    const check = Bun.spawn([process.execPath, path.join(repo, "ConvexPress-Admin/node_modules/typescript/bin/tsc"), "--noEmit", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "bundler", "--strict", "--skipLibCheck", path.join(root, "blocks/.generated/convex.ts"), path.join(root, "blocks/.generated/types.ts"), path.join(root, "blocks/.generated/metadata.ts")], { stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([check.exited, new Response(check.stdout).text(), new Response(check.stderr).text()]);
    expect({ code, output: stdout + stderr }).toEqual({ code: 0, output: "" });
  });
});
