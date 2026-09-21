import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { syncBlocks } from "./generator.mjs";
import { upcomingEventsAttrsSchema as adminSchema } from "../../ConvexPress-Admin/apps/web/src/blocks/upcoming-events/schema";
import { upcomingEventsAttrsSchema as websiteSchema } from "../../ConvexPress-Website/apps/web/src/blocks/upcoming-events/schema";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../ConvexPress-Admin/packages/backend/package.json", import.meta.url));
const { convexTest } = require("convex-test");
const { defineSchema, defineTable } = require("convex/server");
const { v } = require("convex/values");
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
  test("generated upcoming attrs preserve current Admin/Website defaults and all existing valid attrs", async () => {
    const root = await fixture(), s = await spec();
    await put(root, "blocks/events/upcoming", s);
    await syncBlocks({ root });
    const generated = await import(pathToFileURL(path.join(root, "blocks/.generated/schemas.ts")).href);
    for (const input of [{}, ...s.examples, { heading: "Aster gatherings", intro: "Original prose", count: 12, showDescription: false, emptyText: "Soon" }]) {
      const output = generated.validateBlockAttrs("events/upcoming", input);
      expect(output).toEqual(adminSchema.parse(input));
      expect(output).toEqual(websiteSchema.parse(input));
    }
    for (const input of [{ count: 1.5 }, { count: 0 }, { count: 13 }, { heading: "x".repeat(161) }, { showDescription: "true" }]) {
      expect(adminSchema.safeParse(input).success).toBe(false);
      expect(() => generated.validateBlockAttrs("events/upcoming", input)).toThrow();
    }
    expect(() => generated.validateBlockAttrs("events/upcoming", { heading: "Good", className: "red" })).toThrow();
    expect(() => generated.validateBlockAttrs("constructor", {})).toThrow("Unknown block");
    expect(() => generated.validateBlockAttrs("unknown/block", {})).toThrow("Unknown block");
    const cvx = await import(pathToFileURL(path.join(root, "blocks/.generated/convex.ts")).href);
    const t = convexTest(defineSchema({ blocks: defineTable({ name: v.string(), attrs: cvx.blockAttrsValidators["events/upcoming"] }) }), modules);
    await t.run(async (ctx: any) => {
      const attrs = cvx.validateBlockAttrs("events/upcoming", { count: 2 });
      const id = await ctx.db.insert("blocks", { name: "events/upcoming", attrs });
      expect((await ctx.db.get(id)).attrs.count).toBe(2);
      await expect(ctx.db.insert("blocks", { name: "events/upcoming", attrs: { className: "red" } })).rejects.toThrow();
    });
  });
