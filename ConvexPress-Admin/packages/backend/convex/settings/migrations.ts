import { v, ConvexError, convexToJson, getDocumentSize } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { persistLegacyAppearance } from "./appearanceMigration";
import { deleteWithMediaReferences, insertWithMediaReferences } from "../media/attachmentGuard";

/** Per-site, idempotent persistence of the compatibility projection. Source rows remain for rollback. */
export const migrateLegacyAppearance = mutation({
  args: {},
  returns: v.object({ migrated: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireCan(ctx, "manage_options");
    return { migrated: await persistLegacyAppearance(ctx, user._id) };
  },
});

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}
const snapshotKey = (value: any) => JSON.stringify(ordered(convexToJson(value)));

/** Operator-only recovery/export. Archives are not active template settings. */
export const listArchivedAppearance = query({
  args: { table: v.union(v.literal("themes"), v.literal("layouts")), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ page: v.array(v.any()), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { table, cursor }) => {
    await requireCan(ctx, "manage_options");
    const result = await ctx.db.query("legacyAppearanceArchives").withIndex("by_source", q => q.eq("sourceTable", table)).paginate({ cursor, numItems: 4 });
    return { page: result.page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

/** Transitional retirement boundary. Archive + deletion are one transaction.
 * Repeat until done for BOTH tables; a partial batch never certifies the corpus. */
export const archiveLegacyAppearanceBatch = mutation({
  args: { table: v.union(v.literal("themes"), v.literal("layouts")) },
  returns: v.object({ table: v.union(v.literal("themes"), v.literal("layouts")), archived: v.number(), done: v.boolean() }),
  handler: async (ctx, { table }) => {
    const user = await requireCan(ctx, "manage_options");
    // Four near-limit originals plus existing archives remain within read limits.
    const rows = await ctx.db.query(table).take(4);
    if (!rows.length) return { table, archived: 0, done: true };
    const prepared = [];
    for (const row of rows) {
      const value = { sourceTable: table, sourceId: String(row._id), snapshot: row, archivedAt: Date.now() };
      if (getDocumentSize(value) > 960 * 1024) throw new ConvexError({ code: "APPEARANCE_ARCHIVE_TOO_LARGE", message: "Legacy appearance record exceeds the archive budget. Preserve it with a full export and resolve its size before retirement.", sourceId: String(row._id) });
      const existing = await ctx.db.query("legacyAppearanceArchives").withIndex("by_source", q => q.eq("sourceTable", table).eq("sourceId", String(row._id))).unique();
      if (existing && snapshotKey(existing.snapshot) !== snapshotKey(row)) throw new ConvexError({ code: "APPEARANCE_ARCHIVE_CONFLICT", message: "The saved archive differs from the current legacy record. Resolve the conflict before retirement.", sourceId: String(row._id) });
      prepared.push({ row, value, existing });
    }
    // Commit active palette/chrome before removing their source. Version2 is a no-op.
    await persistLegacyAppearance(ctx, user._id);
    for (const { row, value, existing } of prepared) {
      if (!existing) await insertWithMediaReferences(ctx, "legacyAppearanceArchives", value);
      if (table === "themes") await deleteWithMediaReferences(ctx, "themes", row._id as any);
      else await deleteWithMediaReferences(ctx, "layouts", row._id as any);
    }
    return { table, archived: rows.length, done: (await ctx.db.query(table).take(1)).length === 0 };
  },
});
