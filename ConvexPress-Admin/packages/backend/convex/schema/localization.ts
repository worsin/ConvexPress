import { defineTable } from "convex/server";
import { v } from "convex/values";
import { localeValidator } from "../localization/validators";
/** Site-owned tables. Document identities survive renames; no guessed locale prefixes. */
export const localizationTables = {
  locale_routing: defineTable({
    key: v.literal("site"), enabled: v.boolean(), locales: v.array(localeValidator),
    revision: v.number(), updatedAt: v.number(), updatedBy: v.id("users"),
  }).index("by_key", ["key"]),
  locale_translation_groups: defineTable({
    key: v.string(), revision: v.number(), updatedAt: v.number(), updatedBy: v.id("users"),
  }).index("by_key", ["key"]),
  locale_translations: defineTable({
    groupId: v.id("locale_translation_groups"), code: v.string(), documentId: v.id("posts"),
  }).index("by_group", ["groupId"]).index("by_document", ["documentId"]),
};
