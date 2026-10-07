import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { listArchivedAppearance } from "../migrations";
import { getPublic } from "../queries";
import { scanReferences } from "../../media/referenceScan";
import { prepareReferenceClear } from "../../media/references";

// The temporary archive writer and its migration tests are preserved at 70db6501.
// Installed recovery only reads the originals; it cannot restore active themes.
const original = { _id: "old-theme", _creationTime: 3, name: "Original palette", colorPalette: [{ slug: "primary", color: "#123456" }], headerConfig: { logo: { mediaId: "m1" } } };
const archive = (i: number, table = "themes") => ({ _id: `archive-${table}-${i}`, sourceTable: table, sourceId: `original-${i}`, snapshot: { ...original, _id: `original-${i}` }, archivedAt: 7 });

test("operator exports every archived original with bounded continuation and table isolation", async () => {
  const themes = Array.from({ length: 11 }, (_, i) => archive(i));
  const ctx = commerceHarness({ legacyAppearanceArchives: [...themes, archive(1, "layouts")] });
  const before = structuredClone(ctx.tables);
  const exported = [];
  let cursor = null;
  for (let n = 0; n < 10; n++) {
    const result = await (listArchivedAppearance as any)._handler(ctx, { table: "themes", cursor });
    expect(result.page.length).toBeLessThanOrEqual(4);
    exported.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(exported).toEqual(themes);
  expect(ctx.tables).toEqual(before);
});

test("anonymous and customer callers cannot export archive contents", async () => {
  for (const identity of [null, "admin"] as const) {
    const ctx = commerceHarness({ legacyAppearanceArchives: [archive(1)] }, identity);
    if (identity) { ctx.tables.roles[0].capabilities = []; ctx.tables.roles[0].slug = "subscriber"; ctx.tables.roles[0].type = "customer"; }
    const before = structuredClone(ctx.tables);
    await expect((listArchivedAppearance as any)._handler(ctx, { table: "themes", cursor: null })).rejects.toBeDefined();
    expect(ctx.tables).toEqual(before);
  }
});

test("retired media remains in use and its recovery archive cannot be force-cleared", async () => {
  const saved = archive(1);
  const ctx = commerceHarness({ legacyAppearanceArchives: [saved], media: [{ _id: "m1", status: "active" }] });
  const refs = scanReferences("legacyAppearanceArchives", saved, ["m1"]);
  expect(refs).toHaveLength(1);
  expect(refs[0].path).toBe("snapshot.headerConfig.logo.mediaId");
  await expect(prepareReferenceClear(ctx, refs)).rejects.toBeDefined();
  expect(ctx.tables.legacyAppearanceArchives).toEqual([saved]);
});

test("recovery palettes never become live public appearance", async () => {
  const ctx = commerceHarness({ legacyAppearanceArchives: [archive(1)] });
  const result = await (getPublic as any)._handler(ctx, {});
  expect(result.colorPalette).toEqual([]);
  expect(result.templateConfig.settings).toEqual({});
});
