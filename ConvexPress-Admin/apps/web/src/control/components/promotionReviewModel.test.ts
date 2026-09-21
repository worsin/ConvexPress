import { describe, expect, test } from "bun:test";
import { candidates, emptySelection, receiptStorageKey, selectionCount, toggleSelection } from "./promotionReviewModel";
describe("content promotion selection", () => {
  test("deduplicates actual authored IDs and never projects private fields", () => {
    expect(candidates([null, { _id: "p1", title: "First", status: "publish", privateToken: "secret" }, { _id: "p1", title: "Updated" }, { _id: "p2", title: "Deleted", status: "trash" }, { _id: 4, title: "Invalid" }])).toEqual([{ id: "p1", title: "Updated", detail: "" }]);
  });
  test("bounds combined selection, permits removal at limit and preserves other kinds", () => {
    const selection = { ...emptySelection(), pageIds: Array.from({ length: 100 }, (_, n) => `p${n}`) };
    expect(() => toggleSelection(selection, "postIds", "post")).toThrow("100");
    const removed = toggleSelection(selection, "pageIds", "p0");
    expect(selectionCount(toggleSelection(removed, "postIds", "post"))).toBe(100);
    expect(selection.pageIds).toHaveLength(100);
  });
  test("receipt storage is scoped to website and operator, never credentials", () => {
    expect(receiptStorageKey("a", "site")).not.toBe(receiptStorageKey("b", "site"));
    expect(receiptStorageKey("a", "site")).not.toBe(receiptStorageKey("a", "other"));
  });
});
