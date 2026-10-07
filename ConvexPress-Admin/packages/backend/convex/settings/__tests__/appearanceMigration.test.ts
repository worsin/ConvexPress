import { describe, expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { projectLegacyAppearance } from "../appearanceMigration";
import { migrateLegacyAppearance } from "../migrations";
import { updateSection, importAll } from "../mutations";
import { getBySection, getPublic } from "../queries";
const legacy = () => commerceHarness({ settings: [{ _id: "layout", section: "commerce.layout", values: { shopLayout: "marketplace", productLayout: "split", cartPanel: "drawer", gridDensity: "dense" } }] });

describe("legacy appearance migration", () => {
  test("authenticated settings project retained shop configuration without a legacy theme", async () => {
    const ctx = legacy();
    const result = await (getBySection as any)._handler(ctx, { section: "appearance.template" });
    expect(result.variants["shop.catalog"]).toBe("marketplace");
    expect(result.settings.core.shop.gridDensity).toBe("dense");
    expect(result.settings.core.colors).toBeUndefined();
    expect(ctx.tables.settings).toHaveLength(1);
  });
  test("existing variants and other pack modules survive projection", async () => {
    const ctx = legacy();
    ctx.tables.settings.push({ _id: "template", section: "appearance.template", values: { active: "paper", variants: { "shop.catalog": "boutique" }, settings: { paper: { shop: { cartPanel: "persistent" }, colors: { primary: "#654321" } }, core: { header: { sticky: false } } } } });
    const result = await (getBySection as any)._handler(ctx, { section: "appearance.template" });
    expect(result.settings.paper.shop.catalogVariant).toBe("boutique");
    expect(result.settings.paper.shop.cartPanel).toBe("persistent");
    expect(result.settings.paper.colors.primary).toBe("#654321");
    expect(result.settings.core.header.sticky).toBe(false);
  });
  test("public and authenticated projections agree", async () => {
    const ctx = legacy();
    const result = await (getPublic as any)._handler(ctx, {});
    expect(result.templateConfig.variants["shop.product"]).toBe("split");
    expect(result.layoutConfig.gridDensity).toBe("dense");
  });
});

test("migration refuses anonymous callers without writes", async () => {
  const ctx = commerceHarness({}, null);
  await expect((migrateLegacyAppearance as any)._handler(ctx, {})).rejects.toBeDefined();
  expect(ctx.tables.settings).toHaveLength(1);
});
test("migration persists exactly once and preserves source rows", async () => {
  const ctx = legacy();
  const before = await (getBySection as any)._handler(ctx, { section: "appearance.template" });
  expect(await (migrateLegacyAppearance as any)._handler(ctx, {})).toEqual({ migrated: true });
  const row = ctx.tables.settings.find((row: any) => row.section === "appearance.template");
  expect(row.values.settings).toEqual(before.settings);
  expect(row.legacyAppearanceMigration.version).toBe(2);
  const snapshot = JSON.stringify(ctx.tables);
  expect(await (migrateLegacyAppearance as any)._handler(ctx, {})).toEqual({ migrated: false });
  expect(JSON.stringify(ctx.tables)).toBe(snapshot);
  expect(ctx.tables.settings.find((row: any) => row.section === "commerce.layout").values.gridDensity).toBe("dense");
});
test("first explicit update preserves migrated packs and reset never resurrects legacy", async () => {
  const ctx = legacy();
  await (updateSection as any)._handler(ctx, { section: "appearance.template", values: { active: "paper" } });
  let row = ctx.tables.settings.find((row: any) => row.section === "appearance.template");
  expect(row.values.settings.core.shop.gridDensity).toBe("dense");
  expect(row.values.active).toBe("paper");
  await (updateSection as any)._handler(ctx, { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} } });
  const result = await (getPublic as any)._handler(ctx, {});
  expect(result.templateConfig.settings).toEqual({});
  expect(result.templateConfig.variants).toEqual({});
  expect(result.layoutConfig.shopLayout).toBe("boutique");
  expect(result.colorPalette).toEqual([]);
});
test("appearance import sets the same cutoff receipt", async () => {
  const ctx = legacy();
  ctx.tables.roles[0].capabilities.push("settings.import");
  await (importAll as any)._handler(ctx, { data: { settings: { "appearance.template": { active: "core", overrides: {}, variants: {}, settings: {} } } } });
  expect((await (getPublic as any)._handler(ctx, {})).colorPalette).toEqual([]);
});

test("version 1 chrome upgrade preserves resets and nested builder overrides", async () => {
  const ctx = legacy();
  ctx.tables.settings.push({ _id: "template", section: "appearance.template", legacyAppearanceMigration: { version: 1, migratedAt: 1 }, values: { active: "core", overrides: {}, variants: {}, settings: { core: { header: { layout: { sticky: false } } } } } });
  ctx.tables.settings.push({ _id: "header", section: "header", values: { layout: { sticky: true, height: 90 }, topBar: { enabled: true }, cta: { label: "Join" } } });
  await (migrateLegacyAppearance as any)._handler(ctx, {});
  const result = await (getPublic as any)._handler(ctx, {});
  expect(result.templateConfig.settings.core.header).toEqual({ layout: { sticky: false, height: 90 }, topBar: { enabled: true }, cta: { label: "Join" } });
  expect(result.templateConfig.settings.core.colors).toBeUndefined();
  expect(result.templateConfig.variants).toEqual({});
  expect(await (migrateLegacyAppearance as any)._handler(ctx, {})).toEqual({ migrated: false });
});

test("flat v1 chrome aliases become nested controls before legacy defaults fill", async () => {
  const ctx = legacy();
  ctx.tables.settings.push({ _id: "template", section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: { core: { header: { sticky: false, ctaLabel: "Join", ctaUrl: "/join", logo: { showTagline: false }, showTagline: true }, footer: { showNewsletter: false, copyright: "Example" } } } } });
  const result = await (getBySection as any)._handler(ctx, { section: "appearance.template" });
  expect(result.settings.core.header.layout.sticky).toBe("none");
  expect(result.settings.core.header.cta).toEqual({ label: "Join", url: "/join", enabled: true });
  expect(result.settings.core.header.logo.showTagline).toBe(false);
  expect(result.settings.core.header.sticky).toBeUndefined();
  expect(result.settings.core.footer.newsletter.enabled).toBe(false);
  expect(result.settings.core.footer.bottomBar.copyrightText).toBe("Example");
});

test("explicit legacy projection preserves palette values without reading storage", () => {
  const palette = [{ slug: "primary", color: "#123456" }, { slug: "dark-sidebar", color: "#abcdef" }];
  const result = projectLegacyAppearance({ active: "journal", settings: { journal: { colors: { primary: "#654321" } } } }, {}, palette);
  expect(result.settings.journal.colors).toEqual({ primary: "#654321", "dark-sidebar": "#abcdef" });
});
