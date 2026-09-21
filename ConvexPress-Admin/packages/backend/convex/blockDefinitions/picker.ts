import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { canEditContent } from "../helpers/publicContent";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { authoringRevision } from "../canonicalDocuments/foundation/documentState";
import { installation } from "../syncedBlocks/model";
import { fail, readVersion, readVersionApproval } from "./model";

const scopeValidator = v.object({ websiteKey: v.string(), instanceKey: v.string() });
const baseArgs = { postId: v.id("posts"), expectedRevision: v.number(), expectedScope: scopeValidator };
type BaseArgs = { postId: Id<"posts">; expectedRevision: number; expectedScope: { websiteKey: string; instanceKey: string } };
async function authorize(ctx: QueryCtx, args: BaseArgs, budget: RequestReadLedger) {
  await requireCan(ctx, "post.update", budget);
  const scope = await installation(ctx, budget);
  if (scope.websiteKey !== args.expectedScope.websiteKey || scope.instanceKey !== args.expectedScope.instanceKey)
    return fail("DEFINITION_SCOPE", "The selected environment changed. Reopen the block picker.");
  budget.beforeRead();
  const post = budget.record(await ctx.db.get("posts", args.postId));
  if (!post || !await canEditContent(ctx, post, budget)) return fail("FORBIDDEN", "You cannot edit this document.");
  if (post.blocksVersion !== 2 || !["post", "page"].includes(post.type) || !["draft", "publish", "private", "future"].includes(post.status))
    return fail("DEFINITION_DOCUMENT", "Open a supported block document before choosing a custom block.");
  if (!Number.isSafeInteger(args.expectedRevision) || authoringRevision(post) !== args.expectedRevision)
    return fail("DEFINITION_CONFLICT", "The document changed. Reopen the block picker.");
  return scope;
}
function pageOptions(options: PaginationOptions): PaginationOptions {
  if (!Number.isInteger(options.numItems) || options.numItems < 1 || options.numItems > 8)
    return fail("DEFINITION_PAGE_SIZE", "Request between 1 and 8 custom blocks.");
  return { ...options, maximumRowsRead: 8, maximumBytesRead: 512 * 1024 };
}

/** Discovery projects approved-version metadata, never a head's latest draft
 * title or schema. Bounded head pages may be empty while more pages remain. */
export const list = query({
  args: { ...baseArgs, paginationOpts: paginationOptsValidator },
  returns: v.object({
    scope: scopeValidator, isDone: v.boolean(), continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRequired"), v.literal("SplitRecommended"), v.null())),
    page: v.array(v.object({ id: v.id("blockDefinitions"), name: v.string(), title: v.string(), version: v.number(), digest: v.string() })),
  }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), scope = await authorize(ctx, args, budget);
    budget.beforeRead();
    const result = await ctx.db.query("blockDefinitions").withIndex("by_scope_name", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin)).order("asc").paginate(pageOptions(args.paginationOpts));
    result.page.forEach(head => budget.record(head));
    const page = [];
    for (const head of result.page) {
      if (head.status !== "active" || head.activeVersion === undefined) continue;
      const { row, value } = await readVersion(ctx, head, head.activeVersion, budget);
      if ((await readVersionApproval(ctx, row, budget))?.status !== "active") continue;
      page.push({ id: head._id, name: head.name, title: value.definition.spec.title, version: row.version, digest: row.digest });
    }
    return { ...result, page, scope: { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey } };
  },
});

/** Recheck at insertion time. A new preferred version does not silently replace
 * the exact approved version the user selected. Saves independently reload it. */
export const select = query({
  args: { ...baseArgs, id: v.id("blockDefinitions"), version: v.number(), expectedDigest: v.string() },
  returns: v.object({ scope: v.object({ websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string() }), definitions: v.array(v.object({ name: v.string(), version: v.number(), digest: v.string(), definitionJson: v.string() })) }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), scope = await authorize(ctx, args, budget);
    budget.beforeRead();
    const head = budget.record(await ctx.db.get("blockDefinitions", args.id));
    if (!head || head.websiteKey !== scope.websiteKey || head.instanceKey !== scope.instanceKey || head.deploymentOrigin !== scope.deploymentOrigin || head.status === "promoted")
      return fail("DEFINITION_UNAVAILABLE", "This custom block is unavailable in the current website.");
    const { row, value } = await readVersion(ctx, head, args.version, budget);
    if (row.digest !== args.expectedDigest || (await readVersionApproval(ctx, row, budget))?.status !== "active")
      return fail("DEFINITION_UNAVAILABLE", "This custom block version is no longer approved. Refresh the picker.");
    return { scope, definitions: [{ name: head.name, version: row.version, digest: row.digest, definitionJson: value.json }] };
  },
});
