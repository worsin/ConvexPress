import { v } from "convex/values";

export const contentModeValidator = v.union(
  v.literal("article"),
  v.literal("blocks"),
);

// ── Legacy layout / lock validators ───────────────────────────────────────
// The block envelope no longer carries presentation or lock attrs — those
// moved to the front-end skill (layout) and were never wired (lock). The
// validators below are kept ONLY for backward-compat reading of existing
// documents that still have the optional fields populated. New writes do
// not include them.
const legacyBlockLayoutValidator = v.object({
  tone: v.optional(v.union(v.literal("default"), v.literal("muted"), v.literal("accent"), v.literal("contrast"))),
  padding: v.optional(v.union(v.literal("compact"), v.literal("normal"), v.literal("spacious"))),
  container: v.optional(v.union(v.literal("content"), v.literal("wide"), v.literal("full"))),
  align: v.optional(v.union(v.literal("default"), v.literal("wide"), v.literal("full"))),
});

const legacyBlockLockValidator = v.object({
  move: v.optional(v.boolean()),
  remove: v.optional(v.boolean()),
  edit: v.optional(v.boolean()),
});

export const blockInstanceValidator = v.object({
  id: v.string(),
  name: v.string(),
  version: v.number(),
  attrs: v.any(),
  // Recursive validation is performed in helpers so we can enforce depth and
  // count limits with clearer errors. The schema stores the envelope.
  innerBlocks: v.optional(v.any()),
  // Legacy fields — accepted for backward-compat, stripped on normalize.
  layout: v.optional(legacyBlockLayoutValidator),
  lock: v.optional(legacyBlockLockValidator),
});

export const blocksValidator = v.array(blockInstanceValidator);

export const postIdArgs = {
  postId: v.id("posts"),
};

export const blockMutationBaseArgs = {
  postId: v.id("posts"),
  expectedRevision: v.optional(v.number()),
};

export const updateBlockAttrsArgs = {
  ...blockMutationBaseArgs,
  blockId: v.string(),
  attrs: v.any(),
};

export const insertBlockArgs = {
  ...blockMutationBaseArgs,
  block: blockInstanceValidator,
  index: v.optional(v.number()),
  parentBlockId: v.optional(v.string()),
};

export const moveBlockArgs = {
  ...blockMutationBaseArgs,
  blockId: v.string(),
  toIndex: v.number(),
  fromParentBlockId: v.optional(v.string()),
  toParentBlockId: v.optional(v.string()),
};

export const duplicateBlockArgs = {
  ...blockMutationBaseArgs,
  blockId: v.string(),
};

export const removeBlockArgs = {
  ...blockMutationBaseArgs,
  blockId: v.string(),
};

export const replaceBlocksArgs = {
  ...blockMutationBaseArgs,
  blocks: blocksValidator,
  contentMode: v.optional(contentModeValidator),
};

