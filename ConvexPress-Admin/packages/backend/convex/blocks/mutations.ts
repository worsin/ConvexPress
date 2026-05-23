import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { emitEvent } from "../helpers/events";
import { getCurrentUser, requireCan, getUserIdentifier } from "../helpers/permissions";
import { PAGE_EVENTS, POST_EVENTS, SYSTEM } from "../events/constants";
import {
  assertRevision,
  countBlockNames,
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
import { migrateBlocks } from "./migrations";
import {
  duplicateBlockArgs,
  insertBlockArgs,
  moveBlockArgs,
  removeBlockArgs,
  replaceBlocksArgs,
  updateBlockAttrsArgs,
} from "./validators";

async function requireEditableDocument(ctx: any, postId: any): Promise<Doc<"posts">> {
  const doc = await ctx.db.get("posts", postId);
  if (!doc || (doc.type !== "page" && doc.type !== "post")) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Content document not found",
    });
  }

  await requireCan(ctx, doc.type === "page" ? "page.update" : "post.update");
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
 * The revision's `content` field stores the serialized blocks JSON — the
 * frontend's `lib/blockDiff.ts` already knows how to parse this array shape
 * and produce a block-aware diff in the Revisions UI.
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

  // The Revision System requires `changedFields` to mention "title",
  // "content", or "excerpt" to actually record the snapshot. Always
  // include "content" since the blocks ARE the content from the rev system's
  // perspective.
  const fields = Array.from(new Set(["content", ...changedFields]));

  await ctx.runMutation(internal.revisions.internals.createOnSave, {
    parentId: doc._id,
    parentType: doc.type === "page" ? ("page" as const) : ("post" as const),
    title: doc.title ?? "",
    // Snapshot the PRE-change block tree so the revision represents
    // "what was there before this edit". Matches the contract used by
    // post.update / page.update for non-block content.
    content: previousSerialized,
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
  const migratedBlocks = migrateBlocks(blocks);
  validateBlocks(migratedBlocks);
  validateBlocksAgainstCatalog(migratedBlocks);

  // Snapshot the current state into the Revision System BEFORE patching in
  // the new blocks. Safe to await — if it fails (no user, revisions disabled,
  // etc.) it returns silently.
  const previousBlocks = getStoredBlocks(doc);
  try {
    await snapshotBlocksRevision(
      ctx,
      doc,
      previousBlocks,
      migratedBlocks,
      changedFields,
    );
  } catch (err) {
    // Don't fail the save if the revision write blows up. Log via the event
    // stream instead so it shows up in the admin's activity log.
    console.error("[blocks] revision snapshot failed:", err);
  }

  const revision = getBlocksRevision(doc) + 1;
  await ctx.db.patch("posts", doc._id, {
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

async function loadDisabledBlockNames(ctx: any): Promise<Set<string>> {
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

async function assertNoDisabledBlocksInTree(ctx: any, blocks: StoredBlock[]) {
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

async function assertNoNewDisabledBlocks(
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

export const updateBlockAttrs = mutation({
  args: updateBlockAttrsArgs,
  handler: async (ctx, args) => {
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
  },
});

export const insertBlock = mutation({
  args: insertBlockArgs,
  handler: async (ctx, args) => {
    const doc = await requireEditableDocument(ctx, args.postId);
    assertRevision(doc, args.expectedRevision);
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

export const replaceBlocks = mutation({
  args: replaceBlocksArgs,
  handler: async (ctx, args) => {
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
  },
});
