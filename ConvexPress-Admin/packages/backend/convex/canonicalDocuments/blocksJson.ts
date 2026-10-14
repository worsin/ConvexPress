/**
 * Canonical block trees cross the public API as JSON text (`blocksJson`).
 *
 * A tree's block attributes are defined per block, including blocks a site
 * authors at runtime, and its children nest recursively, so no Convex
 * validator can state it without `v.any()`. Every write path already checks
 * the parsed tree against the block definitions (service.prepareCanonicalSave,
 * the AI catalog, recoverCanonicalDraft, syncedBlocks `content`), so the
 * transport only has to be valid JSON.
 */
import { ConvexError } from "convex/values";

import type { WriteArgs } from "./service";

/** The JSON-encoded tree, parsed for the canonical validation that follows. */
export function parseBlocksJson(text: string, argument = "blocksJson"): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw new ConvexError({ code: "INVALID_CANONICAL_DOCUMENT", message: `${argument} is not valid JSON.` });
  }
}

/** A document write as the public functions receive it. */
export type WriteTransportArgs = Omit<WriteArgs, "blocks"> & { blocksJson: string };

export function decodeWriteArgs({ blocksJson, ...args }: WriteTransportArgs): WriteArgs {
  return { ...args, blocks: parseBlocksJson(blocksJson) };
}
