import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, legacyInventory } from "./migrate-existing";
import { prepareContentMigration } from "./content-migration.mjs";
import { migrateStructuredArticle } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacyStructuredMigration";

const [inputPath, outputPath, ...extra] = process.argv.slice(2);
if (!inputPath || !outputPath || extra.length) throw new Error("Usage: bun scripts/blocks/preflight-content.ts INPUT.json OUTPUT.json");
const raw = await readFile(inputPath, "utf8");
if (Buffer.byteLength(raw) > 8 * 1024 * 1024) throw new Error("Preflight input exceeds eight MiB");
const input = JSON.parse(raw);
if (!Array.isArray(input.records) || input.records.length > 100) throw new Error("Expected at most 100 captured content records");
const definitions = new Map();
for (const legacy of await legacyInventory()) {
  definitions.set(legacy.name, { spec: JSON.parse(await readFile(path.join(ROOT, `blocks/${legacy.name}/block.json`), "utf8")), legacySchema: legacy.schema, websiteSchema: legacy.websiteSchema });
}
const records = [];
for (const record of input.records) records.push(await prepareContentMigration({ record, definitions, sourceScope: input.sourceScope, packId: input.packId,
  convertStructured: () => migrateStructuredArticle({ postId: record._id, path: `/blog/${record.slug}`, hero: record.hero, topics: record.topics, summary: record.summary, sources: record.sources, tableOfContents: record.tableOfContents }),
}));
const result = { checkedAt: new Date().toISOString(), capturedAt: input.capturedAt, writesToApplication: false, activationAllowed: false, sourceScope: input.sourceScope, packId: input.packId, records };
await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ records: records.length, candidates: records.filter(r => r.status === "requires-render-acceptance").length, conversionRequired: records.filter(r => r.status === "requires-conversion").map(r => ({ recordId: r.recordId, issues: r.issues })), activationAllowed: false }, null, 2));
if (records.some(record => record.status === "requires-conversion")) process.exitCode = 1;
