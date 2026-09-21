import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { installation } from "../model";
import { validateCanonicalTree } from "../../canonicalDocuments/foundation/generated/instances";
import { syncedContentDigest } from "../../canonicalDocuments/foundation/syncedContent";

/** Persist source fixtures for the registered consumer tests. Lifecycle/CAS
 * behavior itself is exercised through real source endpoints in content tests. */
export async function publishedFixture(ctx: MutationCtx, user: Id<"users">, input: unknown) {
  const scope = await installation(ctx), title = "Reusable fixture";
  const blocks = validateCanonicalTree(input);
  const id = await ctx.db.insert("syncedBlocks", { ...scope, title, generation: 2, lastRevision: 1, publishedRevision: 1, createdBy: user, updatedBy: user, createdAt: 1, updatedAt: 1 });
  await ctx.db.insert("syncedBlockRevisions", { syncedBlockId: id, revision: 1, title, blocks, digest: syncedContentDigest(title, blocks), createdBy: user, createdAt: 1, publishedAt: 1 });
  return id;
}
