/**
 * Dev-only purge utility — DELETE BEFORE PROD.
 * Wipes all demo content + commerce + media. Preserves users, roles, settings,
 * capabilities, plugins, auth, audit logs.
 *
 * Built for the AlaskaWoods customer demo on 2026-04-27 — clears the
 * Hearth & Sage seed so the live import shows only the customer's data.
 */
import { internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";

function assertDevInternalsEnabled() {
  if (process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS !== "true") {
    throw new ConvexError({
      code: "DEV_INTERNALS_DISABLED",
      message:
        "Dev-only Convex internals are disabled. Set CONVEXPRESS_ENABLE_DEV_INTERNALS=true in a local/dev deployment to use this helper.",
    });
  }
}

async function wipeTable(ctx: any, table: string): Promise<number> {
  let n = 0;
  while (true) {
    const batch = await ctx.db.query(table).take(500);
    if (batch.length === 0) break;
    for (const row of batch) await ctx.db.delete(row._id);
    n += batch.length;
    if (batch.length < 500) break;
  }
  return n;
}

async function wipeStorageRows(
  ctx: any,
  table: string,
  storageIdField: string,
): Promise<number> {
  let n = 0;
  while (true) {
    const batch = await ctx.db.query(table).take(200);
    if (batch.length === 0) break;
    for (const row of batch) {
      const sid = (row as any)[storageIdField];
      if (sid) {
        try {
          await ctx.storage.delete(sid);
        } catch {}
      }
      await ctx.db.delete(row._id);
    }
    n += batch.length;
    if (batch.length < 200) break;
  }
  return n;
}

export const purgeAllContent = internalMutation({
  args: { confirm: v.literal("YES_PURGE_ALL_CONTENT") },
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const out: Record<string, number> = {};

    // Posts (includes pages — unified table) + meta + revisions
    out.postMeta = await wipeTable(ctx, "postMeta");
    try {
      out.revisions = await wipeTable(ctx, "revisions");
    } catch {}
    out.posts = await wipeTable(ctx, "posts");

    // Taxonomies
    out.termRelationships = await wipeTable(ctx, "termRelationships");
    out.terms = await wipeTable(ctx, "terms");

    // Comments
    try {
      out.comments = await wipeTable(ctx, "comments");
    } catch {}

    // Recipes
    try {
      out.recipes = await wipeTable(ctx, "recipes");
      out.recipe_categories = await wipeTable(ctx, "recipe_categories");
    } catch {}

    // Commerce
    try {
      out.commerce_product_variants = await wipeTable(
        ctx,
        "commerce_product_variants",
      );
      out.commerce_products = await wipeTable(ctx, "commerce_products");
      out.commerce_product_categories = await wipeTable(
        ctx,
        "commerce_product_categories",
      );
      out.commerce_carts = await wipeTable(ctx, "commerce_carts");
      out.commerce_cart_items = await wipeTable(ctx, "commerce_cart_items");
      out.commerce_checkout_sessions = await wipeTable(
        ctx,
        "commerce_checkout_sessions",
      );
      out.commerce_orders = await wipeTable(ctx, "commerce_orders");
      out.commerce_order_items = await wipeTable(ctx, "commerce_order_items");
      out.commerce_order_history = await wipeTable(
        ctx,
        "commerce_order_history",
      );
      out.commerce_customer_profiles = await wipeTable(
        ctx,
        "commerce_customer_profiles",
      );
      out.commerce_customer_addresses = await wipeTable(
        ctx,
        "commerce_customer_addresses",
      );
      out.commerce_discount_codes = await wipeTable(
        ctx,
        "commerce_discount_codes",
      );
      out.commerce_inventory_adjustments = await wipeTable(
        ctx,
        "commerce_inventory_adjustments",
      );
      out.commerce_payment_transactions = await wipeTable(
        ctx,
        "commerce_payment_transactions",
      );
      out.commerce_shipments = await wipeTable(ctx, "commerce_shipments");
    } catch {}

    // Media — also delete the blob in storage
    out.mediaSizes = await wipeStorageRows(ctx, "mediaSizes", "storageId");
    out.mediaMeta = await wipeTable(ctx, "mediaMeta");
    out.media = await wipeStorageRows(ctx, "media", "storageId");

    return out;
  },
});

// Just wipe the WordPress sync state so we can do a clean re-import without
// nuking content. Useful between test runs.
export const purgeWordPressSyncState = internalMutation({
  args: { confirm: v.literal("YES_PURGE_SYNC") },
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const out: Record<string, number> = {};
    const tables = [
      "wordpressSyncFindings",
      "wordpressSyncReconciliationFindings",
      "wordpressSyncReports",
      "wordpressSyncMappings",
      "wordpressSyncJobs",
      "wordpressSites",
    ];
    for (const t of tables) {
      try {
        out[t] = await wipeTable(ctx, t);
      } catch (err) {
        out[t] = -1;
      }
    }
    return out;
  },
});
