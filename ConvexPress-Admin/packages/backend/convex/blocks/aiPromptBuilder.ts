/**
 * AI prompt builder — backend re-export shim.
 *
 * All catalog data + prompt building lives in the shared package
 * `@convexpress-admin/blocks-catalog`. This file re-exports the public API so
 * existing imports in convex/blocks/ai.ts keep working.
 *
 * Why a shim? Convex's `--typecheck=enable` deploys recompile every module that
 * gets imported, and we want the backend's `import` paths to remain stable
 * for callers, but the actual catalog data to live in one place that the
 * frontend can also reference in the future. Adding fields to a block now
 * means editing ONE file (packages/blocks-catalog/src/index.ts), not two.
 */

export {
  BLOCK_CATALOG,
  getCatalogEntry,
  buildBlockCatalogPrompt,
  buildPageGenerationPrompt,
  buildBlockRegenerationPrompt,
  refinementForImprovePreset,
  extractJson,
  validateAttrsForCatalogEntry,
} from "@convexpress-admin/blocks-catalog";

export type {
  BlockCatalogEntry,
  BlockAttrsValidationResult,
} from "@convexpress-admin/blocks-catalog";
