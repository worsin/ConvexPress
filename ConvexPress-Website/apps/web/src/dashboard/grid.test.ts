import { describe, expect, test } from "bun:test";

import {
  addItem,
  collides,
  compact,
  cycleSize,
  findFreeSpot,
  gridHeight,
  layoutsEqual,
  moveItem,
  nearestSize,
  nextInstanceKey,
  pixelsToCells,
  placeItem,
  resizeItem,
  setHidden,
  snapToAllowedSize,
  type GridItem,
} from "./grid";

const item = (key: string, x: number, y: number, w: number, h: number, extra: Partial<GridItem> = {}): GridItem => ({
  key,
  widgetId: key,
  x,
  y,
  w,
  h,
  ...extra,
});

function noOverlaps(items: GridItem[]): boolean {
  const visible = items.filter((entry) => !entry.hidden);
  for (const a of visible) for (const b of visible) if (a !== b && collides(a, b)) return false;
  return true;
}

describe("collides", () => {
  test("detects overlap and ignores self", () => {
    expect(collides(item("a", 0, 0, 4, 2), item("b", 3, 1, 4, 2))).toBe(true);
    expect(collides(item("a", 0, 0, 4, 2), item("b", 4, 0, 4, 2))).toBe(false);
    expect(collides(item("a", 0, 0, 4, 2), item("a", 0, 0, 4, 2))).toBe(false);
  });
});

describe("compact", () => {
  test("pulls items up into gaps", () => {
    const out = compact([item("a", 0, 0, 6, 3), item("b", 0, 5, 6, 3), item("c", 6, 4, 6, 2)]);
    expect(out.find((entry) => entry.key === "b")?.y).toBe(3);
    expect(out.find((entry) => entry.key === "c")?.y).toBe(0);
    expect(noOverlaps(out)).toBe(true);
  });
  test("leaves hidden items untouched", () => {
    const out = compact([item("a", 0, 0, 6, 3), item("b", 0, 9, 6, 3, { hidden: true })]);
    expect(out.find((entry) => entry.key === "b")?.y).toBe(9);
  });
});

describe("placeItem / moveItem", () => {
  test("pushes overlapped items down and compacts", () => {
    const start = [item("a", 0, 0, 6, 3), item("b", 6, 0, 6, 3), item("c", 0, 3, 12, 2)];
    const out = moveItem(start, "c", 0, 0);
    const c = out.find((entry) => entry.key === "c")!;
    expect([c.x, c.y]).toEqual([0, 0]);
    expect(out.find((entry) => entry.key === "a")?.y).toBe(2);
    expect(out.find((entry) => entry.key === "b")?.y).toBe(2);
    expect(noOverlaps(out)).toBe(true);
  });
  test("clamps the moved item inside the columns", () => {
    const out = moveItem([item("a", 0, 0, 4, 3)], "a", 11, -2);
    expect(out[0]).toMatchObject({ x: 8, y: 0 });
  });
  test("does not lose items on a crowded board", () => {
    const start = [
      item("a", 0, 0, 4, 3),
      item("b", 4, 0, 4, 3),
      item("c", 8, 0, 4, 3),
      item("d", 0, 3, 6, 3),
      item("e", 6, 3, 6, 3),
      item("f", 0, 6, 12, 4),
    ];
    const out = placeItem(start, "f", { x: 0, y: 1, w: 12, h: 4 });
    expect(out).toHaveLength(6);
    expect(noOverlaps(out)).toBe(true);
    expect(gridHeight(out)).toBeLessThanOrEqual(13);
  });
});

describe("resize + snapping", () => {
  test("resizeItem resolves collisions", () => {
    const out = resizeItem([item("a", 0, 0, 4, 3), item("b", 4, 0, 4, 3)], "a", 6, 3);
    expect(out.find((entry) => entry.key === "b")?.y).toBe(3);
    expect(noOverlaps(out)).toBe(true);
  });
  test("nearestSize picks the closest allowed size", () => {
    expect(nearestSize(5, 3, ["sm", "md", "lg"])).toBe("lg");
    expect(nearestSize(3, 2, ["md", "lg"])).toBe("md");
    expect(nearestSize(12, 4, ["sm"])).toBe("sm");
  });
  test("snapToAllowedSize keeps a valid size and fixes an invalid one", () => {
    expect(snapToAllowedSize(item("a", 0, 0, 6, 3), { sizes: ["md", "lg"], defaultSize: "lg" })).toMatchObject({ w: 6, h: 3 });
    expect(snapToAllowedSize(item("a", 0, 0, 12, 4), { sizes: ["sm", "md"], defaultSize: "md" })).toMatchObject({ w: 4, h: 3 });
  });
  test("cycleSize walks the allowed sizes and wraps", () => {
    expect(cycleSize("md", ["sm", "md", "lg"])).toBe("lg");
    expect(cycleSize("lg", ["sm", "md", "lg"])).toBe("sm");
    expect(cycleSize("sm", ["sm", "md", "lg"], -1)).toBe("lg");
    expect(cycleSize(null, ["md", "xl"])).toBe("md");
  });
});

describe("add / hide / keys", () => {
  test("findFreeSpot fills the first gap", () => {
    expect(findFreeSpot([item("a", 0, 0, 6, 3)], 6, 3)).toEqual({ x: 6, y: 0 });
    expect(findFreeSpot([item("a", 0, 0, 12, 3)], 6, 3)).toEqual({ x: 0, y: 3 });
  });
  test("addItem places a new instance with a unique key", () => {
    const out = addItem([item("orders", 0, 0, 6, 3)], { id: "orders", sizes: ["md", "lg"], defaultSize: "lg" });
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ key: "orders-2", widgetId: "orders", x: 6, y: 0, w: 6, h: 3 });
    expect(nextInstanceKey(out, "orders")).toBe("orders-3");
  });
  test("setHidden removes from the flow and restores into a free spot", () => {
    const hidden = setHidden([item("a", 0, 0, 6, 3), item("b", 0, 3, 6, 3)], "a", true);
    expect(hidden.find((entry) => entry.key === "a")?.hidden).toBe(true);
    expect(hidden.find((entry) => entry.key === "b")?.y).toBe(0);
    const shown = setHidden(hidden, "a", false);
    const restored = shown.find((entry) => entry.key === "a")!;
    expect(restored.hidden).toBeFalsy();
    expect(restored).toMatchObject({ x: 6, y: 0 });
    expect(noOverlaps(shown)).toBe(true);
  });
});

describe("pixelsToCells / layoutsEqual", () => {
  test("converts pointer deltas using the rendered width", () => {
    // 12 columns, gap 16: width 1200 → column 82.67, cell 98.67; row cell 112.
    expect(pixelsToCells(200, 230, 1200)).toEqual({ dx: 2, dy: 2 });
    expect(pixelsToCells(-40, 10, 1200)).toEqual({ dx: -0, dy: 0 });
  });
  test("compares geometry, visibility, and settings", () => {
    const a = [item("a", 0, 0, 6, 3, { settings: { limit: 4 } })];
    expect(layoutsEqual(a, [item("a", 0, 0, 6, 3, { settings: { limit: 4 } })])).toBe(true);
    expect(layoutsEqual(a, [item("a", 0, 0, 6, 3, { settings: { limit: 5 } })])).toBe(false);
    expect(layoutsEqual(a, [item("a", 0, 1, 6, 3, { settings: { limit: 4 } })])).toBe(false);
  });
});
