import type { ConvexPressBlock } from "../../ConvexPress-Admin/apps/web/src/lib/blocks/types";

export function migrateExampleBlock(block: ConvexPressBlock) {
  if (block.name !== "example/simple-section") return block;
  if (block.version >= 2) return block;

  return {
    ...block,
    version: 2,
    attrs: {
      eyebrow: "",
      ...block.attrs,
    },
  };
}

