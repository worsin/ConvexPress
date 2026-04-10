/**
 * WordPress Sync - Menus Import Phase
 *
 * Imports navigation menus and menu items from WordPress.
 * Note: Requires WP 5.9+ or the WP REST API Menus plugin.
 *
 * Menu items can reference:
 *   - Posts/pages (resolved via ID mapping)
 *   - Categories/tags (resolved via ID mapping)
 *   - Custom URLs
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPMenus, fetchWPMenuItems, type WPMenu, type WPMenuItem } from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { createDefaultImportConfig, FINDING_CODES } from "../validators";
import { createFinding } from "../helpers/idMapping";
import { createHash } from "crypto";

// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHash(fields: Record<string, unknown>): string {
  return createHash("md5").update(JSON.stringify(fields)).digest("hex");
}

// ─── Menus Import Action ───────────────────────────────────────────────────

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { jobId, siteId }): Promise<PhaseResult> => {
    const errors: SyncError[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Get job and site
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    // Get import config
    const importConfig = job?.importConfig ?? createDefaultImportConfig();
    const isDryRun = importConfig.behavior.dryRun;

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{ phase: "menus", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const credentials = {
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: site.applicationPassword,
    };

    const progress: PhaseProgress = { ...job.progress.menus };

    // Fetch menus from WordPress
    let menus: WPMenu[] = [];
    try {
      const result = await fetchWPMenus(credentials);
      menus = result.data;

      if (progress.total === 0) {
        progress.total = menus.length;
      }
    } catch (error) {
      // Menus endpoint might not be available
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{
          phase: "menus",
          wpId: 0,
          message: "Menus API not available (requires WP 5.9+ or REST API Menus plugin)",
          timestamp: Date.now(),
        }],
        hasMore: false,
      };
    }

    // Process each menu
    for (const wpMenu of menus) {
      try {
        // Compute source hash for change detection
        const sourceHash = computeSourceHash({
          name: wpMenu.name,
          slug: wpMenu.slug,
          description: wpMenu.description,
          locations: wpMenu.locations,
        });

        // Check if already imported (full mapping for sourceHash)
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
          { siteId, objectType: "menu", wpId: wpMenu.id }
        );

        if (existingMapping) {
          if (existingMapping.sourceHash === sourceHash) {
            skipped++;
            progress.imported++;
            continue;
          }

          if (!isDryRun) {
            await ctx.runMutation(
              internal.wordpressSync.helpers.idMapping.updateSourceHash,
              { siteId, objectType: "menu", wpId: wpMenu.id, sourceHash }
            );
          }

          if (!importConfig.behavior.updateExisting) {
            skipped++;
            progress.imported++;
            continue;
          }

          updated++;
          progress.imported++;
          continue;
        }

        // No existing mapping - check for slug collision
        const existingBySlug = await ctx.runQuery(
          internal.wordpressSync.internals.findMenuBySlug,
          { slug: wpMenu.slug }
        );

        if (existingBySlug) {
          await createFinding(ctx, {
            siteId, jobId, severity: "warning", phase: "menus",
            code: FINDING_CODES.MENU_HANDLE_COLLISION,
            message: `Menu with slug "${wpMenu.slug}" already exists locally (ID: ${existingBySlug._id})`,
            sourceType: "menu", sourceId: String(wpMenu.id),
            destinationTable: "menus", wpId: wpMenu.id,
            convexId: existingBySlug._id,
          });
          // The menusCreate mutation already handles merging by slug
        }

        if (!isDryRun) {
          // Create the menu
          const menuId = await ctx.runMutation(internal.wordpressSync.phases.menusCreate, {
            wpMenu: {
              id: wpMenu.id,
              name: wpMenu.name,
              slug: wpMenu.slug,
              description: wpMenu.description,
              locations: wpMenu.locations || [],
            },
            siteId,
          });

          // Create menu ID mapping with sourceHash
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
            siteId,
            objectType: "menu",
            wpId: wpMenu.id,
            convexId: menuId,
            sourceHash,
          });

          // Fetch and import menu items
          try {
            const { data: items } = await fetchWPMenuItems(credentials, wpMenu.id);

            // Sort by parent to ensure parents are created first
            const sorted = [...items].sort((a, b) => {
              if (a.parent === 0 && b.parent !== 0) return -1;
              if (a.parent !== 0 && b.parent === 0) return 1;
              return a.menu_order - b.menu_order;
            });

            // Import each menu item
            for (const wpItem of sorted) {
              try {
                // Resolve parent menu item
                let parentItemId: string | undefined;
                if (wpItem.parent > 0) {
                  parentItemId = await ctx.runQuery(
                    internal.wordpressSync.helpers.idMapping.getByWpId,
                    { siteId, objectType: "menuItem", wpId: wpItem.parent }
                  ) ?? undefined;
                }

                // Resolve linked object
                const linkedObject = await resolveLinkedObject(ctx, siteId, wpItem);

                // Create menu item
                const itemId = await ctx.runMutation(internal.wordpressSync.phases.menusCreateItem, {
                  wpItem: {
                    id: wpItem.id,
                    menuId,
                    parentItemId,
                    title: wpItem.title?.rendered || wpItem.attr_title || "",
                    url: wpItem.url || linkedObject.url,
                    itemType: linkedObject.itemType,
                    objectId: linkedObject.objectId,
                    target: wpItem.target === "_blank" ? "_blank" : "_self",
                    cssClasses: wpItem.classes?.join(" "),
                    position: wpItem.menu_order,
                    description: wpItem.description,
                  },
                  siteId,
                });

                // Create menu item ID mapping
                await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
                  siteId,
                  objectType: "menuItem",
                  wpId: wpItem.id,
                  convexId: itemId,
                });
              } catch (itemError) {
                errors.push({
                  phase: "menus",
                  wpId: wpItem.id,
                  message: `Menu item: ${itemError instanceof Error ? itemError.message : "Unknown error"}`,
                  timestamp: Date.now(),
                });
              }
            }

            // Update menu item count
            await ctx.runMutation(internal.wordpressSync.phases.menusUpdateCount, {
              menuId,
              count: sorted.length,
            });
          } catch (itemsError) {
            errors.push({
              phase: "menus",
              wpId: wpMenu.id,
              message: `Menu items: ${itemsError instanceof Error ? itemsError.message : "Failed to fetch"}`,
              timestamp: Date.now(),
            });
          }
        }

        created++;
        progress.imported++;
      } catch (error) {
        errors.push({
          phase: "menus",
          wpId: wpMenu.id,
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        progress.failed++;
      }
    }

    return {
      progress: {
        ...progress,
        created,
        updated,
        skipped,
        conflicted: 0,
      },
      errors,
      hasMore: false, // Menus are fetched all at once
    };
  },
});

// ─── Helper Functions ──────────────────────────────────────────────────────

interface LinkedObject {
  itemType: "page" | "post" | "category" | "tag" | "custom";
  objectId?: string;
  url?: string;
}

async function resolveLinkedObject(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  wpItem: WPMenuItem
): Promise<LinkedObject> {
  // Check the object type from WordPress
  const objectType = wpItem.object;
  const objectId = wpItem.object_id;

  if (wpItem.type === "custom") {
    return {
      itemType: "custom",
      url: wpItem.url,
    };
  }

  if (objectType === "page" && objectId) {
    const convexId = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      { siteId, objectType: "page", wpId: objectId }
    );
    return {
      itemType: "page",
      objectId: convexId ?? undefined,
      url: wpItem.url,
    };
  }

  if (objectType === "post" && objectId) {
    const convexId = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      { siteId, objectType: "post", wpId: objectId }
    );
    return {
      itemType: "post",
      objectId: convexId ?? undefined,
      url: wpItem.url,
    };
  }

  if (objectType === "category" && objectId) {
    const convexId = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      { siteId, objectType: "category", wpId: objectId }
    );
    return {
      itemType: "category",
      objectId: convexId ?? undefined,
      url: wpItem.url,
    };
  }

  if ((objectType === "tag" || objectType === "post_tag") && objectId) {
    const convexId = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      { siteId, objectType: "tag", wpId: objectId }
    );
    return {
      itemType: "tag",
      objectId: convexId ?? undefined,
      url: wpItem.url,
    };
  }

  // Default to custom link
  return {
    itemType: "custom",
    url: wpItem.url,
  };
}

// ─── Menu Creation Mutations ───────────────────────────────────────────────

export const menusCreate = internalMutation({
  args: {
    wpMenu: v.object({
      id: v.number(),
      name: v.string(),
      slug: v.string(),
      description: v.optional(v.string()),
      locations: v.array(v.string()),
    }),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { wpMenu, siteId }) => {
    const now = Date.now();

    // Check if menu with same slug exists
    const existing = await ctx.db
      .query("menus")
      .withIndex("by_slug", (q) => q.eq("slug", wpMenu.slug))
      .first();

    if (existing) {
      // Update with WP reference
      if (!existing.wpTermId) {
        await ctx.db.patch(existing._id, {
          wpTermId: wpMenu.id,
          wpSourceSiteId: siteId,
          updatedAt: now,
        });
      }
      return existing._id;
    }

    // Get first user as creator
    const firstUser = await ctx.db.query("users").first();
    const createdBy = firstUser ? (firstUser.clerkUserId ?? firstUser._id) : "wp-import";

    // Create menu
    const menuId = await ctx.db.insert("menus", {
      name: wpMenu.name,
      slug: wpMenu.slug,
      description: wpMenu.description,
      itemCount: 0,
      createdBy,
      wpTermId: wpMenu.id,
      wpSourceSiteId: siteId,
      createdAt: now,
      updatedAt: now,
    });

    return menuId;
  },
});

export const menusCreateItem = internalMutation({
  args: {
    wpItem: v.object({
      id: v.number(),
      menuId: v.string(),
      parentItemId: v.optional(v.string()),
      title: v.string(),
      url: v.optional(v.string()),
      itemType: v.union(
        v.literal("page"),
        v.literal("post"),
        v.literal("category"),
        v.literal("tag"),
        v.literal("custom")
      ),
      objectId: v.optional(v.string()),
      target: v.union(v.literal("_self"), v.literal("_blank")),
      cssClasses: v.optional(v.string()),
      position: v.number(),
      description: v.optional(v.string()),
    }),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { wpItem, siteId }) => {
    const now = Date.now();

    // Calculate depth
    let depth = 0;
    if (wpItem.parentItemId) {
      const parent = await ctx.db.get(wpItem.parentItemId as Id<"menuItems">);
      if (parent) {
        depth = (parent.depth || 0) + 1;
      }
    }

    // Create menu item
    const itemId = await ctx.db.insert("menuItems", {
      menuId: wpItem.menuId as Id<"menus">,
      itemType: wpItem.itemType,
      objectId: wpItem.objectId,
      label: wpItem.title,
      url: wpItem.url,
      parentItemId: wpItem.parentItemId ? (wpItem.parentItemId as Id<"menuItems">) : undefined,
      position: wpItem.position,
      depth,
      target: wpItem.target,
      cssClasses: wpItem.cssClasses,
      description: wpItem.description,
      wpPostId: wpItem.id,
      wpSourceSiteId: siteId,
      createdAt: now,
      updatedAt: now,
    });

    return itemId;
  },
});

export const menusUpdateCount = internalMutation({
  args: {
    menuId: v.string(),
    count: v.number(),
  },
  handler: async (ctx, { menuId, count }) => {
    await ctx.db.patch(menuId as Id<"menus">, {
      itemCount: count,
      updatedAt: Date.now(),
    });
  },
});
