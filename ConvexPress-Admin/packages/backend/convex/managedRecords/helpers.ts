/**
 * Managed records: a site's own code keeps some records in shape (the signup
 * form whose answers it parses, the plans it sells). Admin mutations refuse to
 * change them, with a message saying who manages them and where they are
 * changed instead; the site's code writes them through internal functions.
 */
import { ConvexError, type Infer } from "convex/values";

import type { QueryCtx } from "../_generated/server";
import type { managedTableValidator } from "../schema/managedRecords";

export type ManagedTable = Infer<typeof managedTableValidator>;
type ReadCtx = Pick<QueryCtx, "db">;

export async function managedRecord(ctx: ReadCtx, tableName: ManagedTable, recordId: string) {
  return await ctx.db
    .query("managedRecords")
    .withIndex("by_record", (q) => q.eq("tableName", tableName).eq("recordId", recordId))
    .unique();
}

/** Refuse an admin edit of a managed record; `what` names it ("This form", "This offer"). */
export async function assertNotManaged(ctx: ReadCtx, tableName: ManagedTable, recordId: string, what: string): Promise<void> {
  const managed = await managedRecord(ctx, tableName, recordId);
  if (!managed) return;
  throw new ConvexError({
    code: "MANAGED_RECORD",
    message: `${what} is managed by ${managed.system}, so it can't be changed here. ${managed.note}`.trim(),
  });
}
