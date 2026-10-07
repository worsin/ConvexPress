import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import * as migrations from "../migrations";
import { scanReferences } from "../../media/referenceScan";
import { prepareReferenceClear } from "../../media/references";

const original = { _id: "old-theme", _creationTime: 3, name: "Original palette", slug: "original", type: "custom", isActive: true, colorPalette: [{ slug: "primary", color: "#123456" }], headerConfig: { logo: { custom: "kept" } }, createdAt: 4, updatedAt: 5 };
async function archive(ctx: any, table = "themes") {
  const fn = (migrations as any).archiveLegacyAppearanceBatch;
  expect(fn).toBeDefined();
  return fn._handler(ctx, { table });
}

test("retirement preserves exact original record and palette before removing live theme", async () => {
  const ctx = commerceHarness({ themes: [original], layouts: [] });
  expect(await archive(ctx)).toEqual({ table: "themes", archived: 1, done: true });
  expect(ctx.tables.themes).toEqual([]);
  expect(ctx.tables.legacyAppearanceArchives[0].snapshot).toEqual(original);
  expect(ctx.tables.legacyAppearanceArchives[0].sourceTable).toBe("themes");
  expect(ctx.tables.legacyAppearanceArchives[0].sourceId).toBe("old-theme");
  const current = ctx.tables.settings.find((x: any) => x.section === "appearance.template");
  expect(current.values.settings.core.colors.primary).toBe("#123456");
  expect(current.legacyAppearanceMigration.version).toBe(2);
  const before = structuredClone(ctx.tables);
  expect(await archive(ctx)).toEqual({ table: "themes", archived: 0, done: true });
  expect(ctx.tables).toEqual(before);
});

test("retirement never overwrites an already migrated authored appearance", async () => {
  const settings = { _id: "appearance", section: "appearance.template", values: { active: "journal", overrides: {}, variants: {}, settings: { journal: { colors: { primary: "#fedcba" }, header: { custom: false } } } }, legacyAppearanceMigration: { version: 2, migratedAt: 7 }, updatedAt: 9 };
  const ctx = commerceHarness({ settings: [settings], themes: [original] });
  await archive(ctx);
  expect(ctx.tables.settings).toEqual([settings]);
});

test("retirement explicitly reports incomplete batches and preserves every layout", async () => {
  const layouts = Array.from({ length: 61 }, (_, i) => ({ _id: `layout-${i}`, _creationTime: i, name: `Layout ${i}`, slug: `layout-${i}`, type: "custom", config: { contentWidth: "wide", sections: [{ type: "original", enabled: true, options: { text: `Keep ${i}` } }] }, createdAt: i, updatedAt: i }));
  const ctx = commerceHarness({ layouts, themes: [] });
  const first = await archive(ctx, "layouts");
  expect(first.done).toBe(false);
  expect(first.archived).toBeGreaterThan(0);
  expect(first.archived).toBeLessThan(61);
  let result = first;
  for (let n = 0; !result.done && n < 100; n++) result = await archive(ctx, "layouts");
  expect(result.done).toBe(true);
  expect(ctx.tables.layouts).toEqual([]);
  expect(ctx.tables.legacyAppearanceArchives.map((x: any) => x.snapshot)).toEqual(layouts);
});

test("anonymous and customer retirement requests leave original rows unchanged", async () => {
  for (const identity of [null, "admin"] as const) {
    const ctx = commerceHarness({ themes: [original] }, identity);
    if (identity) { ctx.tables.roles[0].capabilities = []; ctx.tables.roles[0].slug = "subscriber"; ctx.tables.roles[0].type = "customer"; }
    const before = structuredClone(ctx.tables);
    await expect(archive(ctx)).rejects.toBeDefined();
    expect(ctx.tables).toEqual(before);
  }
});

test("a conflicting prior archive refuses deletion rather than replacing history", async () => {
  const ctx = commerceHarness({ themes: [original], legacyAppearanceArchives: [{ _id: "archive", sourceTable: "themes", sourceId: original._id, snapshot: { ...original, name: "Different original" }, archivedAt: 1 }] });
  await expect(archive(ctx)).rejects.toMatchObject({ data: expect.objectContaining({ code: "APPEARANCE_ARCHIVE_CONFLICT" }) });
  expect(ctx.tables.themes).toEqual([original]);
  expect(ctx.tables.legacyAppearanceArchives[0].snapshot.name).toBe("Different original");
});

test("oversized archive fails explicitly while original remains recoverable", async () => {
  const large = { ...original, description: "a".repeat(1000000) };
  const ctx = commerceHarness({ themes: [large] });
  await expect(archive(ctx)).rejects.toMatchObject({ data: expect.objectContaining({ code: "APPEARANCE_ARCHIVE_TOO_LARGE" }) });
  expect(ctx.tables.themes).toEqual([large]);
  expect(ctx.tables.legacyAppearanceArchives ?? []).toEqual([]);
});

test("an authorized operator can export complete archived originals with bounded continuation", async () => {
  const ctx = commerceHarness({ themes: [original, { ...original, _id: "second", name: "Second" }] });
  await archive(ctx);
  const reader = (migrations as any).listArchivedAppearance;
  expect(reader).toBeDefined();
  const page = await reader._handler(ctx, { table: "themes", cursor: null });
  expect(page.isDone).toBe(true);
  expect(page.page.map((x: any) => x.snapshot)).toEqual([original, { ...original, _id: "second", name: "Second" }]);
  ctx.auth.getUserIdentity = async () => null;
  await expect(reader._handler(ctx, { table: "themes", cursor: null })).rejects.toBeDefined();
});


test("retired appearance keeps media in use and cannot be force-cleared from its archive", async () => {
  const theme = { ...original, headerConfig: { logo: { mediaId: "m1" } } };
  const ctx = commerceHarness({ themes: [theme], media: [{ _id: "m1", status: "active" }] });
  await archive(ctx);
  const saved = ctx.tables.legacyAppearanceArchives[0];
  const references = scanReferences("legacyAppearanceArchives", saved, ["m1"]);
  expect(references).toHaveLength(1);
  expect(references[0].path).toBe("snapshot.headerConfig.logo.mediaId");
  await expect(prepareReferenceClear(ctx, references)).rejects.toBeDefined();
  expect(saved.snapshot).toEqual(theme);
});
