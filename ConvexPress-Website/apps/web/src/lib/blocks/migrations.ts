import type { ConvexPressBlock } from "./types";
import { validateBlockInstance } from "./validation";

export const CURRENT_BLOCKS_VERSION = 1;

export type BlockMigration = {
  name: string;
  from: number;
  to: number;
  migrate: (attrs: Record<string, unknown>) => Record<string, unknown>;
};

const MIGRATIONS: BlockMigration[] = [];

export function migrateBlock(block: ConvexPressBlock): ConvexPressBlock {
  let next: ConvexPressBlock = { ...block, attrs: block.attrs ?? {} };
  let applied = true;
  while (applied) {
    applied = false;
    const migration = MIGRATIONS.find(
      (item) => item.name === next.name && item.from === next.version,
    );
    if (migration) {
      next = {
        ...next,
        version: migration.to,
        attrs: migration.migrate(next.attrs),
      };
      applied = true;
    }
  }
  if (next.innerBlocks) {
    next.innerBlocks = next.innerBlocks.map(migrateBlock);
  }
  return next;
}

export function migrateBlocks(blocks: ConvexPressBlock[] | undefined): ConvexPressBlock[] {
  return (blocks ?? []).map(migrateBlock).map((block) => {
    const result = validateBlockInstance(block);
    return result.ok ? result.block : block;
  });
}
