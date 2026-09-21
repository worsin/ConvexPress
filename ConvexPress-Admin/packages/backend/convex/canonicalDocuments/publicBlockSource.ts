import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { readPublicContent } from "../helpers/publicContent";
import { getCurrentUser } from "../helpers/permissions";
import { isPluginEnabled } from "../helpers/plugins";
import { timingSafeEquals } from "../helpers/timingSafe";
import type { RuntimeCanonicalTree } from "./foundation/composedRegistry";
import { readPublishedBlockPath, permitsPublishedBlockPath } from "./publishedBlockPath";

export interface PublicBlockSource {
  node: RuntimeCanonicalTree[number];
  userId: Id<"users"> | null;
}

/** Public read/write authority always comes from the current persisted page,
 * including parent visibility, route membership and time-based access. */
export async function readPublicBlockSource(ctx: QueryCtx, args: {
  postId: Id<"posts">; blockId: string; blockName: string; plugin: string; password?: string;
}, budget = new RequestReadLedger()): Promise<PublicBlockSource | null> {
  if (!args.blockId || args.blockId.length > 128 || (args.password?.length ?? 0) > 1024) return null;
  if (!(await isPluginEnabled(ctx, args.plugin, budget))) return null;
  budget.beforeRead(); const post = budget.record(await ctx.db.get("posts", args.postId));
  if (!post || post.status !== "publish" || post.blocksVersion !== 2) return null;
  const path = post.type === "page" ? post.path ?? `/${post.slug}` : `/blog/${post.slug}`;
  const passwordVerified = post.visibility === "password" && typeof args.password === "string" && !!post.password && timingSafeEquals(post.password, args.password);
  const permitted = await readPublicContent(ctx, post, { path, passwordVerified }, budget);
  if (!permitted || permitted.isMembershipRestricted || (permitted.isPasswordProtected && !permitted.passwordVerified)) return null;
  budget.beforeRead();
  const setting = budget.record(await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "blocks")).unique());
  const disabled = (setting?.values as { disabledBlockNames?: unknown } | undefined)?.disabledBlockNames;
  if (disabled !== undefined && (!Array.isArray(disabled) || disabled.some(name => typeof name !== "string"))) return null;
  const denied = new Set<string>(Array.isArray(disabled) ? disabled : []);
  const user = await getCurrentUser(ctx, budget), signedIn = !!user && user.status === "active";
  const source = await readPublishedBlockPath(ctx, post.blocks, args.blockId, budget, post.composedDefinitions);
  if (!source || !await permitsPublishedBlockPath(ctx, source, denied, signedIn, budget)) return null;
  const node = source.path[source.path.length - 1]!.node;
  return node?.name === args.blockName ? { node, userId: signedIn ? user._id : null } : null;
}
