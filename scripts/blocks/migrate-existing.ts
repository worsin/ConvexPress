import { legacyTextToRichText } from "./legacy-richtext.mjs";
// One-time migration tooling, never imported by either runtime or registry.
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { BLOCK_DEFINITIONS } from "../../ConvexPress-Admin/packages/blocks-catalog/src/generated/definitions";
import { BLOCK_CATALOG } from "../../ConvexPress-Admin/packages/blocks-catalog/src/index";
import { attrsSchema, parseBlockSpec, z } from "./schema.mjs";
import { canonicalJson } from "./generator.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
type Issue = { path: string; code: string; requirement: string };
const plain = (value: unknown) => JSON.stringify(canonicalJson(value));
const categories = new Set(["text", "layout", "media", "openers", "marketing", "social", "commerce", "discovery", "forms", "plugin", "site"]);
const designAttrs = new Set(["alignment", "spacing", "ink", "font", "columns", "mediaPosition", "mediaSide", "side", "orientation", "display"]);
export function extractField(schema: any, id: string, parent: string[], issues: Issue[]): any {
  const field: any = { id }, here = [...parent, id].join(".");
  let current = schema;
  while (["default", "optional", "nullable"].includes(current._zod.def.type)) {
    const def = current._zod.def;
    if (def.type === "default") field.default = structuredClone(def.defaultValue);
    if (def.type === "nullable") field.nullable = true;
    current = def.innerType;
  }
  if (!schema.isOptional()) field.required = true;
  const def = current._zod.def;
  const literalOptions = def.type === "enum" ? Object.values(def.entries) : def.type === "union" ? def.options.flatMap((option: any) => option._zod.def.type === "literal" ? option._zod.def.values : []) : [];
  const visualVariant = id === "variant" && (literalOptions.includes("inline") || literalOptions.includes("subtle"));
  const visualSize = id === "size" && literalOptions.includes("small") && literalOptions.includes("large");
  if ((designAttrs.has(id) || visualVariant || visualSize) && !(id === "columns" && def.type === "array") && !(parent.at(-1) === "*" && parent.at(-2) === id)) issues.push({ path: here, code: "layout-intent", requirement: "Preserve the current value in a revision; define an explicit attrs-to-instance/primitive intent migration before activation. Do not keep a design control in the generated content editor." });
  const checks = (def.checks ?? []).map((check: any) => check._zod.def);
  for (const check of checks) {
    if (!["min_length", "max_length", "greater_than", "less_than", "number_format"].includes(check.check) || ((check.check === "greater_than" || check.check === "less_than") && !check.inclusive) || (check.check === "number_format" && check.format !== "safeint")) issues.push({ path: here, code: "unsupported-refinement", requirement: `Current ${check.check ?? check.type} validation is not representable by the closed field contract; migrate/revalidate saved values explicitly, never drop the refinement.` });
  }
  if (def.type === "string") {
    field.type = "text";
    if (current.minLength !== null) field.min = current.minLength;
    if (current.maxLength !== null) field.max = current.maxLength;
    // Migration-only classification, grounded in current MediaField controls
    // and schema comments. Runtime consumers use the resulting descriptors.
    if (id === "mediaId") { field.type = "media"; field.storage = "id"; field.allowEmpty = true; delete field.min; }
    if (["productId", "productIds", "categorySlug", "categorySlugs", "productSlugs"].includes(id)) {
      field.type = "reference"; field.of = id.startsWith("category") ? "category" : "product";
      field.storage = /Slug/.test(id) ? "slug" : "id"; field.allowEmpty = true; delete field.min;
    }
    if (id === "userId" || id === "tagSlug") issues.push({ path: here, code: "unsupported-reference", requirement: `The current ${id} refers to a user/tag outside reference.of's accepted vocabulary. Define its ownership/remapping policy before activation; do not disguise it as unrelated text.` });
  } else if (def.type === "number") {
    field.type = "number";
    for (const check of checks) {
      if (check.check === "number_format") field.integer = true;
      if (check.check === "greater_than") field.min = check.value;
      if (check.check === "less_than") field.max = check.value;
    }
  } else if (def.type === "boolean") field.type = "boolean";
  else if (def.type === "enum") { field.type = "select"; field.options = Object.values(def.entries); }
  else if (def.type === "literal") { field.type = "select"; field.options = def.values; }
  else if (def.type === "union" && def.options.every((option: any) => option._zod.def.type === "literal")) {
    field.type = "select"; field.options = def.options.flatMap((option: any) => option._zod.def.values);
  } else if (def.type === "object") {
    field.type = "object"; field.fields = Object.entries(current.shape).map(([key, value]) => extractField(value, key, [...parent, id], issues));
  } else if (def.type === "array") {
    field.type = "repeater";
    for (const check of checks) { if (check.check === "min_length") field.min = check.minimum; if (check.check === "max_length") field.max = check.maximum; }
    if (def.element._zod.def.type === "object") field.fields = Object.entries(def.element.shape).map(([key, value]) => extractField(value, key, [...parent, id, "*"], issues));
    else {
      field.item = extractField(def.element, id, [...parent, id, "*"], issues);
      field.item.id = "value"; field.item.required = true;
      if (Object.hasOwn(field.item, "default")) issues.push({ path: here, code: "array-default", requirement: "Scalar array items with defaults need an explicit lossless input contract." });
    }
  } else {
    issues.push({ path: here, code: "unsupported-type", requirement: `Unsupported legacy Zod type ${def.type}; preserve source until a lossless contract exists.` });
    field.type = "text"; // Report-only candidate: any issue prevents writing it.
  }
  if (Object.hasOwn(field, "default")) {
    const result = field.nullable && field.default === null ? { success: true, data: null } : current.safeParse(field.default);
    if (!result.success) issues.push({ path: here, code: "invalid-default", requirement: "Legacy Zod default bypasses its own constraints. Preserve existing content; repair the invalid default and specify saved-data handling before activation." });
    else if (plain(result.data) !== plain(field.default)) issues.push({ path: here, code: "default-normalization", requirement: "Parsing the legacy default changes nested values. Specify a lossless default migration; do not normalize existing stored data silently." });
  }
  return field;
}
export async function legacyInventory() {
  const registry = await readFile(path.join(ROOT, "ConvexPress-Admin/apps/web/src/lib/blocks/registry.tsx"), "utf8");
  const coreSource = "ConvexPress-Admin/apps/web/src/lib/blocks/schemas.ts";
  const websiteCore = await import(pathToFileURL(path.join(ROOT, "ConvexPress-Website/apps/web/src/lib/blocks/schemas.ts")).href);
  const portable = new Map<string, any>();
  for (const kind of ["blocks", "blocks.local"]) {
    const directory = path.join(ROOT, "ConvexPress-Admin/apps/web/src", kind);
    for (const folder of await readdir(directory, { withFileTypes: true })) {
      if (!folder.isDirectory() || folder.name.startsWith("_")) continue;
      let metadata;
      try { metadata = JSON.parse(await readFile(path.join(directory, folder.name, "block.json"), "utf8")); } catch (error: any) { if (error.code === "ENOENT") continue; throw error; }
      const source = `ConvexPress-Admin/apps/web/src/${kind}/${folder.name}/schema.ts`;
      let websiteSchema;
      try {
        const website = await import(pathToFileURL(path.join(ROOT, `ConvexPress-Website/apps/web/src/${kind}/${folder.name}/schema.ts`)).href);
        websiteSchema = Object.values(website).find((value: any) => value?.safeParse && value?.shape);
      } catch (error: any) { if (!/Cannot find module|ModuleNotFound/.test(error.message)) throw error; }
      portable.set(metadata.name, { metadata, source, websiteSchema });
    }
  }
  return Object.entries(BLOCK_DEFINITIONS).map(([name, value]) => {
    if (!name.startsWith("core/")) return { name, schema: value.schema, ...portable.get(name) };
    const section = registry.slice(registry.indexOf(`name: "${name}"`));
    const symbol = section.match(/schema:\s*(\w+)/)?.[1];
    const version = Number(section.match(/version:\s*(\d+)/)?.[1]);
    if (!symbol || !version) throw new Error(`Cannot resolve current registration for ${name}`);
    return { name, schema: value.schema, websiteSchema: websiteCore[symbol], source: coreSource, metadata: { version } };
  });
}
export async function migrationPlan() {
  const rows = JSON.parse(await readFile(path.join(ROOT, "scripts/blocks/fixtures/inventory-2026-09-05.json"), "utf8"));
  const tracker = new Map(rows.map((row: any) => [row.Name, row]));
  const plans = [];
  for (const legacy of await legacyInventory()) {
    const row: any = tracker.get(legacy.name);
    if (!row) throw new Error(`Register ${legacy.name} in the Standalone tracker before migration`);
    const catalog = BLOCK_CATALOG.find(entry => entry.name === legacy.name)!;
    const issues: Issue[] = [], fields = Object.entries(legacy.schema.shape).map(([id, schema]) => extractField(schema, id, [], issues));
    const category = categories.has(catalog.category) ? catalog.category : "site";
    const examples = [legacy.schema.parse({}), legacy.schema.parse(catalog.example)];
    let candidate = {
      name: legacy.name, title: catalog.title, description: catalog.description, category, role: row.Role, version: legacy.metadata.version,
      keywords: legacy.metadata.keywords ?? [], ai: { useFor: catalog.useFor || catalog.description, avoid: catalog.avoid || "" }, fields,
      supports: { children: false, styles: true, layout: ["width", "tone", "spacing", "align"], anchor: true, visibility: true },
      data: null, preview: fields.some((f: any) => f.id === "heading") ? "{heading}" : fields.some((f: any) => f.id === "title") ? "{title}" : catalog.title,
      examples: [...new Map(examples.map(value => [plain(value), value])).values()],
    };
    const extractedCandidate = structuredClone(candidate);
    let hasInstalledSpec = false;
    // A prior canonical spec may contain deliberately authored AI/resolver
    // metadata. A one-time extractor must not overwrite that source of truth.
    try { candidate = JSON.parse(await readFile(path.join(ROOT, `blocks/${legacy.name}/block.json`), "utf8")); hasInstalledSpec = true; } catch (error: any) { if (error.code !== "ENOENT") throw error; }
    if (!issues.length) {
      try { parseBlockSpec(candidate); } catch (error: any) { issues.push({ path: "spec", code: "contract", requirement: error.message }); }
    }
    const sourceHash = createHash("sha256").update(await readFile(path.join(ROOT, legacy.source), "utf8")).digest("hex");
    const websiteSchemaDiffers = Boolean(legacy.websiteSchema && plain(z.toJSONSchema(legacy.schema, { io: "input" })) !== plain(z.toJSONSchema(legacy.websiteSchema, { io: "input" })));
    const websiteDefaultDifference = legacy.websiteSchema && plain(legacy.schema.parse({})) !== plain(legacy.websiteSchema.parse({})) ? { savedDefaults: legacy.schema.parse({}), renderDefaults: legacy.websiteSchema.parse({}) } : null;
    plans.push({ name: legacy.name, source: legacy.source, sourceHash, rowId: row.rowId, specPath: `blocks/${legacy.name}/block.json`, candidate, extractedCandidate, hasInstalledSpec, issues, websiteSchemaAvailable: Boolean(legacy.websiteSchema), websiteSchemaDiffers, websiteDefaultDifference });
  }
  return plans;
}
function fieldAt(fields: any[], path: string[]): { fields: any[]; field: any } {
  const [head, ...tail] = path;
  const field = fields.find(f => f.id === head);
  if (!field) throw new Error(`Missing migration field ${path.join(".")}`);
  return tail.length ? fieldAt(field.fields, tail[0] === "*" ? tail.slice(1) : tail) : { fields, field };
}
function visitAttrs(attrs: any, path: string[], callback: (parent: any, key: string) => void) {
  const [head, ...tail] = path;
  if (head === "*") { if (Array.isArray(attrs)) for (const item of attrs) visitAttrs(item, tail, callback); }
  else if (attrs && Object.hasOwn(attrs, head)) { if (tail.length) visitAttrs(attrs[head], tail, callback); else callback(attrs, head); }
}
/** Resolve only explicitly understood legacy shapes into a v2 contract. Every
 * changed instance still goes through staged-migration's revision/approval gate. */
export async function stagedMigrationPlan() {
  const plans = await migrationPlan(), sources = await legacyInventory();
  for (const plan of plans) {
    const source = sources.find(s => s.name === plan.name)!;
    const candidate: any = structuredClone(plan.extractedCandidate);
    // Analyze the historical contract independently. Current canonical specs
    // can have newer fields/rules/resolvers that do not belong to old attrs.
    const ignored: Issue[] = [];
    candidate.fields = Object.entries(source.schema.shape).map(([id, schema]) => extractField(schema, id, [], ignored));
    const transforms: any[] = [], unresolved: Issue[] = [];
    for (const issue of ignored) {
      const at = issue.path.split(".");
      const { field, fields } = fieldAt(candidate.fields, at);
      if (issue.code === "layout-intent") {
        transforms.push({ kind: "pack-treatment", path: at }); fields.splice(fields.indexOf(field), 1);
      } else if (issue.code === "unsupported-refinement" && field.type === "text" && /(?:url|href|source)$/i.test(field.id)) {
        field.type = "link"; field.storage = "href"; field.allowEmpty = true; delete field.min;
      } else if (issue.code === "invalid-default" && field.default === "" && field.type === "text" && field.min > 0) {
        field.default = null; field.nullable = true; transforms.push({ kind: "empty-to-null", path: at });
      } else if (issue.code === "unsupported-reference" && ["userId", "tagSlug"].includes(field.id)) {
        field.type = "reference"; field.of = field.id === "userId" ? "user" : "tag"; field.storage = field.id === "userId" ? "id" : "slug"; field.allowEmpty = true; delete field.min;
      } else unresolved.push(issue);
    }
    const oldDefaults = (source.websiteSchema ?? source.schema).parse({});
    for (const field of candidate.fields) {
      if (field.min > 0 && (oldDefaults[field.id] === "" || (Array.isArray(oldDefaults[field.id]) && oldDefaults[field.id].length === 0))) {
        field.nullable = true;
        if (!transforms.some(t => t.kind === "empty-to-null" && t.path.join(".") === field.id)) transforms.push({ kind: "empty-to-null", path: [field.id] });
      }
    }
    const inlinePlans: Record<string, { path: string[]; mode: string }[]> = {
      "core/paragraph": [{ path: ["body"], mode: "markdown-prose" }],
      "core/rich-text": [{ path: ["body"], mode: "plain-prose" }],
      "core/heading": [{ path: ["text"], mode: "plain-inline" }],
      "core/list": [{ path: ["items", "*", "text"], mode: "markdown-inline" }],
    };
    for (const conversion of inlinePlans[plan.name] ?? []) {
      const { field } = fieldAt(candidate.fields, conversion.path);
      field.type = "richtext"; field.inline = conversion.mode.endsWith("inline"); delete field.min;
      if (Object.hasOwn(field, "default")) field.default = legacyTextToRichText(field.default, conversion.mode);
      // Parent repeater defaults contain stored raw strings and must be migrated
      // too, before the field tree's default validation runs.
      if (conversion.path.includes("*")) for (const row of candidate.fields.find((f: any) => f.id === conversion.path[0]).default ?? []) row[conversion.path[2]] = legacyTextToRichText(row[conversion.path[2]], conversion.mode);
      transforms.push({ kind: "text-to-richtext", ...conversion });
    }
    if (ignored.length || plan.websiteSchemaDiffers || transforms.length) {
      candidate.version = source.metadata.version + 1;
      candidate.migration = { fromVersion: source.metadata.version, preserveLegacyRender: true, transforms };
    }
    candidate.examples = [source.schema.parse({}), source.schema.parse(BLOCK_CATALOG.find(c => c.name === plan.name)!.example)].map(original => {
      const attrs = structuredClone(original);
      for (const transform of transforms) visitAttrs(attrs, transform.path, (parent, key) => {
        if (transform.kind === "pack-treatment") delete parent[key];
        else if (transform.kind === "text-to-richtext") parent[key] = legacyTextToRichText(parent[key], transform.mode);
        else if (parent[key] === "" || (Array.isArray(parent[key]) && !parent[key].length)) parent[key] = null;
      });
      return attrs;
    });
    if (!unresolved.length) parseBlockSpec(candidate);
    if (!plan.hasInstalledSpec) plan.candidate = candidate;
    else parseBlockSpec(plan.candidate);
    plan.issues = unresolved;
  }
  return plans;
}
if (import.meta.main) {
  if (process.argv.slice(2).some(arg => !["--write-representable", "--write-staged", "--check"].includes(arg))) throw new Error("Usage: bun scripts/blocks/migrate-existing.ts [--write-representable | --write-staged | --check]");
  const write = process.argv.includes("--write-representable");
  const staged = process.argv.includes("--write-staged");
  if ((write || staged) && process.argv.includes("--check")) throw new Error("Choose write or check mode");
  const plans = staged || process.argv.includes("--check") ? await stagedMigrationPlan() : await migrationPlan();
  for (const plan of plans) {
    if ((write || staged) && !plan.hasInstalledSpec && !plan.issues.length && plan.name !== "events/upcoming") {
      const file = path.join(ROOT, plan.specPath);
      await mkdir(path.dirname(file), { recursive: true });
      try { await writeFile(file, JSON.stringify(plan.candidate, null, 2) + "\n", { flag: "wx" }); } catch (error: any) { if (error.code !== "EEXIST") throw error; }
    }
  }
  const report = plans.map(({ candidate, extractedCandidate: _extractedCandidate, ...plan }) => ({ ...plan, state: plan.issues.length ? "migration-required" : candidate.migration ? "staged-migration" : "representable", metadata: { title: candidate.title, category: candidate.category, role: candidate.role, version: candidate.version, fields: candidate.fields, data: candidate.data, supports: candidate.supports, ...(candidate.migration ? { migration: candidate.migration } : {}) } }));
  if (write || staged) {
    const output = path.join(ROOT, "blocks/.migration"); await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "existing-contracts.json"), JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify({ existing: plans.length, representable: plans.filter(p => !p.issues.length).length, websiteSchemaDifferences: plans.filter(p => p.websiteSchemaDiffers).length, websiteDefaultDifferences: plans.filter(p => p.websiteDefaultDifference).length, pendingRenderAcceptance: plans.filter(p => p.candidate.migration).map(p => p.name), migrationRequired: plans.filter(p => p.issues.length).map(p => ({ name: p.name, issues: [...new Set(p.issues.map(i => i.code))] })) }, null, 2));
  if (!write && !staged && plans.some(p => p.issues.length || p.websiteSchemaDiffers || p.candidate.migration)) process.exitCode = 1;
}
