import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { managedTableValidator } from "../schema/managedRecords";
import { managedRecord } from "./helpers";

/** A site's code marks one of its records managed (or updates the note). */
export const setManaged = internalMutation({
  args: { tableName: managedTableValidator, recordId: v.string(), system: v.string(), note: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await managedRecord(ctx, args.tableName, args.recordId);
    const now = Date.now();
    if (existing) {
      if (existing.system === args.system && existing.note === args.note) return { changed: false };
      await ctx.db.patch("managedRecords", existing._id, { system: args.system, note: args.note, updatedAt: now });
      return { changed: true };
    }
    await ctx.db.insert("managedRecords", { ...args, createdAt: now, updatedAt: now });
    return { changed: true };
  },
});

/** Hand a record back to the admins. */
export const clearManaged = internalMutation({
  args: { tableName: managedTableValidator, recordId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await managedRecord(ctx, args.tableName, args.recordId);
    if (!existing) return { changed: false };
    await ctx.db.delete("managedRecords", existing._id);
    return { changed: true };
  },
});
