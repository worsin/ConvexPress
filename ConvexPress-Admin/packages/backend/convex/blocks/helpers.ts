import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { getCatalogEntry, validateAttrsForCatalogEntry } from "./aiPromptBuilder";

export type StoredBlock = {
  id: string;
  name: string;
  version: number;
  attrs: Record<string, unknown>;
  innerBlocks?: StoredBlock[];
};

export const MAX_TOP_LEVEL_BLOCKS = 200;
export const MAX_BLOCK_DEPTH = 4;
export const MAX_BLOCK_NAME_LENGTH = 120;
export const MAX_BLOCK_ID_LENGTH = 80;

/**
 * Strip legacy `layout` and `lock` envelope fields from blocks read out of
 * existing documents. Phase 1 of the refactor moved presentation entirely
 * to the front-end skill; the back-end no longer carries those concerns.
 */
function stripLegacyEnvelopeFields(block: any): StoredBlock {
  const stripped: StoredBlock = {
    id: block.id,
    name: block.name,
    version: block.version,
    attrs: block.attrs ?? {},
  };
  if (Array.isArray(block.innerBlocks)) {
    stripped.innerBlocks = block.innerBlocks.map(stripLegacyEnvelopeFields);
  }
  return stripped;
}

export function getStoredBlocks(doc: Doc<"posts">): StoredBlock[] {
  if (!Array.isArray(doc.blocks)) return [];
  return (doc.blocks as any[]).map(stripLegacyEnvelopeFields);
}

export function getBlocksRevision(doc: Doc<"posts">): number {
  return typeof doc.blocksRevision === "number" ? doc.blocksRevision : 0;
}

export function assertRevision(doc: Doc<"posts">, expectedRevision?: number) {
  if (
    expectedRevision !== undefined &&
    expectedRevision !== getBlocksRevision(doc)
  ) {
    throw new ConvexError({
      code: "CONFLICT",
      message: "The block document has changed. Refresh before applying this edit.",
      currentRevision: getBlocksRevision(doc),
    });
  }
}

export function validateBlocks(blocks: StoredBlock[], depth = 0) {
  if (depth > MAX_BLOCK_DEPTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Blocks can only be nested ${MAX_BLOCK_DEPTH} levels deep`,
    });
  }

  if (depth === 0 && blocks.length > MAX_TOP_LEVEL_BLOCKS) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `A document can contain at most ${MAX_TOP_LEVEL_BLOCKS} top-level blocks`,
    });
  }

  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid block",
      });
    }
    if (!block.id || block.id.length > MAX_BLOCK_ID_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid block id",
      });
    }
    if (!block.name || block.name.length > MAX_BLOCK_NAME_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid block name",
      });
    }
    if (typeof block.version !== "number") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid block version",
      });
    }
    if (!block.attrs || typeof block.attrs !== "object" || Array.isArray(block.attrs)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid attrs for block ${block.name}`,
      });
    }
    if (block.innerBlocks !== undefined) {
      if (!Array.isArray(block.innerBlocks)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Block innerBlocks must be an array",
        });
      }
      validateBlocks(block.innerBlocks, depth + 1);
    }
  }
}

export function validateBlocksAgainstCatalog(blocks: StoredBlock[]) {
  for (const block of blocks) {
    // Custom/local/extension blocks may not be present in the core AI catalog.
    // Their frontend Zod schema remains the source of truth; the backend
    // catalog check hardens known core blocks without breaking extensibility.
    if (!getCatalogEntry(block.name)) {
      if (block.innerBlocks) validateBlocksAgainstCatalog(block.innerBlocks);
      continue;
    }
    const result = validateAttrsForCatalogEntry(block.name, block.attrs);
    if (!result.ok) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: result.message,
      });
    }
    if (block.innerBlocks) validateBlocksAgainstCatalog(block.innerBlocks);
  }
}

export function countBlockNames(blocks: StoredBlock[], into = new Map<string, number>()) {
  for (const block of blocks) {
    into.set(block.name, (into.get(block.name) ?? 0) + 1);
    if (block.innerBlocks) countBlockNames(block.innerBlocks, into);
  }
  return into;
}

export function findBlockById(blocks: StoredBlock[], blockId: string): StoredBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.innerBlocks) {
      const found = findBlockById(block.innerBlocks, blockId);
      if (found) return found;
    }
  }
  return null;
}

export function updateBlockAttrs(
  blocks: StoredBlock[],
  blockId: string,
  attrs: Record<string, unknown>,
): { blocks: StoredBlock[]; found: boolean } {
  let found = false;
  const next = blocks.map((block) => {
    if (block.id === blockId) {
      found = true;
      return { ...block, attrs };
    }
    if (block.innerBlocks) {
      const result = updateBlockAttrs(block.innerBlocks, blockId, attrs);
      found = found || result.found;
      return { ...block, innerBlocks: result.blocks };
    }
    return block;
  });
  return { blocks: next, found };
}

export function insertBlock(
  blocks: StoredBlock[],
  block: StoredBlock,
  index?: number,
  parentBlockId?: string,
): { blocks: StoredBlock[]; foundParent: boolean } {
  if (!parentBlockId) {
    const next = [...blocks];
    const targetIndex = clampIndex(index ?? next.length, next.length);
    next.splice(targetIndex, 0, block);
    return { blocks: next, foundParent: true };
  }

  let foundParent = false;
  const next = blocks.map((item) => {
    if (item.id === parentBlockId) {
      foundParent = true;
      const innerBlocks = [...(item.innerBlocks ?? [])];
      const targetIndex = clampIndex(index ?? innerBlocks.length, innerBlocks.length);
      innerBlocks.splice(targetIndex, 0, block);
      return { ...item, innerBlocks };
    }
    if (item.innerBlocks) {
      const result = insertBlock(item.innerBlocks, block, index, parentBlockId);
      foundParent = foundParent || result.foundParent;
      return { ...item, innerBlocks: result.blocks };
    }
    return item;
  });

  return { blocks: next, foundParent };
}

export function removeBlock(
  blocks: StoredBlock[],
  blockId: string,
): { blocks: StoredBlock[]; removed?: StoredBlock } {
  let removed: StoredBlock | undefined;
  const next: StoredBlock[] = [];

  for (const block of blocks) {
    if (block.id === blockId) {
      removed = block;
      continue;
    }

    if (block.innerBlocks) {
      const result = removeBlock(block.innerBlocks, blockId);
      if (result.removed) removed = result.removed;
      next.push({ ...block, innerBlocks: result.blocks });
    } else {
      next.push(block);
    }
  }

  return { blocks: next, removed };
}

export function moveBlock(
  blocks: StoredBlock[],
  blockId: string,
  toIndex: number,
  toParentBlockId?: string,
): { blocks: StoredBlock[]; moved: boolean } {
  const removed = removeBlock(blocks, blockId);
  if (!removed.removed) return { blocks, moved: false };
  const inserted = insertBlock(
    removed.blocks,
    removed.removed,
    toIndex,
    toParentBlockId,
  );
  return { blocks: inserted.blocks, moved: inserted.foundParent };
}

export function duplicateBlock(
  blocks: StoredBlock[],
  blockId: string,
): { blocks: StoredBlock[]; duplicated: boolean } {
  const target = findBlock(blocks, blockId);
  if (!target) return { blocks, duplicated: false };
  const copy = cloneBlock(target);
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index >= 0) {
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    return { blocks: next, duplicated: true };
  }
  return insertAfterNested(blocks, blockId, copy);
}

function insertAfterNested(
  blocks: StoredBlock[],
  blockId: string,
  copy: StoredBlock,
): { blocks: StoredBlock[]; duplicated: boolean } {
  let duplicated = false;
  const next = blocks.map((block) => {
    if (!block.innerBlocks) return block;
    const index = block.innerBlocks.findIndex((item) => item.id === blockId);
    if (index >= 0) {
      duplicated = true;
      const innerBlocks = [...block.innerBlocks];
      innerBlocks.splice(index + 1, 0, copy);
      return { ...block, innerBlocks };
    }
    const result = insertAfterNested(block.innerBlocks, blockId, copy);
    duplicated = duplicated || result.duplicated;
    return { ...block, innerBlocks: result.blocks };
  });
  return { blocks: next, duplicated };
}

function findBlock(blocks: StoredBlock[], blockId: string): StoredBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.innerBlocks) {
      const found = findBlock(block.innerBlocks, blockId);
      if (found) return found;
    }
  }
  return null;
}

function cloneBlock(block: StoredBlock): StoredBlock {
  return {
    ...block,
    id: `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    innerBlocks: block.innerBlocks?.map(cloneBlock),
  };
}

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, length));
}
