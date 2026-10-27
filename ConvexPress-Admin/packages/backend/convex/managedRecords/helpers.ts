/**
 * Managed records: a site's own code keeps some records in shape (the signup
 * form whose answers it parses, the plans it sells). Admin mutations refuse to
 * change them, with a message saying who manages them and where they are
 * changed instead; the site's code writes them through internal functions.
 *
 * A whole area can be managed too: `area` records are keyed by MANAGED_AREAS.
 * `subscriberBilling` hands what staff do to subscribers' billing (cancel,
 * pause, resume, refund, retry, change plan, grant or revoke access, apply a
 * coupon) to another system; subscribers' own self-service is unaffected.
 * `supportDesk` hands answering tickets (replies, notes, status, priority,
 * assignment, tags, saved replies, ticket settings) to another system, which
 * works them through tickets/operator.ts; customers' own tickets are unaffected.
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

export const MANAGED_AREAS = { subscriberBilling: "subscriberBilling", supportDesk: "supportDesk" } as const;
export type ManagedArea = keyof typeof MANAGED_AREAS;

/** Refuse an admin edit of a managed record; `what` names it ("This form", "This offer"). */
export async function assertNotManaged(ctx: ReadCtx, tableName: ManagedTable, recordId: string, what: string): Promise<void> {
  const managed = await managedRecord(ctx, tableName, recordId);
  if (!managed) return;
  throw new ConvexError({
    code: "MANAGED_RECORD",
    message: `${what} is managed by ${managed.system}, so it can't be changed here. ${managed.note}`.trim(),
  });
}

/** Refuse an admin action in a managed area; `what` names the area ("Subscriber billing"). */
export async function assertAreaNotManaged(ctx: ReadCtx, area: ManagedArea, what: string): Promise<void> {
  await assertNotManaged(ctx, "area", MANAGED_AREAS[area], what);
}

/** Refuse a staff ticket action here when another system answers tickets. */
export async function assertSupportDeskHere(ctx: ReadCtx): Promise<void> {
  await assertAreaNotManaged(ctx, "supportDesk", "The support desk");
}
