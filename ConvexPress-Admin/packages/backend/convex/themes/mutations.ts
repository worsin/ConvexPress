/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../helpers/auth";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    description: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    type: v.union(v.literal("preset"), v.literal("custom")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    headerConfig: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    footerConfig: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    layoutAssignments: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    colorPalette: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    thumbnail: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("themes"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    name: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    slug: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    description: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    headerConfig: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    footerConfig: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    layoutAssignments: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    colorPalette: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    thumbnail: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Theme not found");
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const activate = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("themes") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const theme = await ctx.db.get(args.id);
    if (!theme) throw new Error("Theme not found");

    // Deactivate all other themes
    const activeThemes = await ctx.db
      .query("themes")
      .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", true))
      .collect();
    for (const active of activeThemes) {
      await ctx.db.patch(active._id, { isActive: false });
    }

    // Activate this theme
    await ctx.db.patch(args.id, { isActive: true, updatedAt: Date.now() });

    // Apply theme configs to settings
    const now = Date.now();

    const upsertSettings = async (section: string, values: unknown) => {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", section as any))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { values, updatedAt: now, updatedBy: user._id });
      } else {
        await ctx.db.insert("settings", {
          section: section as any,
          values,
          updatedAt: now,
          updatedBy: user._id,
        });
      }
    };

    if (theme.headerConfig) await upsertSettings("header", theme.headerConfig);
    if (theme.footerConfig) await upsertSettings("footer", theme.footerConfig);
    if (theme.layoutAssignments) await upsertSettings("layout", theme.layoutAssignments);

    return { activated: true, themeId: args.id };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const duplicate = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("themes") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("themes") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const theme = await ctx.db.get(args.id);
    if (!theme) throw new Error("Theme not found");
    if (theme.isActive) throw new Error("Cannot delete the active theme");
    if (theme.type === "preset") throw new Error("Cannot delete preset themes");
    await ctx.db.delete(args.id);
  },
});
