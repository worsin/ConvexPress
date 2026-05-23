import type { BlockName, BlockValidationResult, ConvexPressBlock } from "./types";
import { getBlockDefinition } from "./registry";

export function validateBlockInstance(block: ConvexPressBlock): BlockValidationResult {
  const definition = getBlockDefinition(block.name as BlockName);
  if (!definition) {
    return {
      ok: false,
      block,
      message: `Unknown block type: ${block.name}`,
    };
  }

  const parsed = definition.schema.safeParse(block.attrs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      block,
      message: parsed.error.issues[0]?.message ?? "Invalid block attributes",
    };
  }

  return {
    ok: true,
    block: {
      ...block,
      name: definition.name,
      version: definition.version,
      attrs: parsed.data as Record<string, unknown>,
    },
  };
}

/**
 * Strip legacy `layout` and `lock` fields from a block. Those concepts moved
 * to the front-end skill in Phase 1 — the admin no longer owns presentation
 * decisions and locks are out of scope until templates land.
 */
function stripLegacyFields(block: ConvexPressBlock): ConvexPressBlock {
  const withLegacy = block as ConvexPressBlock & { layout?: unknown; lock?: unknown };
  if (withLegacy.layout === undefined && withLegacy.lock === undefined) return block;
  const next: ConvexPressBlock = {
    id: block.id,
    name: block.name,
    version: block.version,
    attrs: block.attrs,
  };
  if (block.innerBlocks) {
    next.innerBlocks = block.innerBlocks.map(stripLegacyFields);
  }
  return next;
}

export function normalizeBlockInstance(block: ConvexPressBlock): ConvexPressBlock {
  const result = validateBlockInstance(block);
  return stripLegacyFields(result.ok ? result.block : block);
}

export function normalizeBlocks(blocks: ConvexPressBlock[] | undefined): ConvexPressBlock[] {
  return (blocks ?? []).map(normalizeBlockInstance);
}
