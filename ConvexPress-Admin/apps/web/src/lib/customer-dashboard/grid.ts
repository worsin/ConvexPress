/**
 * Customer dashboard — home layout grid engine (pure).
 *
 * The website renders a member's home as a 12-column grid of widget cards.
 * This module owns the geometry the admin layout editor manipulates:
 *
 *   - collision detection and vertical compaction (gravity, like
 *     react-grid-layout's "vertical" compact mode)
 *   - moving an item while pushing the items it lands on downward
 *   - resizing snapped to the widget's allowed size presets from the registry
 *   - first-fit placement for newly added widgets
 *   - keyboard nudges and preset stepping
 *   - pixel ↔ cell conversion for the pointer editor
 *
 * No React, no Convex — everything here is unit tested with `bun test`.
 */

import {
  DASHBOARD_GRID,
  type DashboardLayoutItem,
  type DashboardWidgetDefinition,
  type DashboardWidgetSize,
} from "@backend/convex/extensions/dashboard/registry";

export const GRID_COLUMNS: number = DASHBOARD_GRID.columns;
export const GRID_ROW_HEIGHT: number = DASHBOARD_GRID.rowHeight;
export const GRID_GAP: number = DASHBOARD_GRID.gap;

/** Hard ceiling so a runaway push-down never loops forever. */
const MAX_ROWS = 200;

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SizePreset {
  size: DashboardWidgetSize;
  w: number;
  h: number;
}

export type NudgeDirection = "up" | "down" | "left" | "right";

// ─── Collision helpers ──────────────────────────────────────────────────────

export function collides(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function collidesAny(rect: GridRect, others: DashboardLayoutItem[], ignoreKey?: string): boolean {
  for (const other of others) {
    if (ignoreKey !== undefined && other.key === ignoreKey) continue;
    if (collides(rect, other)) return true;
  }
  return false;
}

/** Reading order: top to bottom, then left to right. */
export function sortByPosition<T extends GridRect>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

/** Returns the items whose rectangles overlap; empty for a valid layout. */
export function findOverlaps(items: DashboardLayoutItem[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (collides(items[i], items[j])) overlaps.push([items[i].key, items[j].key]);
    }
  }
  return overlaps;
}

// ─── Geometry ───────────────────────────────────────────────────────────────

export function clampRect(rect: GridRect, columns: number = GRID_COLUMNS): GridRect {
  const w = Math.min(columns, Math.max(1, Math.round(rect.w)));
  const h = Math.max(1, Math.round(rect.h));
  const x = Math.min(columns - w, Math.max(0, Math.round(rect.x)));
  const y = Math.min(MAX_ROWS, Math.max(0, Math.round(rect.y)));
  return { x, y, w, h };
}

export function layoutHeight(items: GridRect[]): number {
  let height = 0;
  for (const item of items) height = Math.max(height, item.y + item.h);
  return height;
}

/** Items in reading order — how the website stacks them on narrow screens. */
export function readingOrder(items: DashboardLayoutItem[]): DashboardLayoutItem[] {
  return sortByPosition(items);
}

// ─── Compaction ─────────────────────────────────────────────────────────────

/**
 * Pull every item up as far as it can go without overlapping something that
 * sits above it. `pinnedKey` keeps one item exactly where it is (the item the
 * user is dragging) so the rest of the grid flows around it.
 *
 * The returned array keeps the input order so React keys stay stable.
 */
export function compactItems(items: DashboardLayoutItem[], pinnedKey?: string): DashboardLayoutItem[] {
  const pinned = pinnedKey !== undefined ? items.find((item) => item.key === pinnedKey) : undefined;
  const placed: DashboardLayoutItem[] = pinned ? [pinned] : [];
  const byKey = new Map<string, DashboardLayoutItem>();
  if (pinned) byKey.set(pinned.key, pinned);

  for (const item of sortByPosition(items)) {
    if (pinned && item.key === pinned.key) continue;
    let y = item.y;
    while (y > 0 && !collidesAny({ ...item, y: y - 1 }, placed)) y -= 1;
    const next = y === item.y ? item : { ...item, y };
    placed.push(next);
    byKey.set(next.key, next);
  }

  return items.map((item) => byKey.get(item.key) ?? item);
}

/**
 * Place `moved` at its new rectangle and push every item it overlaps downward
 * (cascading), then compact everything else around it.
 */
export function resolveCollisions(items: DashboardLayoutItem[], moved: DashboardLayoutItem): DashboardLayoutItem[] {
  const others = sortByPosition(items.filter((item) => item.key !== moved.key));
  const placed: DashboardLayoutItem[] = [moved];
  const byKey = new Map<string, DashboardLayoutItem>([[moved.key, moved]]);

  for (const other of others) {
    let candidate = other;
    let guard = 0;
    while (collidesAny(candidate, placed) && guard < MAX_ROWS) {
      candidate = { ...candidate, y: candidate.y + 1 };
      guard += 1;
    }
    placed.push(candidate);
    byKey.set(candidate.key, candidate);
  }

  const withMoved = items.some((item) => item.key === moved.key)
    ? items.map((item) => byKey.get(item.key) ?? item)
    : [...items.map((item) => byKey.get(item.key) ?? item), moved];
  return compactItems(withMoved, moved.key);
}

/** Full compaction with nothing pinned — run when a drag or resize ends. */
export function finalizeLayout(items: DashboardLayoutItem[]): DashboardLayoutItem[] {
  return compactItems(items);
}

// ─── Moving ─────────────────────────────────────────────────────────────────

export function moveItem(items: DashboardLayoutItem[], key: string, x: number, y: number): DashboardLayoutItem[] {
  const item = items.find((entry) => entry.key === key);
  if (!item) return items;
  const rect = clampRect({ x, y, w: item.w, h: item.h });
  if (rect.x === item.x && rect.y === item.y) return items;
  return resolveCollisions(items, { ...item, ...rect });
}

function overlapsHorizontally(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x;
}

/**
 * Keyboard reordering. Left/right shift one column. Up/down swap the item
 * with the nearest neighbour above or below it in the same columns, so a
 * vertical stack reorders the way a list would.
 */
export function nudgeItem(items: DashboardLayoutItem[], key: string, direction: NudgeDirection): DashboardLayoutItem[] {
  const item = items.find((entry) => entry.key === key);
  if (!item) return items;
  if (direction === "left" || direction === "right") {
    return moveItem(items, key, item.x + (direction === "left" ? -1 : 1), item.y);
  }
  if (direction === "down") {
    const below = items
      .filter((other) => other.key !== key && overlapsHorizontally(item, other) && other.y >= item.y + item.h)
      .sort((a, b) => a.y - b.y)[0];
    if (!below) return items;
    return finalizeLayout(moveItem(items, key, item.x, below.y + below.h));
  }
  const above = items
    .filter((other) => other.key !== key && overlapsHorizontally(item, other) && other.y + other.h <= item.y)
    .sort((a, b) => b.y + b.h - (a.y + a.h))[0];
  if (!above) return finalizeLayout(items);
  return finalizeLayout(moveItem(items, key, item.x, above.y));
}

// ─── Sizing ─────────────────────────────────────────────────────────────────

export function sizePresetsFor(widget: Pick<DashboardWidgetDefinition, "sizes">): SizePreset[] {
  return widget.sizes.map((size) => ({ size, ...DASHBOARD_GRID.sizes[size] }));
}

/** Nearest allowed preset to a raw (w, h); ties resolve to the earlier preset. */
export function snapToPreset(w: number, h: number, presets: SizePreset[]): SizePreset {
  if (presets.length === 0) return { size: "md", ...DASHBOARD_GRID.sizes.md };
  let best = presets[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of presets) {
    const distance = (preset.w - w) ** 2 + (preset.h - h) ** 2;
    if (distance < bestDistance) {
      best = preset;
      bestDistance = distance;
    }
  }
  return best;
}

/** The preset a rectangle currently matches, if any. */
export function presetForRect(rect: Pick<GridRect, "w" | "h">, presets: SizePreset[]): SizePreset | null {
  return presets.find((preset) => preset.w === rect.w && preset.h === rect.h) ?? null;
}

export function resizeItem(
  items: DashboardLayoutItem[],
  key: string,
  w: number,
  h: number,
  presets: SizePreset[],
): DashboardLayoutItem[] {
  const item = items.find((entry) => entry.key === key);
  if (!item) return items;
  const preset = snapToPreset(w, h, presets);
  const rect = clampRect({ x: item.x, y: item.y, w: preset.w, h: preset.h });
  if (rect.w === item.w && rect.h === item.h && rect.x === item.x) return items;
  return resolveCollisions(items, { ...item, ...rect });
}

/** Keyboard: step to the next / previous preset in the widget's list. */
export function stepSize(
  items: DashboardLayoutItem[],
  key: string,
  presets: SizePreset[],
  delta: 1 | -1,
): DashboardLayoutItem[] {
  const item = items.find((entry) => entry.key === key);
  if (!item || presets.length === 0) return items;
  const current = presets.findIndex((preset) => preset.w === item.w && preset.h === item.h);
  const nextIndex = current === -1 ? 0 : Math.min(presets.length - 1, Math.max(0, current + delta));
  const next = presets[nextIndex];
  return finalizeLayout(resizeItem(items, key, next.w, next.h, presets));
}

// ─── Adding / removing ──────────────────────────────────────────────────────

export function uniqueKey(items: Array<{ key: string }>, base: string): string {
  const taken = new Set(items.map((item) => item.key));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** First free top-left slot that fits a w × h rectangle. */
export function findFreePosition(
  items: DashboardLayoutItem[],
  w: number,
  h: number,
  columns: number = GRID_COLUMNS,
): { x: number; y: number } {
  const width = Math.min(columns, Math.max(1, w));
  const limit = layoutHeight(items) + h + 1;
  for (let y = 0; y <= limit; y += 1) {
    for (let x = 0; x + width <= columns; x += 1) {
      if (!collidesAny({ x, y, w: width, h }, items)) return { x, y };
    }
  }
  return { x: 0, y: limit };
}

export function addWidgetItem(
  items: DashboardLayoutItem[],
  widget: Pick<DashboardWidgetDefinition, "id" | "sizes" | "defaultSize">,
  size?: DashboardWidgetSize,
): DashboardLayoutItem[] {
  const presets = sizePresetsFor(widget);
  const wanted = size ?? widget.defaultSize;
  const preset = presets.find((entry) => entry.size === wanted) ?? snapToPreset(
    DASHBOARD_GRID.sizes[wanted].w,
    DASHBOARD_GRID.sizes[wanted].h,
    presets,
  );
  const position = findFreePosition(items, preset.w, preset.h);
  const next: DashboardLayoutItem = {
    key: uniqueKey(items, widget.id),
    widgetId: widget.id,
    x: position.x,
    y: position.y,
    w: preset.w,
    h: preset.h,
  };
  return finalizeLayout([...items, next]);
}

export function removeItem(items: DashboardLayoutItem[], key: string): DashboardLayoutItem[] {
  return finalizeLayout(items.filter((item) => item.key !== key));
}

export function updateItemSettings(
  items: DashboardLayoutItem[],
  key: string,
  settings: Record<string, string | number | boolean>,
): DashboardLayoutItem[] {
  return items.map((item) => {
    if (item.key !== key) return item;
    const next = { ...item };
    if (Object.keys(settings).length === 0) delete next.settings;
    else next.settings = settings;
    return next;
  });
}

// ─── Equality (dirty tracking) ──────────────────────────────────────────────

function normalizeForCompare(items: DashboardLayoutItem[]) {
  return [...items]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => ({
      key: item.key,
      widgetId: item.widgetId,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      settings: item.settings ?? {},
      hidden: item.hidden ?? false,
    }));
}

export function layoutsEqual(a: DashboardLayoutItem[], b: DashboardLayoutItem[]): boolean {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

// ─── Pixels ↔ cells ─────────────────────────────────────────────────────────

export interface GridMetrics {
  columns: number;
  columnWidth: number;
  rowHeight: number;
  gap: number;
}

export function gridMetrics(
  containerWidth: number,
  columns: number = GRID_COLUMNS,
  rowHeight: number = GRID_ROW_HEIGHT,
  gap: number = GRID_GAP,
): GridMetrics {
  const usable = Math.max(0, containerWidth - gap * (columns - 1));
  return { columns, columnWidth: usable / columns, rowHeight, gap };
}

export function cellToPixels(rect: GridRect, metrics: GridMetrics) {
  const stepX = metrics.columnWidth + metrics.gap;
  const stepY = metrics.rowHeight + metrics.gap;
  return {
    left: rect.x * stepX,
    top: rect.y * stepY,
    width: rect.w * metrics.columnWidth + (rect.w - 1) * metrics.gap,
    height: rect.h * metrics.rowHeight + (rect.h - 1) * metrics.gap,
  };
}

/** Nearest cell origin for a pixel offset inside the grid container. */
export function pixelsToCell(left: number, top: number, metrics: GridMetrics): { x: number; y: number } {
  const stepX = metrics.columnWidth + metrics.gap;
  const stepY = metrics.rowHeight + metrics.gap;
  return {
    x: stepX > 0 ? Math.round(left / stepX) : 0,
    y: stepY > 0 ? Math.round(top / stepY) : 0,
  };
}

/** Nearest cell span for a pixel size. */
export function pixelsToSpan(width: number, height: number, metrics: GridMetrics): { w: number; h: number } {
  const stepX = metrics.columnWidth + metrics.gap;
  const stepY = metrics.rowHeight + metrics.gap;
  return {
    w: stepX > 0 ? Math.max(1, Math.round((width + metrics.gap) / stepX)) : 1,
    h: stepY > 0 ? Math.max(1, Math.round((height + metrics.gap) / stepY)) : 1,
  };
}
