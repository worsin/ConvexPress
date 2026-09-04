/**
 * Home layout editor — 12-column pointer-driven grid.
 *
 * Drag a card by its header to move it (other cards flow around it), drag the
 * corner handle to resize (snaps to the widget's allowed sizes), or use the
 * keyboard: arrows nudge, Shift+arrows step through sizes, Delete removes.
 * All geometry comes from lib/customer-dashboard/grid.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Lock, Settings2, X } from "lucide-react";

import type { DashboardLayoutItem, DashboardWidgetDefinition } from "@backend/convex/extensions/dashboard/registry";
import { pluginIsEnabled } from "@backend/convex/extensions/dashboard/registry";
import { LucideDynamicIcon } from "@/components/icons/LucideDynamicIcon";
import {
  cellToPixels,
  finalizeLayout,
  gridMetrics,
  GRID_COLUMNS,
  layoutHeight,
  moveItem,
  nudgeItem,
  pixelsToCell,
  pixelsToSpan,
  presetForRect,
  readingOrder,
  removeItem,
  resizeItem,
  sizePresetsFor,
  stepSize,
  type GridMetrics,
} from "@/lib/customer-dashboard/grid";
import { cn } from "@/lib/utils";

interface LayoutGridEditorProps {
  items: DashboardLayoutItem[];
  onChange: (items: DashboardLayoutItem[]) => void;
  widgets: DashboardWidgetDefinition[];
  pluginFlags: Record<string, unknown>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  mobilePreview: boolean;
}

type Gesture =
  | { kind: "move"; key: string; startX: number; startY: number; originLeft: number; originTop: number; dx: number; dy: number }
  | { kind: "resize"; key: string; startX: number; startY: number; originWidth: number; originHeight: number; dx: number; dy: number };

const MIN_ROWS = 4;

export function LayoutGridEditor({ items, onChange, widgets, pluginFlags, selectedKey, onSelect, mobilePreview }: LayoutGridEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [mobilePreview]);

  const metrics = useMemo<GridMetrics>(() => gridMetrics(Math.max(0, width)), [width]);
  const widgetById = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets]);
  const rows = Math.max(MIN_ROWS, layoutHeight(items) + (gesture ? 2 : 0));
  const canvasHeight = rows * (metrics.rowHeight + metrics.gap) - metrics.gap;

  // ── Pointer gestures ──────────────────────────────────────────────────────

  const beginMove = useCallback(
    (event: React.PointerEvent, item: DashboardLayoutItem) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, input, select, textarea, [data-no-drag]")) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      const origin = cellToPixels(item, metrics);
      onSelect(item.key);
      setGesture({ kind: "move", key: item.key, startX: event.clientX, startY: event.clientY, originLeft: origin.left, originTop: origin.top, dx: 0, dy: 0 });
    },
    [metrics, onSelect],
  );

  const beginResize = useCallback(
    (event: React.PointerEvent, item: DashboardLayoutItem) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      const origin = cellToPixels(item, metrics);
      onSelect(item.key);
      setGesture({ kind: "resize", key: item.key, startX: event.clientX, startY: event.clientY, originWidth: origin.width, originHeight: origin.height, dx: 0, dy: 0 });
    },
    [metrics, onSelect],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!gesture) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      setGesture({ ...gesture, dx, dy });
      const current = itemsRef.current;
      if (gesture.kind === "move") {
        const cell = pixelsToCell(gesture.originLeft + dx, gesture.originTop + dy, metrics);
        const next = moveItem(current, gesture.key, cell.x, cell.y);
        if (next !== current) onChange(next);
      } else {
        const item = current.find((entry) => entry.key === gesture.key);
        const widget = item ? widgetById.get(item.widgetId) : undefined;
        if (!item || !widget) return;
        const span = pixelsToSpan(gesture.originWidth + dx, gesture.originHeight + dy, metrics);
        const next = resizeItem(current, gesture.key, span.w, span.h, sizePresetsFor(widget));
        if (next !== current) onChange(next);
      }
    },
    [gesture, metrics, onChange, widgetById],
  );

  const endGesture = useCallback(() => {
    if (!gesture) return;
    setGesture(null);
    const current = itemsRef.current;
    const settled = finalizeLayout(current);
    if (settled !== current) onChange(settled);
  }, [gesture, onChange]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, item: DashboardLayoutItem) => {
      const widget = widgetById.get(item.widgetId);
      const presets = widget ? sizePresetsFor(widget) : [];
      let next: DashboardLayoutItem[] | null = null;
      switch (event.key) {
        case "ArrowUp":
          next = event.shiftKey ? stepSize(items, item.key, presets, 1) : nudgeItem(items, item.key, "up");
          break;
        case "ArrowDown":
          next = event.shiftKey ? stepSize(items, item.key, presets, -1) : nudgeItem(items, item.key, "down");
          break;
        case "ArrowLeft":
          next = event.shiftKey ? stepSize(items, item.key, presets, -1) : nudgeItem(items, item.key, "left");
          break;
        case "ArrowRight":
          next = event.shiftKey ? stepSize(items, item.key, presets, 1) : nudgeItem(items, item.key, "right");
          break;
        case "Delete":
        case "Backspace":
          next = removeItem(items, item.key);
          onSelect(null);
          break;
        case "Enter":
        case " ":
          onSelect(item.key);
          event.preventDefault();
          return;
        default:
          return;
      }
      event.preventDefault();
      if (next && next !== items) onChange(next);
    },
    [items, onChange, onSelect, widgetById],
  );

  // ── Mobile stacking preview ───────────────────────────────────────────────

  if (mobilePreview) {
    const ordered = readingOrder(items);
    return (
      <div className="flex justify-center rounded-xl border border-dashed border-line-strong bg-surface-2/50 p-6">
        <div className="w-[390px] rounded-[28px] border-[6px] border-foreground/80 bg-background p-3 shadow-float">
          <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-line-strong" />
          <div className="flex flex-col gap-3">
            {ordered.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">No widgets yet.</p>}
            {ordered.map((item, index) => {
              const widget = widgetById.get(item.widgetId);
              return (
                <div key={item.key} className="rounded-xl border border-border bg-card p-3 shadow-soft" style={{ minHeight: 56 + Math.min(item.h, 3) * 22 }}>
                  <div className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded-md bg-surface-2 text-[10px] font-semibold text-ink-2">{index + 1}</span>
                    <LucideDynamicIcon name={widget?.icon} className="size-3.5 text-ink-2" />
                    <span className="text-[13px] font-semibold text-foreground">{widget?.title ?? item.widgetId}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop grid ──────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label="Home layout grid"
      aria-rowcount={rows}
      aria-colcount={GRID_COLUMNS}
      className={cn("relative w-full select-none rounded-xl", gesture && "cursor-grabbing")}
      style={{ height: canvasHeight }}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelect(null);
      }}
    >
      {/* Column guides */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, columnGap: metrics.gap }}>
        {Array.from({ length: GRID_COLUMNS }).map((_, index) => (
          <div key={index} className="rounded-md border border-dashed border-border/70 bg-surface-2/40" />
        ))}
      </div>

      {items.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
            Empty layout — add a widget to start.
          </p>
        </div>
      )}

      {items.map((item) => {
        const widget = widgetById.get(item.widgetId);
        const px = cellToPixels(item, metrics);
        const active = gesture?.key === item.key;
        const selected = selectedKey === item.key;
        const enabled = widget ? pluginIsEnabled(widget.pluginId, pluginFlags) : false;
        const presets = widget ? sizePresetsFor(widget) : [];
        const preset = presetForRect(item, presets);
        const style: React.CSSProperties =
          active && gesture?.kind === "move"
            ? { left: gesture.originLeft + gesture.dx, top: gesture.originTop + gesture.dy, width: px.width, height: px.height, zIndex: 20 }
            : active && gesture?.kind === "resize"
              ? { left: px.left, top: px.top, width: Math.max(metrics.columnWidth, gesture.originWidth + gesture.dx), height: Math.max(metrics.rowHeight, gesture.originHeight + gesture.dy), zIndex: 20 }
              : { left: px.left, top: px.top, width: px.width, height: px.height };

        return (
          <div key={item.key} className="contents">
            {active && (
              <div
                aria-hidden="true"
                className="absolute rounded-xl border-2 border-dashed border-primary/60 bg-primary-soft/60"
                style={{ left: px.left, top: px.top, width: px.width, height: px.height, transition: "left 120ms, top 120ms, width 120ms, height 120ms" }}
              />
            )}
            <div
              role="gridcell"
              tabIndex={0}
              aria-label={`${widget?.title ?? item.widgetId}, column ${item.x + 1}, row ${item.y + 1}, ${item.w} by ${item.h}`}
              aria-selected={selected}
              data-widget-key={item.key}
              onKeyDown={(event) => onKeyDown(event, item)}
              onPointerDown={(event) => beginMove(event, item)}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(item.key);
              }}
              className={cn(
                "absolute flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-primary ring-[3px] ring-primary/20" : "border-border",
                active ? "cursor-grabbing shadow-float" : "cursor-grab",
                !enabled && "opacity-70",
                !active && "transition-[left,top,width,height] duration-150",
              )}
              style={{ ...style, touchAction: "none" }}
            >
              <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
                <GripVertical className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                <LucideDynamicIcon name={widget?.icon} className="size-3.5 shrink-0 text-ink-2" />
                <span className="truncate text-[13px] font-semibold tracking-[-0.005em] text-foreground">{widget?.title ?? item.widgetId}</span>
                <span className="ml-auto inline-flex items-center gap-1">
                  <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-ink-2">{preset ? preset.size : `${item.w}×${item.h}`}</span>
                  <button
                    type="button"
                    data-no-drag
                    aria-label={`Settings for ${widget?.title ?? item.widgetId}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(item.key);
                    }}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Settings2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    data-no-drag
                    aria-label={`Remove ${widget?.title ?? item.widgetId}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChange(removeItem(items, item.key));
                      if (selected) onSelect(null);
                    }}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-3">
                {!enabled && (
                  <p className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] text-warning">
                    <Lock className="size-3" aria-hidden="true" />
                    {widget ? `${widget.pluginId} plugin is off — hidden for members` : "Unknown widget"}
                  </p>
                )}
                {widget?.capability && <p className="text-[11px] text-muted-foreground">Needs {widget.capability}</p>}
                <div className="mt-auto flex flex-col gap-1.5 opacity-60" aria-hidden="true">
                  <div className="h-2 w-3/4 rounded bg-surface-2" />
                  <div className="h-2 w-1/2 rounded bg-surface-2" />
                  {item.h > 2 && <div className="h-2 w-2/3 rounded bg-surface-2" />}
                </div>
              </div>
              <button
                type="button"
                data-no-drag
                aria-label={`Resize ${widget?.title ?? item.widgetId}`}
                title={presets.length ? `Sizes: ${presets.map((entry) => entry.size).join(", ")}` : undefined}
                onPointerDown={(event) => beginResize(event, item)}
                onClick={(event) => event.stopPropagation()}
                className="absolute bottom-1 right-1 size-4 cursor-nwse-resize rounded-sm text-muted-foreground/70 hover:text-foreground"
                style={{ touchAction: "none" }}
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M14 6 6 14M14 11l-3 3" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
