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
