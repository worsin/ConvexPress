import { createHash } from "node:crypto";
import { attrsSchema } from "./schema.mjs";
import { canonicalJson } from "./generator.mjs";
import { migrateLegacyBlock } from "./staged-migration.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");
const copy = value => structuredClone(value);
const fail = (code, path, message) => { throw Object.assign(new Error(message), { code, path }); };

/** Uses the existing page/post rendering precedence. A stored mode flag alone
 * does not prove that an article's text lives in its block array. */
export function renderedContentSource(record) {
  if (!["post", "page"].includes(record.type)) fail("UNSUPPORTED_RECORD", [], "Expected a page or post");
  if (record.contentMode === "blocks") {
    if (Array.isArray(record.blocks) && record.blocks.length) return "blocks";
    if (record.type === "page") return record.pageSections?.length ? "sections" : "empty-block-page";
  }
  // Match StructuredContent.hasStructuredContent: hero.title, topic.subtitle and
  // tableOfContents alone do not select this body in the public post surfaces.
  if (record.type === "post" && (
    (record.hero && ["subtitle", "content", "imageId", "videoUrl", "ctaText"].some(key => record.hero[key])) ||
    (Array.isArray(record.topics) && record.topics.some(topic => ["title", "content", "imageId", "videoUrl"].some(key => topic?.[key]))) ||
    (record.summary && (record.summary.title || record.summary.content)) ||
    (typeof record.sources === "string" && record.sources.trim())
  )) return "structured";
  return record.content ? "document" : "empty-document";
}

/** Prepares a deterministic, same-environment migration plan, never a write.
 * The full source revision remains attached even when a converter refuses.
 * Consumers must verify sourceHash again atomically when saving a reviewed plan. */
export async function prepareContentMigration({ record, sourceScope, targetScope = sourceScope, packId, definitions, resolveTreatment, resolveReference, convertStructured }) {
  if (!record?._id || typeof record._id !== "string") throw new Error("A persisted content identity is required");
  if (!sourceScope?.websiteKey || !sourceScope?.instanceKey || hash(sourceScope) !== hash(targetScope)) throw new Error("Content migration requires the exact source environment");
  if (Buffer.byteLength(JSON.stringify(record)) > 2 * 1024 * 1024) throw new Error("Content revision exceeds the migration limit");
  const original = copy(record);
  const base = { recordId: record._id, sourceScope: copy(sourceScope), packId, sourceHash: hash(original), originalRevision: original };
  let count = 0;
  const issues = [];
  const issueFrom = (error, at = []) => ({ code: error.code ?? "CONTRACT_OR_TREATMENT", path: error.path ?? at, message: String(error.message) });
  const ids = new Set();
  const claim = (id, depth, at) => {
    if (depth > 8 || ++count > 300) fail("TREE_LIMIT", at, "Content exceeds eight levels or 300 blocks");
    if (typeof id !== "string" || !id || ids.has(id)) fail("BLOCK_ID", at, "Block identity is absent or duplicated");
    ids.add(id);
  };
  const migrateBlock = async (block, at, depth = 1) => {
    claim(block.id, depth, at);
    const definition = definitions.get(block.name);
    if (!definition?.spec || !definition.legacySchema) fail("MISSING_BLOCK_MIGRATION", at, `No declared migration for ${block.name}`);
    if (block.children?.length && block.innerBlocks?.length) fail("AMBIGUOUS_CHILDREN", at, "Both legacy and canonical children contain content");
    const children = block.innerBlocks ?? block.children ?? [];
    if (!Array.isArray(children)) fail("INVALID_CHILDREN", at, "Block children must be an array");
    if (children.length && !definition.spec.supports.children) fail("CHILDREN_MIGRATION_REQUIRED", at, "This block needs an explicit child-container conversion");
    const leaf = copy(block);
    delete leaf.innerBlocks;
    delete leaf.children;
    const migrated = await migrateLegacyBlock({ block: leaf, spec: definition.spec, legacySchema: definition.legacySchema, websiteSchema: definition.websiteSchema, sourceScope, targetScope, packId, resolveTreatment, resolveReference });
    const converted = [];
    for (let i = 0; i < children.length; i++) converted.push(await migrateBlock(children[i], [...at, "children", i], depth + 1));
    return { ...migrated.block, ...(converted.length ? { children: converted } : {}) };
  };
  try {
    const source = renderedContentSource(record);
    let blocks = [];
    if (source === "blocks") {
      for (let i = 0; i < record.blocks.length; i++) {
        const at = ["blocks", i];
        try { blocks.push(await migrateBlock(record.blocks[i], at)); }
        catch (error) { issues.push(issueFrom(error, at)); }
      }
      // Never expose a partial candidate when another block cannot be migrated.
      // Independent top-level failures remain visible in the same review.
      if (issues.length) return { ...base, source, status: "requires-conversion", issue: issues[0], issues };
    } else if (source === "structured") {
      if (!convertStructured) fail("STRUCTURED_ADAPTER_REQUIRED", ["hero", "topics", "summary", "sources"], "The visible structured article requires its lossless converter; the lower-precedence article cannot replace it");
      blocks = await convertStructured(record);
      const countNodes = (nodes, depth = 1) => nodes.forEach((node, index) => { claim(node.id, depth, ["structured", index]); if (node.children) countNodes(node.children, depth + 1); });
      countNodes(blocks);
    } else if (source === "sections") {
      fail("SECTIONS_ADAPTER_REQUIRED", ["pageSections"], "Legacy sections require their declared block conversion before activation");
    } else if (source === "empty-block-page") {
      if (record.content) fail("HIDDEN_LEGACY_CONTENT", ["content"], "This page currently renders no blocks but retains legacy text; preserve it for an explicit display decision");
    } else if (source === "document") {
      let doc;
      try { doc = typeof record.content === "string" ? JSON.parse(record.content) : copy(record.content); }
      catch { fail("DOCUMENT_FORMAT", ["content"], "Legacy HTML or plain text needs a declared converter; it cannot be discarded or executed"); }
      if (doc?.type !== "doc" || !Array.isArray(doc.content) || Object.keys(doc).some(k => !["type", "content"].includes(k))) fail("DOCUMENT_FORMAT", ["content"], "Unsupported document root; retain its complete original revision");
      const definition = definitions.get("core/rich-text");
      if (!definition?.spec.fields.some(field => field.id === "body" && field.type === "richtext")) fail("RICH_TEXT_CONTRACT_REQUIRED", ["content"], "The rich-text contract must preserve structured inline content before article migration");
      for (let i = 0; i < doc.content.length; i++) {
        if (doc.content[i]?.type !== "paragraph") fail("DOCUMENT_NODE_ADAPTER_REQUIRED", ["content", i], `A lossless ${doc.content[i]?.type ?? "unknown"} converter is required`);
      }
      const id = `blk_migration_${hash({ recordId: record._id, path: ["content"] }).slice(0, 32)}`;
      claim(id, 1, ["content"]);
      const attrs = attrsSchema(definition.spec.fields).parse({ body: copy(doc) });
      blocks.push({ id, name: definition.spec.name, version: definition.spec.version, attrs });
    }
    return { ...base, source, status: "requires-render-acceptance", candidate: { blocksVersion: 2, blocks }, legacyFieldsToRetireAfterAcceptance: ["contentMode", "content", "pageSections"], blockCount: count };
  } catch (error) {
    const issue = issueFrom(error);
    return { ...base, status: "requires-conversion", issue, issues: [issue] };
  }
}

export function assertMigrationSourceUnchanged(plan, record, scope) {
  if (hash(scope) !== hash(plan.sourceScope) || record._id !== plan.recordId || hash(record) !== plan.sourceHash) throw new Error("Content or environment changed after migration review");
}
