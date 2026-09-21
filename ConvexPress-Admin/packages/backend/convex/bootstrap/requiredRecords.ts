import type { RegisteredMutation } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { DEFAULT_TEMPLATES } from "../emails/templateDefaults";

/** Installation data only. Never migrate existing records, emit events, or queue mail. */
export const ensure: RegisteredMutation<"internal", {}, { templatesCreated: number; templatesExisting: number; categoryCreated: boolean }> = internalMutation({
  args: {},
  returns: v.object({
    templatesCreated: v.number(),
    templatesExisting: v.number(),
    categoryCreated: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let templatesCreated = 0;
    let templatesExisting = 0;
    for (const def of DEFAULT_TEMPLATES) {
      const existing = await ctx.db
        .query("emailTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", def.slug))
        .unique();
      if (existing) {
        templatesExisting++;
        continue;
      }
      await ctx.db.insert("emailTemplates", {
        slug: def.slug,
        name: def.name,
        description: def.description,
        subjectTemplate: def.subjectTemplate,
        bodyHtml: def.bodyHtml,
        preheaderText: def.preheaderText,
        availableVariables: def.availableVariables,
        priority: def.priority,
        recipientType: def.recipientType,
        isActive: true,
        eventCode: def.eventCode,
        isCustomized: false,
        defaultSubjectTemplate: def.subjectTemplate,
        defaultBodyHtml: def.bodyHtml,
        category: def.category,
        totalSent: 0,
        createdAt: now,
        updatedAt: now,
      });
      templatesCreated++;
    }

    // A pre-existing category inventory reflects operator choices. Only a fresh
    // inventory gets the conventional default; never mark a custom term as default.
    const existingCategory = await ctx.db
      .query("terms")
      .withIndex("by_taxonomy", (q) => q.eq("taxonomy", "category"))
      .first();
    const categoryCreated = !existingCategory;
    if (categoryCreated) {
      await ctx.db.insert("terms", {
        name: "Uncategorized",
        slug: "uncategorized",
        taxonomy: "category",
        description: "Default category",
        count: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { templatesCreated, templatesExisting, categoryCreated };
  },
});
