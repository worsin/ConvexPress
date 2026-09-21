import { expect, test } from "bun:test";
import { createDraftHistory, applyDraftChange, undoDraft, redoDraft, setDraftField, readDraftField, resetDraftModule, resetDraftBrand, applyColorPreset, draftChanges } from "./draftModel";
import { mergeTemplateValues } from "./customizeModel";
const saved = () => ({ values: { colors: { primary: "#123456", "dark-sidebar": "#000000" }, typography: { body: "Inter", scale: "compact" }, shop: { catalogVariant: "marketplace" } }, variants: { "shop.catalog": "marketplace", "page": "minimal" } });
test("undo/redo and new edits preserve immutable snapshots and clear redo", () => {
  const source = saved();
  const first = createDraftHistory(source);
  const next = applyDraftChange(first, setDraftField(first.present, "shop", "cartPanel", "drawer"));
  expect(undoDraft(next).present).toEqual(source);
  expect(redoDraft(undoDraft(next)).present).toEqual(next.present);
  expect(applyDraftChange(undoDraft(next), setDraftField(source, "shop", "gridDensity", "dense")).future).toEqual([]);
  expect(source).toEqual(saved());
});
test("shop reset and empty variant remove associated surface choice", () => {
  const reset = resetDraftModule(saved(), "shop");
  expect(reset.values.shop).toBeUndefined();
  expect(reset.variants).toEqual({ page: "minimal" });
  expect(setDraftField(saved(), "shop", "catalogVariant", null).variants["shop.catalog"]).toBeUndefined();
});
test("brand reset includes arbitrary palette tokens and preserves unrelated settings", () => {
  const reset = resetDraftBrand(saved(), [{ id: "typography", fields: [{ id: "body", brandBound: true }, { id: "scale" }] }]);
  expect(reset.values.colors).toBeUndefined();
  expect(reset.values.typography).toEqual({ scale: "compact" });
  expect(reset.values.shop).toEqual(saved().values.shop);
});
test("preset replacement is one undoable edit with a useful changes list", () => {
  const first = createDraftHistory(saved());
  const next = applyDraftChange(first, applyColorPreset(first.present, { primary: "#abcdef" }));
  expect(next.present.values.colors).toEqual({ primary: "#abcdef" });
  expect(undoDraft(next).present).toEqual(first.present);
  expect(draftChanges(first.present, next.present)).toEqual(["colors.primary", "colors.dark-sidebar"]);
});
test("history remains bounded for long editing sessions", () => {
  let history = createDraftHistory(saved());
  for (let i = 0; i < 100; i++) history = applyDraftChange(history, setDraftField(history.present, "layout", "width", i));
  expect(history.past).toHaveLength(50);
});

test("nested field writes preserve siblings and refuse unsafe object paths", () => {
  const first = { values: { header: { layout: { sticky: "always", height: 80 } } }, variants: {} };
  const next = setDraftField(first, "header", "layout.sticky", "never");
  expect(readDraftField(next.values.header, "layout.sticky")).toBe("never");
  expect(readDraftField(next.values.header, "layout.height")).toBe(80);
  expect(readDraftField(first.values.header, "layout.sticky")).toBe("always");
  const safe = setDraftField(next, "header", "__proto__.polluted", true);
  expect(safe).toEqual(next);
});

test("choosing a field default removes its override and restores pack defaults", () => {
  const source = {values:{layout:{sectionSpacing:"spacious",elementSpacing:"spacious"},header:{layout:{sticky:"never",height:"tall"}}},variants:{}};
  const reset = setDraftField(source,"layout","sectionSpacing",null);
  expect(reset.values.layout).toEqual({elementSpacing:"spacious"});
  expect(mergeTemplateValues({layout:{sectionSpacing:"compact",elementSpacing:"compact"}},source.values,reset.values).layout).toEqual({sectionSpacing:"compact",elementSpacing:"spacious"});
  const nested = setDraftField(source,"header","layout.sticky",null);
  expect(nested.values.header).toEqual({layout:{height:"tall"}});
  const history = applyDraftChange(createDraftHistory(source),reset);
  expect(undoDraft(history).present).toEqual(source);
  expect(redoDraft(undoDraft(history)).present).toEqual(reset);
});
