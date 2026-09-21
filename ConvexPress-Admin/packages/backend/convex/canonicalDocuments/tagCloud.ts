/** Topic discovery proves current access; cached term counts are never authority. */
import { streamQuery, type IndexKey } from "convex-helpers/server/pagination";
import { z } from "zod";
import { sha256Hex } from "@convexpress/site-contract";
import schema from "../schema";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { evaluateMembershipAccess } from "../membership/access";
import { canDiscoverContent } from "../helpers/publicContent";
import { SourceByteLedger, SOURCE_LIMITS } from "./sourceBudget";
import { CanonicalDataError, stableKey, type DataScope } from "./foundation/contracts";
import { tagCloudArgsSchema, tagCloudResultSchema, type TagCloudResult } from "./foundation/tagCloudContracts";

const cursorSchema = z.strictObject({ version: z.literal(1), binding: z.string().regex(/^[a-f0-9]{64}$/u),
  termId: z.string().min(1).max(256), relationshipId: z.string().min(1).max(256).nullable(), complete: z.boolean(),
}).refine(value => !value.complete || value.relationshipId === null);
const MAX_CANDIDATES = 96;
export async function readTagCloud(ctx: QueryCtx, rawArgs: unknown, scope: DataScope, documentId: string,
  budget = new RequestReadLedger(), sources = new SourceByteLedger()): Promise<TagCloudResult> {
  const args = tagCloudArgsSchema.parse(rawArgs);
  const binding = sha256Hex(stableKey({ scope, documentId, max: args.max }));
  const cursor = args.cursor === null ? null : cursorSchema.parse(JSON.parse(args.cursor));
  if (cursor && cursor.binding !== binding) throw new CanonicalDataError("TAG_CURSOR_SCOPE", "cursor", "Topic cursor belongs to another document, limit or environment");
  const invalid = (): never => { throw new CanonicalDataError("TAG_CURSOR_CHANGED", "cursor", "Topic cursor coordinates are no longer available; return to the first topics"); };
  const restart = () => tagCloudResultSchema.parse({items:[],cursor:args.cursor,nextCursor:null,resetRequired:true});
  let startTerm: Doc<"terms"> | null = null, startRelationship: Doc<"termRelationships"> | null = null;
  if (cursor) {
    const id = ctx.db.normalizeId("terms", cursor.termId); if (!id) invalid();
    budget.beforeRead(); startTerm = budget.record(await ctx.db.get("terms", id!));
    if (!startTerm) return restart();
    if (startTerm.taxonomy !== "post_tag") invalid();
    if (cursor.relationshipId) {
      const id = ctx.db.normalizeId("termRelationships", cursor.relationshipId); if (!id) invalid();
      budget.beforeRead(); startRelationship = budget.record(await ctx.db.get("termRelationships", id!));
      if (!startRelationship) return restart();
      if (startRelationship.termId !== startTerm!._id) invalid();
    }
  }
  const termKey = (term: Doc<"terms">): IndexKey => ["post_tag", term.name, term._creationTime, term._id];
  const terms = streamQuery(ctx, { schema, table: "terms", index: "by_taxonomy_name", order: "asc",
    startIndexKey: startTerm ? termKey(startTerm) : ["post_tag"], startInclusive: cursor ? !cursor.complete : true,
    endIndexKey: ["post_tag"], endInclusive: true });
  let position: z.infer<typeof cursorSchema> | null = null, scanned = 0, more = false;
  const items: TagCloudResult["items"] = [];
  const exhausted = () => scanned >= MAX_CANDIDATES || budget.queries >= budget.limits.queries - 40 ||
    sources.usedBytes > SOURCE_LIMITS.total - SOURCE_LIMITS.post || budget.bytes > budget.limits.bytes - SOURCE_LIMITS.post;
  const checkpoint = () => {
    if (!position) throw new CanonicalDataError("TAG_READ_BUDGET", "sources", "Not enough document budget to advance topic discovery");
    more = true;
  };
  try {
    outer: while (true) {
      if (exhausted()) { checkpoint(); break; }
      budget.beforeRead(); const next = await terms.next();
      if (next.done) break;
      const term = budget.record(next.value[0]);
      if (items.length >= args.max) { more = true; break; }
      scanned++;
      position = { version: 1, binding, termId: term._id, relationshipId: null, complete: false };
      const href = `/tag/${encodeURIComponent(term.slug)}`;
      if (!(await evaluateMembershipAccess(ctx, { resourceType: "route", resourceIdOrKey: href }, budget)).allowed) {
        position.complete = true; continue;
      }
      const resume = startTerm?._id === term._id ? startRelationship : null;
      if (resume) position.relationshipId = resume._id;
      const relationships = streamQuery(ctx, { schema, table: "termRelationships", index: "by_term", order: "asc",
        startIndexKey: resume ? [term._id, resume._creationTime, resume._id] : [term._id], startInclusive: !resume,
        endIndexKey: [term._id], endInclusive: true });
      try {
        while (true) {
          if (exhausted()) { checkpoint(); break outer; }
          budget.beforeRead(); const next = await relationships.next();
          if (next.done) break;
          const relation = budget.record(next.value[0]); scanned++;
          sources.beforeRead(); budget.beforeRead();
          const post = budget.record(await ctx.db.get("posts", relation.postId));
          if (post) sources.record("post", post);
          position.relationshipId = relation._id;
          if (!post || post.type !== "post" || post.status !== "publish" || post.visibility !== "public" ||
            typeof post.publishedAt !== "number" || post.publishedAt > Date.now() || !(await canDiscoverContent(ctx, post, budget))) continue;
          items.push({ id: term._id, name: term.name, href });
          break;
        }
      } finally { await relationships.return(undefined); }
      position.complete = true; position.relationshipId = null;
    }
  } finally { await terms.return(undefined); }
  return tagCloudResultSchema.parse({ items, cursor: args.cursor, nextCursor: more && position ? JSON.stringify(position) : null });
}
