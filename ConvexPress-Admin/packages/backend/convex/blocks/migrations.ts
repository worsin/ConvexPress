import type { StoredBlock } from "./helpers";

export const CURRENT_BLOCKS_VERSION = 1;

export type BlockMigration = {
  name: string;
  from: number;
  to: number;
  migrate: (attrs: Record<string, unknown>) => Record<string, unknown>;
};

const MIGRATIONS: BlockMigration[] = [];

export function migrateBlock(block: StoredBlock): StoredBlock {
  let next = { ...block, attrs: block.attrs ?? {} };
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

export function migrateBlocks(blocks: StoredBlock[]): StoredBlock[] {
  return blocks.map(migrateBlock);
}
