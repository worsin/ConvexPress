import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { assertPagePathAvailable } from "../helpers/pageRouteGuard";
import { canEditContent } from "../helpers/publicContent";
import { MAX_PAGE_DEPTH } from "../pages/internals";

const MAX_ROUTE_TREE = 100;
function refuse(message: string): never { throw new ConvexError({code:"DOCUMENT_ROUTE_INVALID",message}); }
export type RouteChange = {post: Doc<"posts">; path: string; depth: number};
/** Plan every affected URL before any write. No silent truncation or partial
 * hierarchy moves, and no caller-supplied parent/path authority. */
export async function planDocumentSlug(ctx: MutationCtx, post: Doc<"posts">, slug: string, budget: RequestReadLedger): Promise<RouteChange[]> {
  if (slug === post.slug) return [];
  if (slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    refuse("Use lowercase letters, numbers and hyphens for the permalink, up to 200 characters.");
  budget.beforeRead();
  const conflicts = await ctx.db.query("posts").withIndex("by_type_slug",q=>q.eq("type",post.type).eq("slug",slug)).take(2);
  for (const row of conflicts) budget.record(row);
  if (conflicts.some(row=>row._id!==post._id)) refuse("That permalink is already used. Choose another URL.");
  if (post.type === "post") return [{post,path:`/blog/${slug}`,depth:0}];
  const seen = new Set<string>([post._id]), segments = [slug];
  let parentId = post.parentId;
  while (parentId) {
    if (seen.has(parentId) || segments.length > MAX_PAGE_DEPTH) refuse("The page hierarchy needs repair before changing its URL.");
    seen.add(parentId); budget.beforeRead();
    const parent = budget.record(await ctx.db.get("posts",parentId));
    if (!parent || parent.type !== "page") refuse("The parent page is unavailable.");
    segments.unshift(parent.slug); parentId = parent.parentId;
  }
  const plan: RouteChange[] = [{post,path:`/${segments.join("/")}`,depth:segments.length-1}];
  const descendants = new Set<string>([post._id]);
  for (let index = 0; index < plan.length; index++) {
    const current = plan[index]!;
    if (current.depth > MAX_PAGE_DEPTH) refuse("The page hierarchy exceeds its supported depth.");
    await assertPagePathAvailable(ctx,current.path,current.post.path ?? `/${current.post.slug}`,budget);
    budget.beforeRead();
    const collisions = await ctx.db.query("posts").withIndex("by_path",q=>q.eq("path",current.path)).take(2);
    for (const row of collisions) budget.record(row);
    if (collisions.some(row=>row._id!==current.post._id)) refuse("A page already uses a URL in this hierarchy.");
    if (!(await canEditContent(ctx,current.post,budget))) refuse("You cannot change a page in this hierarchy.");
    budget.beforeRead();
    const children = await ctx.db.query("posts").withIndex("by_type_parent",q=>q.eq("type","page").eq("parentId",current.post._id)).take(MAX_ROUTE_TREE-plan.length+1);
    for (const child of children) {
      budget.record(child);
      if (plan.length >= MAX_ROUTE_TREE) refuse("This page hierarchy exceeds the supported atomic URL-change limit.");
      if (descendants.has(child._id)) refuse("The page hierarchy contains a cycle.");
      descendants.add(child._id); plan.push({post:child,path:`${current.path}/${child.slug}`,depth:current.depth+1});
    }
  }
  return plan;
}
