/** One conversion for every legacy (blocksVersion 1) authoring source: the
 * in-editor migration, historical revision imports and imports from older
 * ConvexPress sites. Pure; every converter is lossless and throws
 * LegacyMigrationError rather than discarding authored content. */
import type { CanonicalTree } from "./foundation/generated/types";
import type { InactiveLegacySettings } from "./foundation/migrationContracts";
import { reviewLegacyBlocks, type LegacyRichTextFormat } from "./foundation/legacyBlockMigration";
import { migrateLegacySections } from "./foundation/legacySectionMigration";
import { reviewLegacyDocumentSource } from "./foundation/legacyDocumentMigration";
import { hasStructuredArticle, migrateStructuredArticle, type StructuredArticle } from "./foundation/legacyStructuredMigration";

/** The fields an older ConvexPress renderer could display a document from. */
export type LegacyAuthoringSource = StructuredArticle & {
  type: "post" | "page";
  slug: string;
  contentMode?: "article" | "blocks";
  blocks?: readonly unknown[];
  pageSections?: unknown;
  content?: string;
  /** How the version 1 `core/rich-text` blocks' bodies were authored; plain unless declared. */
  richTextFormat?: LegacyRichTextFormat;
};
export type LegacySourceKind = "blocks" | "sections" | "structured-article" | "document";
export type LegacyAuthoringConversion = {
  blocks: CanonicalTree;
  importedContent?: "plain-text" | "html";
  inactiveSettings?: InactiveLegacySettings[];
};

/** Match the Website's visible-source precedence. Block-mode documents prefer
 * nonempty blocks to anything else, block-mode pages use their sections
 * (including an empty list) rather than hidden article text, and posts prefer
 * a visible structured article to their document body. Hidden fields are never
 * chosen by guess; callers keep them with the original source. */
export function legacySourceKind(source: LegacyAuthoringSource): LegacySourceKind {
  if (source.contentMode === "blocks" && source.blocks?.length) return "blocks";
  if (source.contentMode === "blocks" && source.type === "page") return "sections";
  if (source.type === "post" && hasStructuredArticle(source)) return "structured-article";
  return "document";
}

/** `identity` seeds the stable block ids derived from document content. Use the
 * persisted document id, or a stable source reference before one exists. */
export function convertLegacyAuthoring(source: LegacyAuthoringSource, identity: string, reusableSources?: ReadonlyMap<string, string>): LegacyAuthoringConversion {
  switch (legacySourceKind(source)) {
    case "blocks": {
      const review = reviewLegacyBlocks(source.blocks, { richTextFormat: source.richTextFormat });
      return { blocks: review.blocks, ...(review.inactiveSettings.length ? { inactiveSettings: review.inactiveSettings } : {}) };
    }
    case "sections":
      return { blocks: migrateLegacySections(source.pageSections ?? []) };
    case "structured-article":
      return { blocks: migrateStructuredArticle({
        postId: identity, path: `/blog/${source.slug}`, hero: source.hero, topics: source.topics,
        summary: source.summary, sources: source.sources, tableOfContents: source.tableOfContents,
      }) };
    case "document": {
      const reviewed = reviewLegacyDocumentSource({ postId: identity, content: source.content ?? "", reusableSources });
      return { blocks: reviewed.blocks, ...(reviewed.importedContent ? { importedContent: reviewed.importedContent } : {}) };
    }
  }
}
