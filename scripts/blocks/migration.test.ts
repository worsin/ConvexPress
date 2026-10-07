import { expect, test } from "bun:test";
import { readFile, mkdtemp, writeFile, readdir, unlink, rmdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { legacyInventory, stagedMigrationPlan, ROOT, extractField } from "./migrate-existing";
import { migrateLegacyBlock } from "./staged-migration.mjs";
import { attrsSchema, parseBlockSpec, z } from "./schema.mjs";
import { discoverBlocks } from "./discovery.mjs";
import { generateArtifacts, dependencyFields } from "./generator.mjs";

test("lossless scalar repeaters, numeric selects and flat media/reference IDs preserve storage and dependency paths", () => {
  const issues: any[] = [];
  const fields = [extractField(z.array(z.string().max(120)).max(48).default([]), "productIds", [], issues), extractField(z.string().default(""), "mediaId", [], issues), extractField(z.union([z.literal(1), z.literal(2)]).default(2), "level", [], issues)];
  expect(issues).toEqual([]);
  const schema = attrsSchema(fields);
  expect(schema.parse({})).toEqual({ productIds: [], mediaId: "", level: 2 });
  expect(schema.parse({ productIds: ["product-1", ""], mediaId: "media-1", level: 1 })).toEqual({ productIds: ["product-1", ""], mediaId: "media-1", level: 1 });
  expect(schema.safeParse({ level: "1" }).success).toBe(false);
  expect(dependencyFields(fields)).toEqual([
    { path: ["productIds", "*"], type: "reference", of: "product", storage: "id", allowEmpty: true, valuePath: [] },
    { path: ["mediaId"], type: "media", storage: "id", allowEmpty: true, valuePath: [] },
  ]);
});
test("unsafe refinements, invalid defaults, user references and actual design attrs remain explicit blockers", () => {
  for (const [schema, id, expected] of [
    [z.string().refine(v => v.startsWith("/")), "href", "unsupported-refinement"],
    [z.string().min(1).default(""), "title", "invalid-default"],
    [z.string().default(""), "userId", "unsupported-reference"],
    [z.number().min(2).max(4).default(3), "columns", "layout-intent"],
  ] as const) { const issues: any[] = []; extractField(schema, id, [], issues); expect(issues.some(i => i.code === expected)).toBe(true); }
  const issues: any[] = [];
  extractField(z.array(z.string().max(40)).min(2).default(["Feature", "Us"]), "columns", [], issues);
  extractField(z.string().nullable().default(null), "note", [], issues);
  expect(issues).toEqual([]);
});
test("every current definition is accounted for; migrated save contracts preserve boundaries and Website rendering of normalized attrs", async () => {
  const legacy = await legacyInventory(), plans = await stagedMigrationPlan();
  expect(plans.map(p => p.name).sort()).toEqual(legacy.map(p => p.name).sort());
  const report = JSON.parse(await readFile(path.join(ROOT, "blocks/.migration/existing-contracts.json"), "utf8"));
  expect(report.map((p: any) => [p.name, p.issues])).toEqual(plans.map(p => [p.name, p.issues]));
  const found = await discoverBlocks(ROOT);
  const generated = await generateArtifacts(found);
  const dir = await mkdtemp(path.join(ROOT, "ConvexPress-Admin/.migration-contract-test-"));
  try {
    for (const [name, code] of Object.entries(generated)) await writeFile(path.join(dir, name), code as string);
    const { validateBlockAttrs } = await import(pathToFileURL(path.join(dir, "schemas.ts")).href);
    for (const plan of plans) {
      if (plan.issues.length) { expect(found.blocks.some((b: any) => b.spec.name === plan.name)).toBe(false); continue; }
      const source = legacy.find(l => l.name === plan.name)!;
      const spec = parseBlockSpec(JSON.parse(await readFile(path.join(ROOT, plan.specPath), "utf8")));
      expect(spec.version).toBe(source.metadata.version + (spec.migration ? 1 : 0));
      if (spec.migration) {
        const scope = { websiteKey: "site", instanceKey: "staging" };
        for (const input of [{}, source.schema.parse({})]) {
          const original = { id: "block-id", name: source.name, version: source.metadata.version, attrs: input };
          const result = await migrateLegacyBlock({ block: original, spec, legacySchema: source.schema, websiteSchema: source.websiteSchema, sourceScope: scope, targetScope: scope, packId: "journal", resolveTreatment: async (request: any) => ({ ...request, style: "legacy-verified", verified: true }) });
          expect(result.revision.original).toEqual(original);
          expect(result.legacyRender.attrs).toEqual((source.websiteSchema ?? source.schema).parse(input));
          expect(validateBlockAttrs(plan.name, result.block.attrs)).toEqual(result.block.attrs);
          expect(result.activation).toBe("requires-render-acceptance");
        }
        continue;
      }
      const base = source.schema.parse({});
      const fixtures: any[] = [{}, ...spec.examples, base];
      for (const field of spec.fields) {
        const values: any[] = [null, "", "Example", 0, 1.5, -1, true, false, [], {}, "x".repeat((field.max ?? 100) + 1)];
        if (field.type === "number") values.push(field.min, field.max, (field.min ?? 0) - 0.5, (field.max ?? 10) + 0.5);
        if (field.type === "select") values.push(...field.options, "unknown-enum");
        if (field.type === "repeater") {
          const item = field.item ? field.item.type === "select" ? field.item.options[0] : "item" : Object.fromEntries(field.fields.filter((f: any) => f.required).map((f: any) => [f.id, "value"]));
          values.push([item]);
          if (field.max !== undefined) values.push(Array.from({ length: field.max + 1 }, () => item));
        }
        for (const value of values.filter(v => v !== undefined)) fixtures.push({ ...base, [field.id]: value });
      }
      for (const input of fixtures) {
        const old = source.schema.safeParse(input);
        let output, success = true;
        try { output = validateBlockAttrs(plan.name, input); } catch { success = false; }
        expect({ name: plan.name, input, success }).toEqual({ name: plan.name, input, success: old.success });
        if (old.success) expect(output).toEqual(old.data);
        if (source.websiteSchema && old.success) {
          // Current core website intentionally accepts more values and has some
          // different defaults. Preserve rendering of actual saved (normalized)
          // data; record raw-input drift as an activation/preflight requirement.
          const website = source.websiteSchema.safeParse(old.data);
          expect({ name: plan.name, success: website.success }).toEqual({ name: plan.name, success: true });
          if (website.success) expect(website.data).toEqual(old.data);
        }
      }
    }
    const check = Bun.spawn([process.execPath, path.join(ROOT, "ConvexPress-Admin/node_modules/typescript/bin/tsc"), "--noEmit", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "bundler", "--strict", "--skipLibCheck", path.join(dir, "convex.ts"), path.join(dir, "types.ts"), path.join(dir, "metadata.ts")], { stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([check.exited, new Response(check.stdout).text(), new Response(check.stderr).text()]);
    expect({ code, output: stdout + stderr }).toEqual({ code: 0, output: "" });
  } finally { for (const name of await readdir(dir)) await unlink(path.join(dir, name)); await rmdir(dir); }
});

test('repeatable migration planning retains installed canonical fields, nested action rules and authored examples', async () => {
  const names = ['core/feature-grid', 'core/team-grid'];
  const before = new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(ROOT, `blocks/${name}/block.json`), 'utf8')] as const)));
  const plans = await stagedMigrationPlan();
  for (const name of names) {
    const plan = plans.find(plan => plan.name === name)!;
    expect(plan.candidate).toEqual(JSON.parse(before.get(name)!));
    expect(plan.issues).toEqual([]);
    expect(await readFile(path.join(ROOT, `blocks/${name}/block.json`), 'utf8')).toBe(before.get(name)!);
  }
});
