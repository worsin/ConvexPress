import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";

/** Review and writing must agree on whether a document's block owns a form. */
export async function contactWriteRequirement(
  ctx: Pick<QueryCtx, "db">,
  postId: Id<"posts"> | null,
  blockId: string,
  budget: RequestReadLedger,
) {
  let existing: Doc<"forms"> | null = null;
  if (postId) {
    budget.beforeRead();
    existing = budget.record(await ctx.db.query("forms")
      .withIndex("by_contact_source", q => q.eq("contactPostId", postId).eq("contactBlockId", blockId)).unique());
  }
  return { existing, capability: existing ? "form.update" as const : "form.create" as const };
}
