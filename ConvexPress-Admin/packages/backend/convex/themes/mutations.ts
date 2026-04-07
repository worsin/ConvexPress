import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("preset"), v.literal("custom")),
    headerConfig: v.optional(v.any()),
    footerConfig: v.optional(v.any()),
    layoutAssignments: v.optional(v.any()),
    colorPalette: v.optional(v.any()),
    thumbnail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("themes", {
      ...args,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("themes"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    headerConfig: v.optional(v.any()),
    footerConfig: v.optional(v.any()),
    layoutAssignments: v.optional(v.any()),
    colorPalette: v.optional(v.any()),
    thumbnail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Theme not found");
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  },
});

export const activate = mutation({
  args: { id: v.id("themes") },
  handler: async (ctx, args) => {
    const theme = await ctx.db.get(args.id);
    if (!theme) throw new Error("Theme not found");

    // Deactivate all other themes
    const activeThemes = await ctx.db
      .query("themes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    for (const active of activeThemes) {
      await ctx.db.patch(active._id, { isActive: false });
    }

    // Activate this theme
    await ctx.db.patch(args.id, { isActive: true, updatedAt: Date.now() });

    // Apply theme configs to settings
    const now = Date.now();

    if (theme.headerConfig) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "header"))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { values: theme.headerConfig, updatedAt: now });
      } else {
        await ctx.db.insert("settings", {
          section: "header",
          values: theme.headerConfig,
          updatedAt: now,
          updatedBy: theme.createdBy || ("" as any),
        });
      }
    }

    if (theme.footerConfig) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "footer"))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { values: theme.footerConfig, updatedAt: now });
      } else {
        await ctx.db.insert("settings", {
          section: "footer",
          values: theme.footerConfig,
          updatedAt: now,
          updatedBy: theme.createdBy || ("" as any),
        });
      }
    }

    if (theme.layoutAssignments) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "layout"))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { values: theme.layoutAssignments, updatedAt: now });
      } else {
        await ctx.db.insert("settings", {
          section: "layout",
          values: theme.layoutAssignments,
          updatedAt: now,
          updatedBy: theme.createdBy || ("" as any),
        });
      }
    }

    return { activated: true, themeId: args.id };
  },
});

export const duplicate = mutation({
  args: { id: v.id("themes") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.id);
    if (!source) throw new Error("Theme not found");
    const now = Date.now();
    return await ctx.db.insert("themes", {
      name: `${source.name} (Copy)`,
      slug: `${source.slug}-copy-${now}`,
      description: source.description,
      type: "custom",
      headerConfig: source.headerConfig,
      footerConfig: source.footerConfig,
      layoutAssignments: source.layoutAssignments,
      colorPalette: source.colorPalette,
      thumbnail: source.thumbnail,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("themes") },
  handler: async (ctx, args) => {
    const theme = await ctx.db.get(args.id);
    if (!theme) throw new Error("Theme not found");
    if (theme.isActive) throw new Error("Cannot delete the active theme");
    if (theme.type === "preset") throw new Error("Cannot delete preset themes");
    await ctx.db.delete(args.id);
  },
});
