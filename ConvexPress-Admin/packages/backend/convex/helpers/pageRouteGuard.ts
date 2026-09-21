import type { RequestReadLedger } from "./requestReadLedger";
import { ConvexError } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { normalizePageRoute, pageRouteWarning } from './pageRoutePolicy';

export async function assertPagePathAvailable(ctx: MutationCtx, path: string, previousPath?: string, budget?: RequestReadLedger) {
  if (previousPath && normalizePageRoute(previousPath) === normalizePageRoute(path)) return;
  budget?.beforeRead();
  const setting = await ctx.db.query('settings').withIndex('by_section', q => q.eq('section', 'dashboard')).unique();
  budget?.record(setting);
  const values = setting?.values as {basePath?: unknown} | undefined;
  const warning = pageRouteWarning(path, values?.basePath);
  if (warning) throw new ConvexError({code:'RESERVED_PAGE_ROUTE',message:warning});
}

/** Validate the entire moved subtree before a hierarchy mutation writes anything. */
export async function assertPageTreePathAvailable(ctx: MutationCtx, pageId: Id<'posts'>, path: string, previousPath?: string, visited = new Set<string>()) {
  if (visited.has(pageId)) throw new ConvexError({code:'VALIDATION_ERROR',message:'Circular page hierarchy'});
  visited.add(pageId);
  await assertPagePathAvailable(ctx, path, previousPath);
  const children = await ctx.db.query('posts').withIndex('by_type_parent', q => q.eq('type', 'page').eq('parentId',pageId)).collect();
  for (const child of children) await assertPageTreePathAvailable(ctx, child._id, `${path}/${child.slug}`, child.path, visited);
}
