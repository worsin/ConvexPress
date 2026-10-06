import { expect, test } from "bun:test";
import { commerceHarness } from "../../ConvexPress-Admin/packages/backend/convex/commerce/__tests__/handlerHarness.test-support";
import { migrateLegacyAppearance } from "../../ConvexPress-Admin/packages/backend/convex/settings/migrations";
import { getPublic } from "../../ConvexPress-Admin/packages/backend/convex/settings/queries";
import { updateSection, importAll } from "../../ConvexPress-Admin/packages/backend/convex/settings/mutations";
import { paletteStyleBlocks } from "../../ConvexPress-Website/apps/web/src/lib/theme/palette";
import { resolveShopLayout } from "../../ConvexPress-Website/apps/web/src/lib/commerce/shop-layout";

// Exercise the registered backend handlers through the actual Website consumers.
// Comparing stored JSON alone misses values lost at the public/CSS/layout boundary.
for (const pack of ["core", "journal", "depot", "aster-house"]) {
  test(`${pack}: legacy appearance survives persistence, explicit reset and recovery`, async () => {
    const other = pack === "core" ? "journal" : "core";
    const ctx = commerceHarness({
      settings: [
        { _id: "legacy-layout", section: "commerce.layout", values: { shopLayout: "marketplace", productLayout: "split", cartPanel: "drawer", gridDensity: "dense" } },
        { _id: "appearance", section: "appearance.template", values: {
          active: pack, overrides: { "shop.catalog": "core" }, variants: { "shop.catalog": "boutique" },
          settings: { [pack]: { colors: { primary: "#654321" }, shop: { cartPanel: "persistent" } }, [other]: { colors: { primary: "#111111" } } },
        } },
      ],
      themes: [{ _id: "legacy-theme", isActive: true, colorPalette: [
        { slug: "primary", color: "#123456" }, { slug: "dark-sidebar", color: "#abcdef" }, { slug: "studio-custom", color: "#246824" },
      ] }],
    });
    ctx.tables.roles[0].capabilities.push("settings.import");
    const publicState = () => (getPublic as any)._handler(ctx, {});
    const render = (state: any) => {
      const config = state.templateConfig;
      const values = config.settings[config.active] ?? {};
      return {
        css: paletteStyleBlocks(Object.entries(values.colors ?? {}).map(([slug, color]) => ({ slug, color }))),
        layout: resolveShopLayout(config.variants, values.shop ?? {}),
      };
    };
    const source = structuredClone({ theme: ctx.tables.themes, layout: ctx.tables.settings[0] });
    const projected = await publicState();
    const before = render(projected);
    expect(before.css).toContain("--primary: #654321;");
    expect(before.css).not.toContain("#123456");
    expect(before.css).toContain(".dark {\n--sidebar: #abcdef;");
    expect(before.css).toContain("--studio-custom: #246824;");
    expect(before.layout).toEqual({ shopLayout: "boutique", productLayout: "split", cartPanel: "persistent", gridDensity: "dense", previewing: false });

    expect(await (migrateLegacyAppearance as any)._handler(ctx, {})).toEqual({ migrated: true });
    expect(render(await publicState())).toEqual(before);
    const migrated = structuredClone(ctx.tables.settings.find((row: any) => row._id === "appearance"));
    expect(migrated.legacyAppearanceMigration.version).toBe(2);
    expect(migrated.values.settings[other]).toEqual({ colors: { primary: "#111111" } });
    expect(migrated.values.overrides).toEqual({ "shop.catalog": "core" });
    const exact = JSON.stringify(ctx.tables);
    expect(await (migrateLegacyAppearance as any)._handler(ctx, {})).toEqual({ migrated: false });
    expect(JSON.stringify(ctx.tables)).toBe(exact);

    await (updateSection as any)._handler(ctx, { section: "appearance.template", values: { active: pack, overrides: {}, variants: {}, settings: {} } });
    const reset = render(await publicState());
    expect(reset.css).toBe("");
    expect(reset.layout).toEqual({ shopLayout: "boutique", productLayout: "classic", cartPanel: "persistent", gridDensity: "comfortable", previewing: false });
    await (importAll as any)._handler(ctx, { data: { settings: { "appearance.template": migrated.values } } });
    expect(render(await publicState())).toEqual(before);
    expect({ theme: ctx.tables.themes, layout: ctx.tables.settings[0] }).toEqual(source);
    expect(ctx.tables.settings.find((row: any) => row._id === "appearance").legacyAppearanceMigration).toEqual(migrated.legacyAppearanceMigration);
  });
}
