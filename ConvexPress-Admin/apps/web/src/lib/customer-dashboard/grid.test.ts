import { describe, expect, test } from "bun:test";

import type { DashboardLayoutItem } from "@backend/convex/extensions/dashboard/registry";

import {
  addWidgetItem,
  cellToPixels,
  collides,
  compactItems,
  findFreePosition,
  findOverlaps,
  gridMetrics,
  layoutsEqual,
  moveItem,
  nudgeItem,
  pixelsToCell,
  pixelsToSpan,
  readingOrder,
  removeItem,
  resizeItem,
  sizePresetsFor,
  snapToPreset,
  stepSize,
  uniqueKey,
} from "./grid";

const item = (key: string, x: number, y: number, w: number, h: number): DashboardLayoutItem => ({
  key,
  widgetId: key,
  x,
  y,
  w,
  h,
});

const byKey = (items: DashboardLayoutItem[], key: string) => items.find((entry) => entry.key === key)!;

describe("collision + compaction", () => {
  test("collides detects overlap and touching edges do not collide", () => {
    expect(collides({ x: 0, y: 0, w: 4, h: 2 }, { x: 3, y: 1, w: 4, h: 2 })).toBe(true);
    expect(collides({ x: 0, y: 0, w: 4, h: 2 }, { x: 4, y: 0, w: 4, h: 2 })).toBe(false);
    expect(collides({ x: 0, y: 0, w: 4, h: 2 }, { x: 0, y: 2, w: 4, h: 2 })).toBe(false);
  });

  test("compactItems pulls floating items up and keeps stacking", () => {
    const layout = [item("a", 0, 3, 4, 2), item("b", 0, 8, 4, 2), item("c", 6, 5, 6, 3)];
    const compacted = compactItems(layout);
    expect(byKey(compacted, "a").y).toBe(0);
    expect(byKey(compacted, "b").y).toBe(2);
    expect(byKey(compacted, "c").y).toBe(0);
    expect(findOverlaps(compacted)).toEqual([]);
  });

  test("compactItems keeps the pinned item in place and flows others under it", () => {
    const layout = [item("a", 0, 4, 4, 2), item("b", 0, 0, 4, 2)];
    const compacted = compactItems(layout, "a");
    expect(byKey(compacted, "a").y).toBe(4);
    expect(byKey(compacted, "b").y).toBe(0);
  });

  test("compactItems preserves input order", () => {
    const layout = [item("z", 0, 5, 3, 2), item("a", 0, 0, 3, 2)];
    expect(compactItems(layout).map((entry) => entry.key)).toEqual(["z", "a"]);
  });
});

describe("moving", () => {
  test("moveItem pushes the item it lands on downward, never overlapping", () => {
    const layout = [item("a", 0, 0, 6, 3), item("b", 6, 0, 6, 3), item("c", 0, 3, 6, 3)];
    const moved = moveItem(layout, "c", 0, 0);
    expect(byKey(moved, "c")).toMatchObject({ x: 0, y: 0 });
    expect(byKey(moved, "a").y).toBe(3);
    expect(byKey(moved, "b").y).toBe(0);
    expect(findOverlaps(moved)).toEqual([]);
  });

  test("moveItem clamps x so the item stays inside the 12 columns", () => {
    const layout = [item("a", 0, 0, 6, 3)];
    const moved = moveItem(layout, "a", 20, 0);
    expect(byKey(moved, "a").x).toBe(6);
    const negative = moveItem(layout, "a", -5, -5);
    expect(byKey(negative, "a")).toMatchObject({ x: 0, y: 0 });
  });

  test("moveItem returns the same array when nothing changes", () => {
    const layout = [item("a", 0, 0, 6, 3)];
    expect(moveItem(layout, "a", 0, 0)).toBe(layout);
    expect(moveItem(layout, "missing", 1, 1)).toBe(layout);
  });

  test("nudgeItem down swaps vertically with the neighbour below", () => {
    const layout = [item("a", 0, 0, 12, 2), item("b", 0, 2, 12, 2)];
    const nudged = nudgeItem(layout, "a", "down");
    expect(byKey(nudged, "b").y).toBe(0);
    expect(byKey(nudged, "a").y).toBe(2);
    expect(findOverlaps(nudged)).toEqual([]);
    const restored = nudgeItem(nudged, "a", "up");
    expect(byKey(restored, "a").y).toBe(0);
    expect(byKey(restored, "b").y).toBe(2);
    expect(nudgeItem(restored, "a", "up")).toEqual(restored);
    expect(nudgeItem(restored, "b", "down")).toBe(restored);
  });

  test("nudgeItem only swaps with items that share columns", () => {
    const layout = [item("a", 0, 0, 6, 2), item("b", 6, 0, 6, 2), item("c", 0, 2, 6, 2)];
    const nudged = nudgeItem(layout, "a", "down");
    expect(byKey(nudged, "c").y).toBe(0);
    expect(byKey(nudged, "a").y).toBe(2);
    expect(byKey(nudged, "b")).toMatchObject({ x: 6, y: 0 });
  });

  test("nudgeItem right moves one column and stops at the edge", () => {
    const layout = [item("a", 10, 0, 2, 2)];
    expect(byKey(nudgeItem(layout, "a", "right"), "a").x).toBe(10);
    const left = nudgeItem(layout, "a", "left");
    expect(byKey(left, "a").x).toBe(9);
  });
});

describe("sizing", () => {
  const presets = sizePresetsFor({ sizes: ["sm", "md", "lg"] });

  test("sizePresetsFor maps registry sizes to grid spans", () => {
    expect(presets).toEqual([
      { size: "sm", w: 3, h: 2 },
      { size: "md", w: 4, h: 3 },
      { size: "lg", w: 6, h: 3 },
    ]);
  });

  test("snapToPreset picks the nearest allowed size", () => {
    expect(snapToPreset(5, 3, presets).size).toBe("md");
    expect(snapToPreset(7, 3, presets).size).toBe("lg");
    expect(snapToPreset(1, 1, presets).size).toBe("sm");
    expect(snapToPreset(12, 4, presets).size).toBe("lg");
  });

  test("resizeItem snaps to a preset and pushes neighbours down", () => {
    const layout = [item("a", 0, 0, 3, 2), item("b", 0, 2, 3, 2)];
    const resized = resizeItem(layout, "a", 6, 3, presets);
    expect(byKey(resized, "a")).toMatchObject({ w: 6, h: 3 });
    expect(byKey(resized, "b").y).toBe(3);
    expect(findOverlaps(resized)).toEqual([]);
  });

  test("resizeItem shifts x left when the new width would overflow the grid", () => {
    const layout = [item("a", 9, 0, 3, 2)];
    const resized = resizeItem(layout, "a", 6, 3, presets);
    expect(byKey(resized, "a")).toMatchObject({ x: 6, w: 6, h: 3 });
  });

  test("stepSize walks the preset list and clamps at the ends", () => {
    const layout = [item("a", 0, 0, 3, 2)];
    const bigger = stepSize(layout, "a", presets, 1);
    expect(byKey(bigger, "a")).toMatchObject({ w: 4, h: 3 });
    const biggest = stepSize(stepSize(bigger, "a", presets, 1), "a", presets, 1);
    expect(byKey(biggest, "a")).toMatchObject({ w: 6, h: 3 });
    expect(byKey(stepSize(layout, "a", presets, -1), "a")).toMatchObject({ w: 3, h: 2 });
  });
});

describe("adding + removing", () => {
  test("uniqueKey suffixes duplicates", () => {
    expect(uniqueKey([], "orders")).toBe("orders");
    expect(uniqueKey([{ key: "orders" }], "orders")).toBe("orders-2");
    expect(uniqueKey([{ key: "orders" }, { key: "orders-2" }], "orders")).toBe("orders-3");
  });

  test("findFreePosition fills gaps before starting a new row", () => {
    const layout = [item("a", 0, 0, 6, 3), item("b", 0, 3, 12, 2)];
    expect(findFreePosition(layout, 6, 3)).toEqual({ x: 6, y: 0 });
    expect(findFreePosition(layout, 12, 1)).toEqual({ x: 0, y: 5 });
  });

  test("addWidgetItem places at the default size with a unique key", () => {
    const layout = [item("orders", 0, 0, 6, 3)];
    const added = addWidgetItem(layout, { id: "orders", sizes: ["md", "lg", "xl"], defaultSize: "lg" });
    expect(added).toHaveLength(2);
    const fresh = added.find((entry) => entry.key === "orders-2")!;
    expect(fresh).toMatchObject({ widgetId: "orders", x: 6, y: 0, w: 6, h: 3 });
    expect(findOverlaps(added)).toEqual([]);
  });

  test("addWidgetItem falls back to the nearest allowed size when the requested one is not allowed", () => {
    const added = addWidgetItem([], { id: "subscription", sizes: ["sm", "md"], defaultSize: "md" }, "xl");
    expect(added[0]).toMatchObject({ w: 4, h: 3 });
  });

  test("removeItem compacts the hole it leaves", () => {
    const layout = [item("a", 0, 0, 12, 2), item("b", 0, 2, 12, 2), item("c", 0, 4, 12, 2)];
    const removed = removeItem(layout, "b");
    expect(removed.map((entry) => entry.key)).toEqual(["a", "c"]);
    expect(byKey(removed, "c").y).toBe(2);
  });
});

describe("ordering + equality", () => {
  test("readingOrder sorts top-to-bottom then left-to-right", () => {
    const layout = [item("c", 6, 1, 6, 1), item("a", 0, 0, 6, 1), item("b", 6, 0, 6, 1)];
    expect(readingOrder(layout).map((entry) => entry.key)).toEqual(["a", "b", "c"]);
  });

  test("layoutsEqual ignores order and treats missing settings as empty", () => {
    const a = [item("a", 0, 0, 3, 2), { ...item("b", 3, 0, 3, 2), settings: {} }];
    const b = [item("b", 3, 0, 3, 2), item("a", 0, 0, 3, 2)];
    expect(layoutsEqual(a, b)).toBe(true);
    expect(layoutsEqual(a, [item("a", 0, 1, 3, 2), item("b", 3, 0, 3, 2)])).toBe(false);
  });
});

describe("pixels ↔ cells", () => {
  const metrics = gridMetrics(12 * 80 + 11 * 16, 12, 96, 16);

  test("gridMetrics derives the column width from the container", () => {
    expect(metrics.columnWidth).toBe(80);
  });

  test("cellToPixels and pixelsToCell round-trip", () => {
    const px = cellToPixels({ x: 3, y: 2, w: 4, h: 3 }, metrics);
    expect(px).toEqual({ left: 288, top: 224, width: 368, height: 320 });
    expect(pixelsToCell(px.left + 20, px.top - 30, metrics)).toEqual({ x: 3, y: 2 });
    expect(pixelsToSpan(px.width + 10, px.height, metrics)).toEqual({ w: 4, h: 3 });
  });
});
