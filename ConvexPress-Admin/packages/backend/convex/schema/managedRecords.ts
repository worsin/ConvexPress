import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Kinds of record a site's own code can manage: forms, field groups,
 * subscription offers and templates, or a whole `area` of the admin, keyed by
 * name (MANAGED_AREAS in managedRecords/helpers.ts).
 */
export const managedTableValidator = v.union(
  v.literal("form"),
  v.literal("fieldGroup"),
  v.literal("subscriptionOffer"),
  v.literal("subscriptionTemplate"),
  v.literal("area"),
);

/**
 * Records a site's own code keeps in shape: a signup form whose answers it
 * parses, the plans it sells. Admins see them read-only, with a note saying
 * where they are changed instead (managedRecords/helpers.ts).
 */
export const managedRecordTables = {
  managedRecords: defineTable({
    tableName: managedTableValidator,
    recordId: v.string(),
    /** Who manages the record, e.g. "CaseMedix". */
    system: v.string(),
    /** Where it is changed instead, shown to admins. */
    note: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_record", ["tableName", "recordId"]),
};
