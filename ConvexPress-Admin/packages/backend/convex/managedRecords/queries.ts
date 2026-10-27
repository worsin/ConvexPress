import { ConvexError, v } from "convex/values";

import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { managedTableValidator } from "../schema/managedRecords";
import { managedRecord } from "./helpers";

/** Who manages a record and where it's changed instead, for the admin's editors; null when it isn't managed. */
export const forRecord = query({
  args: { tableName: managedTableValidator, recordId: v.string() },
  returns: v.union(v.null(), v.object({ system: v.string(), note: v.string() })),
  handler: async (ctx, args) => {
    if (!(await getCurrentUser(ctx))) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to continue." });
    const managed = await managedRecord(ctx, args.tableName, args.recordId);
    return managed ? { system: managed.system, note: managed.note } : null;
  },
});
