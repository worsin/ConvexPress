import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { countBlockNames, type StoredBlock } from "./helpers";

export async function loadDisabledBlockNames(ctx: any): Promise<Set<string>> {
  const settings = await ctx.runQuery(internal.settings.internals.getInternal, {
    section: "blocks",
  });
  const names = (settings as any)?.disabledBlockNames;
  if (!Array.isArray(names)) return new Set();
  return new Set(
    names.filter((name: unknown): name is string => typeof name === "string"),
  );
}

function collectBlockNames(blocks: StoredBlock[], into: Set<string>) {
  for (const block of blocks) {
    if (block && typeof block.name === "string") into.add(block.name);
    if (Array.isArray(block?.innerBlocks)) {
      collectBlockNames(block.innerBlocks, into);
    }
  }
}

export async function assertNoDisabledBlocksInTree(ctx: any, blocks: StoredBlock[]) {
  const disabled = await loadDisabledBlockNames(ctx);
  if (disabled.size === 0) return;
  const usedNames = new Set<string>();
  collectBlockNames(blocks, usedNames);
  const offenders = [...usedNames].filter((name) => disabled.has(name));
  if (offenders.length > 0) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Cannot save: these block types are disabled — ${offenders.join(", ")}`,
    });
  }
}

export async function assertNoNewDisabledBlocks(
  ctx: any,
  previousBlocks: StoredBlock[],
  nextBlocks: StoredBlock[],
) {
  const disabled = await loadDisabledBlockNames(ctx);
  if (disabled.size === 0) return;

  const previousCounts = countBlockNames(previousBlocks);
  const nextCounts = countBlockNames(nextBlocks);
  const offenders = [...disabled].filter(
    (name) => (nextCounts.get(name) ?? 0) > (previousCounts.get(name) ?? 0),
  );

  if (offenders.length > 0) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Cannot add disabled block types: ${offenders.join(", ")}`,
    });
  }
}
