/**
 * Widget grid geometry (pure, unit-tested).
 *
 * Twelve-column grid; items are {x, y, w, h} in cells. Every write-side
 * operation returns a new, collision-free, vertically compacted array so the
 * server (which re-normalizes) and the client always agree.
 */

import {
  DEFAULT_DASHBOARD_GRID,
  type DashboardGridGeometry,
  type DashboardLayoutItem,
  type DashboardWidgetDefinition,
  type DashboardWidgetSize,
} from "./types";

export type GridItem = DashboardLayoutItem;

export const MIN_ITEM_WIDTH = 2;
export const MIN_ITEM_HEIGHT = 1;
export const MAX_ITEM_HEIGHT = 12;

export function collides(a: GridItem, b: GridItem): boolean {
  if (a.key === b.key) return false;
  if (a.x + a.w <= b.x || b.x + b.w <= a.x) return false;
  if (a.y + a.h <= b.y || b.y + b.h <= a.y) return false;
  return true;
}

export function firstCollision(item: GridItem, items: GridItem[]): GridItem | undefined {
  return items.find((other) => !other.hidden && collides(item, other));
}

/** Visible items sorted top-left first (the order compaction and mobile use). */
export function sortByPosition(items: GridItem[]): GridItem[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key));
}

export function clampItem(item: GridItem, grid: DashboardGridGeometry = DEFAULT_DASHBOARD_GRID): GridItem {
  const w = Math.min(grid.columns, Math.max(MIN_ITEM_WIDTH, Math.round(item.w)));
  const h = Math.min(MAX_ITEM_HEIGHT, Math.max(MIN_ITEM_HEIGHT, Math.round(item.h)));
  const x = Math.min(grid.columns - w, Math.max(0, Math.round(item.x)));
  const y = Math.max(0, Math.round(item.y));
  return { ...item, x, y, w, h };
}

/**
 * Pulls every visible item up as far as it can go without overlapping an
 * item placed before it (top-left order). Hidden items keep their geometry.
 */
export function compact(items: GridItem[]): GridItem[] {
  const placed: GridItem[] = [];
  const result = new Map<string, GridItem>();
  for (const item of sortByPosition(items.filter((entry) => !entry.hidden))) {
    let candidate = { ...item };
    while (candidate.y > 0) {
      const probe = { ...candidate, y: candidate.y - 1 };
      if (firstCollision(probe, placed)) break;
      candidate = probe;
    }
    placed.push(candidate);
    result.set(candidate.key, candidate);
  }
  return items.map((item) => result.get(item.key) ?? item);
}

/**
 * Places `key` at (x, y, w, h), pushing any overlapping item downward until
 * nothing overlaps, then compacts. The moved item is pinned so the push never
 * displaces it back.
 */
export function placeItem(
  items: GridItem[],
  key: string,
  target: Pick<GridItem, "x" | "y" | "w" | "h">,
  grid: DashboardGridGeometry = DEFAULT_DASHBOARD_GRID,
): GridItem[] {
  const index = items.findIndex((item) => item.key === key);
  if (index === -1) return items;
  const moved = clampItem({ ...items[index], ...target }, grid);
  const working = items.map((item) => (item.key === key ? moved : { ...item }));
  const pinned = new Set<string>([key]);
  let guard = 0;
  let changed = true;
  while (changed && guard < 500) {
    changed = false;
    guard += 1;
    for (const item of sortByPosition(working.filter((entry) => !entry.hidden))) {
      if (pinned.has(item.key)) continue;
      const blocker = firstCollision(item, working.filter((entry) => pinned.has(entry.key) || sortIndex(working, entry) < sortIndex(working, item)));
      if (blocker) {
        item.y = blocker.y + blocker.h;
        changed = true;
      }
    }
  }
  return compactWithPinned(working, pinned);
}

function sortIndex(items: GridItem[], item: GridItem): number {
  return sortByPosition(items).findIndex((entry) => entry.key === item.key);
}

/** Compaction that leaves pinned items where they are. */
function compactWithPinned(items: GridItem[], pinned: Set<string>): GridItem[] {
  const placed: GridItem[] = items.filter((item) => pinned.has(item.key) && !item.hidden).map((item) => ({ ...item }));
  const result = new Map<string, GridItem>(placed.map((item) => [item.key, item]));
  for (const item of sortByPosition(items.filter((entry) => !entry.hidden && !pinned.has(entry.key)))) {
    let candidate = { ...item };
    while (candidate.y > 0) {
      const probe = { ...candidate, y: candidate.y - 1 };
      if (firstCollision(probe, placed)) break;
      candidate = probe;
    }
    placed.push(candidate);
    result.set(candidate.key, candidate);
  }
  return items.map((item) => result.get(item.key) ?? item);
}

export function moveItem(items: GridItem[], key: string, x: number, y: number, grid = DEFAULT_DASHBOARD_GRID): GridItem[] {
  const item = items.find((entry) => entry.key === key);
  if (!item) return items;
  return placeItem(items, key, { x, y, w: item.w, h: item.h }, grid);
}

export function resizeItem(items: GridItem[], key: string, w: number, h: number, grid = DEFAULT_DASHBOARD_GRID): GridItem[] {
  const item = items.find((entry) => entry.key === key);
  if (!item) return items;
  return placeItem(items, key, { x: item.x, y: item.y, w, h }, grid);
}

/** Cell size for a named widget size. */
export function sizeCells(size: DashboardWidgetSize, grid = DEFAULT_DASHBOARD_GRID): { w: number; h: number } {
  return grid.sizes[size] ?? grid.sizes.md;
}

/** The named size whose cells match the item exactly, if any. */
export function sizeNameFor(item: Pick<GridItem, "w" | "h">, grid = DEFAULT_DASHBOARD_GRID): DashboardWidgetSize | null {
  for (const name of ["sm", "md", "lg", "xl"] as const) {
    const cells = grid.sizes[name];
    if (cells && cells.w === item.w && cells.h === item.h) return name;
  }
  return null;
}

/** Nearest named size to a raw (w, h) — used while dragging the resize handle. */
export function nearestSize(
  w: number,
  h: number,
  allowed: DashboardWidgetSize[],
  grid = DEFAULT_DASHBOARD_GRID,
): DashboardWidgetSize {
  const candidates = allowed.length ? allowed : (["md"] as DashboardWidgetSize[]);
  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const name of candidates) {
    const cells = sizeCells(name, grid);
    const score = Math.abs(cells.w - w) + Math.abs(cells.h - h) * 1.5;
    // "<=" so a tie between two sizes prefers the larger one (sizes are ordered).
    if (score <= bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

/** Snaps an item's geometry to one of the widget's allowed sizes. */
export function snapToAllowedSize(
  item: GridItem,
  widget: Pick<DashboardWidgetDefinition, "sizes" | "defaultSize"> | undefined,
  grid = DEFAULT_DASHBOARD_GRID,
): GridItem {
  if (!widget) return clampItem(item, grid);
  const current = sizeNameFor(item, grid);
  if (current && widget.sizes.includes(current)) return clampItem(item, grid);
  const cells = sizeCells(nearestSize(item.w, item.h, widget.sizes, grid), grid);
  return clampItem({ ...item, w: cells.w, h: cells.h }, grid);
}

/** The next allowed size after `current` (wraps), for keyboard resizing. */
export function cycleSize(current: DashboardWidgetSize | null, allowed: DashboardWidgetSize[], direction: 1 | -1 = 1): DashboardWidgetSize {
  const order: DashboardWidgetSize[] = ["sm", "md", "lg", "xl"];
  const sizes = order.filter((name) => allowed.includes(name));
  if (sizes.length === 0) return "md";
  const index = current ? sizes.indexOf(current) : -1;
  const next = (index + direction + sizes.length) % sizes.length;
  return sizes[next];
}

/** First free top-left position where a (w × h) item fits, scanning rows. */
export function findFreeSpot(items: GridItem[], w: number, h: number, grid = DEFAULT_DASHBOARD_GRID): { x: number; y: number } {
  const visible = items.filter((item) => !item.hidden);
  const maxY = visible.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x + w <= grid.columns; x += 1) {
      const probe: GridItem = { key: "__probe__", widgetId: "", x, y, w, h };
      if (!firstCollision(probe, visible)) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}

/** Unique key for a new instance of `widgetId`. */
export function nextInstanceKey(items: GridItem[], widgetId: string): string {
  const taken = new Set(items.map((item) => item.key));
  if (!taken.has(widgetId)) return widgetId;
  let n = 2;
  while (taken.has(`${widgetId}-${n}`)) n += 1;
  return `${widgetId}-${n}`;
}

export function addItem(
  items: GridItem[],
  widget: Pick<DashboardWidgetDefinition, "id" | "sizes" | "defaultSize">,
  grid = DEFAULT_DASHBOARD_GRID,
): GridItem[] {
  const cells = sizeCells(widget.defaultSize, grid);
  const spot = findFreeSpot(items, cells.w, cells.h, grid);
  const item: GridItem = { key: nextInstanceKey(items, widget.id), widgetId: widget.id, ...spot, ...cells };
  return compact([...items, item]);
}

export function removeItem(items: GridItem[], key: string): GridItem[] {
  return compact(items.filter((item) => item.key !== key));
}

export function setHidden(items: GridItem[], key: string, hidden: boolean, grid = DEFAULT_DASHBOARD_GRID): GridItem[] {
  const target = items.find((item) => item.key === key);
  if (!target) return items;
  if (hidden) {
    return compact(items.map((item) => (item.key === key ? { ...item, hidden: true } : item)));
  }
  const rest = items.filter((item) => item.key !== key);
  const spot = findFreeSpot(rest, target.w, target.h, grid);
  const { hidden: _hidden, ...restored } = target;
  void _hidden;
  return compact([...rest, { ...restored, ...spot }]);
}

export function updateSettings(
  items: GridItem[],
  key: string,
  settings: Record<string, string | number | boolean>,
): GridItem[] {
  return items.map((item) => (item.key === key ? { ...item, settings: { ...item.settings, ...settings } } : item));
}

/** Total rows used by visible items. */
export function gridHeight(items: GridItem[]): number {
  return items.filter((item) => !item.hidden).reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
}

/** Converts a pixel delta into whole cells given the rendered grid width. */
export function pixelsToCells(
  deltaX: number,
  deltaY: number,
  containerWidth: number,
  grid = DEFAULT_DASHBOARD_GRID,
): { dx: number; dy: number } {
  const columnWidth = (containerWidth - grid.gap * (grid.columns - 1)) / grid.columns;
  const cellX = columnWidth + grid.gap;
  const cellY = grid.rowHeight + grid.gap;
  return { dx: Math.round(deltaX / cellX), dy: Math.round(deltaY / cellY) };
}

/** Layouts are equal when every visible item's geometry, settings, and visibility match. */
export function layoutsEqual(a: GridItem[], b: GridItem[]): boolean {
  if (a.length !== b.length) return false;
  const byKey = new Map(b.map((item) => [item.key, item]));
  return a.every((item) => {
    const other = byKey.get(item.key);
    if (!other) return false;
    return (
      item.widgetId === other.widgetId &&
      item.x === other.x &&
      item.y === other.y &&
      item.w === other.w &&
      item.h === other.h &&
      Boolean(item.hidden) === Boolean(other.hidden) &&
      JSON.stringify(item.settings ?? {}) === JSON.stringify(other.settings ?? {})
    );
  });
}
