import { ConvexError, v, type ObjectType } from "convex/values";
import { internal } from "../_generated/api";
import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { emitEvent } from "../helpers/events";
import { getCurrentUser, requireCan, getUserIdentifier } from "../helpers/permissions";
import { canEditContent } from "../helpers/publicContent";
import { PAGE_EVENTS, POST_EVENTS, SYSTEM } from "../events/constants";
import {
  assertRevision,
  duplicateBlock as duplicateBlockInTree,
  findBlockById,
  getBlocksRevision,
  getStoredBlocks,
  insertBlock as insertBlockInTree,
  moveBlock as moveBlockInTree,
  removeBlock as removeBlockFromTree,
  updateBlockAttrs as updateBlockAttrsInTree,
  validateBlocks,
  validateBlocksAgainstCatalog,
  type StoredBlock,
} from "./helpers";
import { assertNoDisabledBlocksInTree, assertNoNewDisabledBlocks, loadDisabledBlockNames } from "./policy";
import { migrateBlocks } from "./migrations";
import {
  duplicateBlockArgs,
  insertBlockArgs,
  moveBlockArgs,
  removeBlockArgs,
  replaceBlocksArgs,
  updateBlockAttrsArgs,
} from "./validators";
import { patchWithMediaReferences } from "../media/attachmentGuard";

async function requireEditableDocument(ctx: MutationCtx, postId: Id<"posts">): Promise<Doc<"posts">> {
  const doc = await ctx.db.get("posts", postId);
  if (!doc || (doc.type !== "page" && doc.type !== "post")) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Content document not found",
    });
  }

  await requireCan(ctx, doc.type === "page" ? "page.update" : "post.update");
  if (!(await canEditContent(ctx, doc))) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Cannot edit this content document" });
  }
  return doc;
}

/**
 * Serialize a block tree to the canonical JSON string used by the Revision
 * System. We always strip the `_id` etc. to keep snapshots stable across
 * doc migrations.
 */
function serializeBlocksForRevision(blocks: StoredBlock[]): string {
  return JSON.stringify(blocks);
}

/**
 * Snapshot the doc's current block state into the Revision System before
 * we patch the new blocks in. Skips silently when the user isn't signed in
 * (the underlying mutation only runs from authenticated callers anyway) or
 * when nothing changed.
 *
 * The revision stores the complete authoring snapshot, including blocks and
 * article content separately, so switching editors remains recoverable.
 */
async function snapshotBlocksRevision(
  ctx: any,
  doc: Doc<"posts">,
  previousBlocks: StoredBlock[],
  nextBlocks: StoredBlock[],
  changedFields: string[],
) {
  // Skip if the blocks tree didn't actually change — saveBlocks is sometimes
  // called from no-op flows (e.g. validators re-running).
  const previousSerialized = serializeBlocksForRevision(previousBlocks);
  const nextSerialized = serializeBlocksForRevision(nextBlocks);
  if (previousSerialized === nextSerialized) return;

  // Auto-drafts shouldn't accumulate revisions; createOnSave double-checks
  // this, but we can short-circuit here as well.
  if ((doc as any).status === "auto-draft") return;

  const user = await getCurrentUser(ctx);
  if (!user) return;

  // Record a complete pre-change authoring snapshot, including the block tree.
  const fields = Array.from(new Set(["blocks", ...changedFields]));

  await ctx.runMutation(internal.revisions.internals.createOnSave, {
    parentId: doc._id,
    parentType: doc.type === "page" ? ("page" as const) : ("post" as const),
    title: doc.title ?? "",
    // Snapshot the PRE-change block tree so the revision represents
    // "what was there before this edit". Matches the contract used by
    // post.update / page.update for non-block content.
    content: doc.content ?? "",
    excerpt: (doc as any).excerpt,
    authorId: getUserIdentifier(user),
    changedFields: fields,
  });
}

async function saveBlocks(
  ctx: any,
  doc: Doc<"posts">,
  blocks: StoredBlock[],
  changedFields: string[],
) {
  validateBlocks(blocks);
  const migrated = migrateBlocks(blocks);
  validateBlocks(migrated);
  const migratedBlocks = validateBlocksAgainstCatalog(migrated);

  // Snapshot the current state into the Revision System BEFORE patching in
  // the new blocks. A snapshot failure aborts the edit transaction.
  const previousBlocks = getStoredBlocks(doc);
  await snapshotBlocksRevision(ctx, doc, previousBlocks, migratedBlocks, changedFields);

  const revision = getBlocksRevision(doc) + 1;
  await patchWithMediaReferences<"posts">(ctx, "posts", doc._id, {
    contentMode: "blocks",
    blocks: migratedBlocks,
    blocksVersion: 1,
    blocksRevision: revision,
    updatedAt: Date.now(),
  });

  if (doc.type === "page") {
    await emitEvent(ctx, PAGE_EVENTS.UPDATED, SYSTEM.PAGE, {
      pageId: doc._id,
      title: doc.title,
      changes: changedFields,
    });
  } else {
    await emitEvent(ctx, POST_EVENTS.UPDATED, SYSTEM.POST, {
      postId: doc._id,
      title: doc.title,
      changes: changedFields,
    });
  }

  return { postId: doc._id, revision };
}

async function updateBlockAttrsImpl(ctx: MutationCtx, args: ObjectType<typeof updateBlockAttrsArgs>) {
    const doc = await requireEditableDocument(ctx, args.postId);
    assertRevision(doc, args.expectedRevision);

    const result = updateBlockAttrsInTree(
      getStoredBlocks(doc),
      args.blockId,
      args.attrs as Record<string, unknown>,
    );
    if (!result.found) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });
    }

    return saveBlocks(ctx, doc, result.blocks, ["blocks", "blockAttrs"]);
}
export const updateBlockAttrs = mutation({
  args: updateBlockAttrsArgs,
  handler: updateBlockAttrsImpl,
});

export const insertBlock = mutation({
  args: insertBlockArgs,
  handler: async (ctx, args) => {
    const doc = await requireEditableDocument(ctx, args.postId);
    assertRevision(doc, args.expectedRevision);
    validateBlocks([args.block as StoredBlock]);
    await assertNoDisabledBlocksInTree(ctx, [args.block as StoredBlock]);

    const result = insertBlockInTree(
      getStoredBlocks(doc),
      args.block as StoredBlock,
      args.index,
      args.parentBlockId,
    );
    if (!result.foundParent) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Parent block not found" });
    }

    return saveBlocks(ctx, doc, result.blocks, ["blocks", "blockInserted"]);
  },
});

export const moveBlock = mutation({
  args: moveBlockArgs,
  handler: async (ctx, args) => {
    const doc = await requireEditableDocument(ctx, args.postId);
    assertRevision(doc, args.expectedRevision);

    const result = moveBlockInTree(
      getStoredBlocks(doc),
      args.blockId,
      args.toIndex,
      args.toParentBlockId,
    );
    if (!result.moved) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });
    }

    return saveBlocks(ctx, doc, result.blocks, ["blocks", "blockMoved"]);
  },
});

export const duplicateBlock = mutation({
  args: duplicateBlockArgs,
  handler: async (ctx, args) => {
    const doc = await requireEditableDocument(ctx, args.postId);
    assertRevision(doc, args.expectedRevision);

    const currentBlocks = getStoredBlocks(doc);
    const disabled = await loadDisabledBlockNames(ctx);
    const target = findBlockById(currentBlocks, args.blockId);
    if (target && disabled.has(target.name)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot duplicate disabled block type: ${target.name}`,
      });
    }

    const result = duplicateBlockInTree(currentBlocks, args.blockId);
    if (!result.duplicated) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });
    }

    await assertNoNewDisabledBlocks(ctx, currentBlocks, result.blocks);
    return saveBlocks(ctx, doc, result.blocks, ["blocks", "blockDuplicated"]);
  },
});

export const removeBlock = mutation({
  args: removeBlockArgs,
  handler: async (ctx, args) => {
    const doc = await requireEditableDocument(ctx, args.postId);
    assertRevision(doc, args.expectedRevision);

    const result = removeBlockFromTree(getStoredBlocks(doc), args.blockId);
    if (!result.removed) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });
    }

    return saveBlocks(ctx, doc, result.blocks, ["blocks", "blockRemoved"]);
  },
});

async function replaceBlocksImpl(ctx: MutationCtx, args: ObjectType<typeof replaceBlocksArgs>) {
    const doc = await requireEditableDocument(ctx, args.postId);
    assertRevision(doc, args.expectedRevision);
    validateBlocks(args.blocks as StoredBlock[]);
    validateBlocksAgainstCatalog(args.blocks as StoredBlock[]);
    await assertNoNewDisabledBlocks(
      ctx,
      getStoredBlocks(doc),
      args.blocks as StoredBlock[],
    );

    return saveBlocks(ctx, doc, args.blocks as StoredBlock[], [
      "blocks",
      "blocksReplaced",
    ]);
}
export const replaceBlocks = mutation({
  args: replaceBlocksArgs,
  handler: replaceBlocksImpl,
});

// AI writes recheck authority and current enablement in the same transaction
// as the revision-checked write. A query before a provider call is insufficient.
const aiReceipt = v.object({ postId: v.id("posts"), revision: v.number() });
export const replaceBlocksFromAi = internalMutation({
  args: { ...replaceBlocksArgs, expectedRevision: v.number() }, returns: aiReceipt,
  handler: async (ctx, args) => {
    await requireCan(ctx, "blocks.ai");
    await assertNoDisabledBlocksInTree(ctx, args.blocks as StoredBlock[]);
    return replaceBlocksImpl(ctx, args);
  },
});
export const updateBlockAttrsFromAi = internalMutation({
  args: { ...updateBlockAttrsArgs, expectedRevision: v.number() }, returns: aiReceipt,
  handler: async (ctx, args) => {
    await requireCan(ctx, "blocks.ai");
    const doc = await requireEditableDocument(ctx, args.postId);
    const block = findBlockById(getStoredBlocks(doc), args.blockId);
    if (!block) throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });
    await assertNoDisabledBlocksInTree(ctx, [block]);
    return updateBlockAttrsImpl(ctx, args);
  },
});
