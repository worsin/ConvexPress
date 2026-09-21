import { adjustTermCount, termCountEligible } from "./termCounts";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { RequestReadLedger } from "./requestReadLedger";
import { ConvexError } from "convex/values";
type Context = Pick<MutationCtx, "db">;
type Post = Record<string, unknown>;
type Relationship = Pick<Doc<"termRelationships">, "postId" | "termId" | "order">;
export const POST_DISCOVERY_TERM_LIMIT = 256;
export const POST_DISCOVERY_FIELDS = ["type", "status", "visibility", "publishedAt", "authorId"] as const;

export function postDiscoveryCoordinates(post: Post | null) {
  const eligible = !!post && post.type === "post" && post.status === "publish" && post.visibility === "public" &&
    typeof post.publishedAt === "number" && Number.isSafeInteger(post.publishedAt) && post.publishedAt >= 0;
  return {
    discoveryReady: true,
    discoveryEligible: eligible,
    discoveryPublishedAt: eligible ? post!.publishedAt as number : undefined,
    discoveryAuthorId: typeof post?.authorId === "string" ? post.authorId as Id<"users"> : undefined,
  };
}
/** Every normal relationship insert derives coordinates from the current source transaction. */
export async function insertTermRelationship(ctx: Context, value: Relationship, ledger?: RequestReadLedger): Promise<Id<"termRelationships">> {
  ledger?.beforeRead();
  const post = await ctx.db.get("posts", value.postId); ledger?.record(post);
  if (!post) throw new ConvexError({ code: "POST_NOT_FOUND", message: "Cannot assign a term to a missing post." });
  ledger?.beforeRead();
  const existing = await ctx.db.query("termRelationships").withIndex("by_post_term", q => q.eq("postId", value.postId).eq("termId", value.termId)).first();
  ledger?.record(existing);
  if (existing) return existing._id;
  ledger?.beforeRead(); const term = await ctx.db.get("terms", value.termId); ledger?.record(term);
  if (!term) throw new ConvexError({ code: "TERM_NOT_FOUND", message: "Cannot assign a missing term." });
  const id = await ctx.db.insert("termRelationships", { ...value, ...postDiscoveryCoordinates(post) });
  await adjustTermCount(ctx, value.termId, termCountEligible(post) ? 1 : 0, ledger);
  return id;
}
/** Patch/replace/import boundaries call this after writing source relationship fields. */
export async function refreshTermDiscovery(ctx: Context, id: Id<"termRelationships">, ledger?: RequestReadLedger, previous?: Relationship | null): Promise<void> {
  ledger?.beforeRead(); const relation = await ctx.db.get("termRelationships", id); ledger?.record(relation);
  if (!relation) return;
  ledger?.beforeRead(); const post = await ctx.db.get("posts", relation.postId); ledger?.record(post);
  await ctx.db.patch("termRelationships", id, postDiscoveryCoordinates(post));
  for (const termId of new Set([relation.termId, ...(previous ? [previous.termId] : [])]))
    await adjustTermCount(ctx, termId, null, ledger);
}
/** Publishing/visibility/author/date changes and rollback update all coordinates atomically. */
export async function syncPostDiscovery(ctx: Context, postId: Id<"posts">, post: Post | null, ledger?: RequestReadLedger, previous?: Post | null): Promise<void> {
  ledger?.beforeRead();
  const relations = await ctx.db.query("termRelationships").withIndex("by_post", q => q.eq("postId", postId)).take(POST_DISCOVERY_TERM_LIMIT + 1);
  if (relations.length > POST_DISCOVERY_TERM_LIMIT) throw new ConvexError({ code: "POST_TERM_LIMIT", message: "A post supports up to 256 taxonomy assignments. Reduce assignments before changing publication." });
  const delta = previous === undefined ? null : Number(termCountEligible(post)) - Number(termCountEligible(previous));
  for (const termId of new Set(relations.map(relation => relation.termId)))
    await adjustTermCount(ctx, termId, delta, ledger);
  for (const relation of relations) {
    ledger?.record(relation);
    const fields = postDiscoveryCoordinates(post);
    if (Object.entries(fields).some(([key, value]) => relation[key as keyof typeof relation] !== value))
      await ctx.db.patch("termRelationships", relation._id, fields);
  }
}

/** The last relationship owns the contribution; legacy duplicates never decrement twice. */
export async function deleteTermRelationship(ctx: Context, id: Id<"termRelationships">, ledger?: RequestReadLedger): Promise<void> {
  ledger?.beforeRead(); const relation = await ctx.db.get("termRelationships", id); ledger?.record(relation);
  if (!relation) return;
  await ctx.db.delete("termRelationships", id);
  ledger?.beforeRead(); const remaining = await ctx.db.query("termRelationships")
    .withIndex("by_post_term", q => q.eq("postId", relation.postId).eq("termId", relation.termId)).first();
  ledger?.record(remaining);
  if (remaining) return;
  ledger?.beforeRead(); const post = await ctx.db.get("posts", relation.postId); ledger?.record(post);
  await adjustTermCount(ctx, relation.termId, termCountEligible(post) ? -1 : 0, ledger);
}
