/**
 * Layout editing state for the widget grid.
 *
 * Outside customize mode the grid renders the live `myLayout` subscription.
 * In customize mode a local draft is authoritative; every change is applied
 * immediately and persisted through `saveMyLayout` after a 600 ms quiet
 * period (flushed when leaving customize mode). The subscription reflects
 * each save, so other tabs update in real time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import {
  addItem,
  compact,
  cycleSize,
  layoutsEqual,
  moveItem,
  placeItem,
  removeItem,
  resizeItem,
  setHidden,
  sizeCells,
  sizeNameFor,
  updateSettings,
  type GridItem,
} from "../grid";
import type { DashboardGridGeometry, DashboardWidgetDefinition, DashboardWidgetSize, MyLayoutPayload } from "../types";

const SAVE_DEBOUNCE_MS = 600;

export interface LayoutEditor {
  editing: boolean;
  canEdit: boolean;
  items: GridItem[];
  saving: boolean;
  begin: () => void;
  done: () => void;
  reset: () => Promise<void>;
  move: (key: string, x: number, y: number) => void;
  place: (key: string, target: Pick<GridItem, "x" | "y" | "w" | "h">) => void;
  resizeTo: (key: string, size: DashboardWidgetSize) => void;
  cycleSizeOf: (key: string, direction?: 1 | -1) => void;
  hide: (key: string) => void;
  show: (key: string) => void;
  remove: (key: string) => void;
  add: (widget: DashboardWidgetDefinition) => void;
  setSettings: (key: string, settings: Record<string, string | number | boolean>) => void;
}

export function useLayoutEditor(
  layout: MyLayoutPayload | null | undefined,
  widgets: DashboardWidgetDefinition[],
  grid: DashboardGridGeometry,
): LayoutEditor {
  const saveMyLayout = useMutation(api.extensions.dashboard.mutations.saveMyLayout);
  const resetMyLayout = useMutation(api.extensions.dashboard.mutations.resetMyLayout);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GridItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<GridItem[] | null>(null);
  const lastSaved = useRef<GridItem[] | null>(null);
  const scope = layout?.scope ?? "default";
  const widgetById = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets]);

  const serverItems = useMemo(() => layout?.items ?? [], [layout?.items]);
  const items = editing && draft ? draft : serverItems;
  const resizeItemCells = useCallback(
    (current: GridItem[], key: string, size: DashboardWidgetSize) => {
      const cells = sizeCells(size, grid);
      return resizeItem(current, key, cells.w, cells.h, grid);
    },
    [grid],
  );

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    pending.current = null;
    if (!next || (lastSaved.current && layoutsEqual(lastSaved.current, next))) return;
    setSaving(true);
    try {
      await saveMyLayout({ baseScope: scope, items: next });
      lastSaved.current = next;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your dashboard layout");
    } finally {
      setSaving(false);
    }
  }, [saveMyLayout, scope]);

  const schedule = useCallback(
    (next: GridItem[]) => {
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void flush();
    },
    [flush],
  );

  const apply = useCallback(
    (fn: (current: GridItem[]) => GridItem[]) => {
      setDraft((current) => {
        const base = current ?? serverItems;
        const next = fn(base);
        if (layoutsEqual(base, next)) return current;
        schedule(next);
        return next;
      });
    },
    [schedule, serverItems],
  );

  const begin = useCallback(() => {
    lastSaved.current = serverItems;
    setDraft(compact(serverItems.map((item) => ({ ...item }))));
    setEditing(true);
  }, [serverItems]);

  const done = useCallback(() => {
    void flush();
    setEditing(false);
    setDraft(null);
  }, [flush]);

  const reset = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    setEditing(false);
    setDraft(null);
    try {
      await resetMyLayout({});
      toast.success("Dashboard reset to the site default");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset your dashboard");
    }
  }, [resetMyLayout]);

  return {
    editing,
    canEdit: layout?.canEdit === true,
    items,
    saving,
    begin,
    done,
    reset,
    move: (key, x, y) => apply((current) => moveItem(current, key, x, y, grid)),
    place: (key, target) => apply((current) => placeItem(current, key, target, grid)),
    resizeTo: (key, size) => apply((current) => resizeItemCells(current, key, size)),
    cycleSizeOf: (key, direction = 1) =>
      apply((current) => {
        const item = current.find((entry) => entry.key === key);
        const widget = item ? widgetById.get(item.widgetId) : undefined;
        if (!item || !widget) return current;
        const next = cycleSize(sizeNameFor(item, grid), widget.sizes, direction);
        return resizeItemCells(current, key, next);
      }),
    hide: (key) => apply((current) => setHidden(current, key, true, grid)),
    show: (key) => apply((current) => setHidden(current, key, false, grid)),
    remove: (key) => apply((current) => removeItem(current, key)),
    add: (widget) => apply((current) => addItem(current, widget, grid)),
    setSettings: (key, settings) => apply((current) => updateSettings(current, key, settings)),
  };
}
