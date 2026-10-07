import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { seedShop } from "../../demoSeed/shops";
import { northstarCoffee } from "../../demoSeed/catalogs/northstarCoffee";

test("repeated demo seeding updates the active template palette without recreating legacy themes", async () => {
  const appearance = { _id: "appearance", section: "appearance.template", values: { active: "journal", overrides: { page: "saved" }, variants: { "shop.catalog": "editorial" }, settings: { journal: { header: { show: false }, colors: { custom: "#abcdef" } }, depot: { colors: { primary: "#ffffff" } } } }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1 };
  const archive = { _id: "archive", sourceTable: "themes", sourceId: "old-theme", snapshot: { name: "Preserved original", isActive: true }, archivedAt: 1 };
  const ctx = commerceHarness({ settings: [appearance], legacyAppearanceArchives: [archive] });
  for (let pass = 0; pass < 2; pass++) {
    await (seedShop as any)._handler(ctx, { shop: "northstar-coffee", media: {} });
    const current = ctx.tables.settings.find((row: any) => row.section === "appearance.template");
    for (const color of northstarCoffee.palette) expect(current.values.settings.journal.colors[color.slug]).toBe(color.color);
    expect(current.values.settings.journal.colors.custom).toBe("#abcdef");
    expect(current.values.settings.journal.header).toEqual({ show: false });
    expect(current.values.settings.depot).toEqual(appearance.values.settings.depot);
    expect(current.values.variants).toEqual(appearance.values.variants);
    expect(ctx.tables.legacyAppearanceArchives).toEqual([archive]);
    expect(ctx.tables.themes ?? []).toEqual([]);
    expect(ctx.tables.layouts ?? []).toEqual([]);
  }
  expect(ctx.tables.commerce_products).toHaveLength(northstarCoffee.products.length);
  expect(ctx.tables.commerce_product_relations).toHaveLength(northstarCoffee.relations.length);
});
