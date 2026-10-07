import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { getBySection } from "../queries";
import schema from "../../schema";

test("fresh-site appearance works without reading retired theme or layout tables", async () => {
  const ctx = commerceHarness();
  const query = ctx.db.query;
  ctx.db.query = (name: string) => {
    if (name === "themes" || name === "layouts") throw Error("Retired table is unavailable");
    return query(name);
  };
  expect(await (getBySection as any)._handler(ctx, { section: "appearance.template" })).toEqual({ active: "core", overrides: {}, variants: {}, settings: {}, _id: null, updatedAt: null, updatedBy: null });
});

test("installed storage contract exposes recovery archives instead of legacy editors", () => {
  expect(Object.keys(schema.tables)).not.toContain("themes");
  expect(Object.keys(schema.tables)).not.toContain("layouts");
  expect(schema.tables.legacyAppearanceArchives.validator.fields).toHaveProperty("snapshot");
});
