/**
 * WidgetGridView — the dashboard home (presentational).
 *
 * Renders the member's layout on a 12-column grid (DASHBOARD_GRID geometry
 * from the server), one card per visible layout item, and — when the site
 * allows it — lets the member customize: drag to move, resize to the
 * widget's allowed sizes, hide/show, add from the picker, per-widget
 * settings, and reset to the site default. The layout query and the editor
 * (debounced writes through the live subscription) live in the page loader
 * (dashboard/pages/home/HomePage.tsx); this view only receives them.
 *
 * Mobile renders the visible widgets stacked in reading order (y, then x).
 */

import { useCallback, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, Eye, LayoutGrid, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DashboardWidgetProps } from "./contracts";
import {
  DEFAULT_DASHBOARD_GRID,
  type DashboardGridGeometry,
  type DashboardWidgetDefinition,
  type DashboardWidgetSize,
  type MyLayoutPayload,
} from "./types";
import { nearestSize, pixelsToCells, sizeCells, sizeNameFor, sortByPosition, type GridItem } from "./grid";
import { WidgetCard, WidgetEmpty } from "./grid/WidgetCard";
import { WidgetPicker } from "./grid/WidgetPicker";
import { WidgetSettingsDialog, resolveWidgetSettings } from "./grid/WidgetSettingsDialog";
import type { LayoutEditor } from "./grid/useLayoutEditor";
import { getWidgetModule } from "./registry";

export interface WidgetGridViewProps {
  status: "loading" | "signedOut" | "ready";
  layout: MyLayoutPayload | null;
  grid: DashboardGridGeometry;
  widgets: DashboardWidgetDefinition[];
  availableWidgetIds: string[];
  editor: LayoutEditor;
}

export function WidgetGridView({ status, layout, grid, widgets, availableWidgetIds, editor }: WidgetGridViewProps) {
  const widgetById = new Map(widgets.map((widget) => [widget.id, widget]));

  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsKey, setSettingsKey] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  if (status === "loading" || !layout) {
    if (status === "signedOut") return <WidgetEmpty icon="layout-grid" title="Sign in to see your dashboard" />;
    return <GridSkeleton />;
  }

  const visible = sortByPosition(editor.items.filter((item) => !item.hidden));
  const hidden = editor.items.filter((item) => item.hidden);
  const settingsItem = settingsKey ? editor.items.find((item) => item.key === settingsKey) : undefined;
  const settingsWidget = settingsItem ? widgetById.get(settingsItem.widgetId) : undefined;
  const availableIds = new Set(availableWidgetIds);

  return (
    <div data-slot="dashboard-widget-grid" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm font-medium text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {editor.editing
              ? "Drag the handle to move, use the size button to resize, hide what you do not need."
              : "Your overview, built from widgets."}
          </p>
        </div>
        {editor.canEdit && (
          <div className="flex items-center gap-1.5" role="toolbar" aria-label="Dashboard layout">
            {editor.editing ? (
              <>
                <ToolbarButton onClick={() => setPickerOpen(true)} icon={Plus}>
                  Add widget
                </ToolbarButton>
                <ToolbarButton onClick={() => setResetOpen(true)} icon={RotateCcw}>
                  Reset
                </ToolbarButton>
                <ToolbarButton onClick={editor.done} icon={Check} primary>
                  {editor.saving ? "Saving…" : "Done"}
                </ToolbarButton>
              </>
            ) : (
              <ToolbarButton onClick={editor.begin} icon={SlidersHorizontal}>
                Customize
              </ToolbarButton>
            )}
          </div>
        )}
      </div>

      {layout.baseChanged && !noticeDismissed && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
        >
          <span>The site&apos;s default dashboard changed since you customized yours.</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setResetOpen(true)} className="font-medium text-primary hover:underline">
              Use the new default
            </button>
            <button type="button" onClick={() => setNoticeDismissed(true)} className="text-muted-foreground hover:text-foreground">
              Keep mine
            </button>
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="border border-dashed border-border py-12">
          <WidgetEmpty
            icon="layout-grid"
            title="Nothing on your dashboard yet"
            description={editor.canEdit ? "Add a widget to get started." : "The site has not placed any widgets here."}
            action={
              editor.canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!editor.editing) editor.begin();
                    setPickerOpen(true);
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  Add a widget
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Board items={visible} editor={editor} widgetById={widgetById} grid={grid} onOpenSettings={setSettingsKey} />
      )}

      {editor.editing && hidden.length > 0 && (
        <div className="border border-border bg-muted/30 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hidden widgets</p>
          <ul role="list" className="flex flex-wrap gap-2">
            {hidden.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => editor.show(item.key)}
                  className="inline-flex h-8 items-center gap-1.5 border border-border bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  Show {widgetById.get(item.widgetId)?.title ?? item.widgetId}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <WidgetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        widgets={widgets}
        presentIds={new Set(editor.items.map((item) => item.widgetId))}
        availableIds={availableIds}
        onAdd={(widget) => editor.add(widget)}
      />

      {settingsItem && settingsWidget && (
        <WidgetSettingsDialog
          open
          onOpenChange={(open) => !open && setSettingsKey(null)}
          widget={settingsWidget}
          values={resolveWidgetSettings(settingsWidget, settingsItem.settings)}
          onSave={(values) => editor.setSettings(settingsItem.key, values)}
        />
      )}

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset your dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              Your arrangement, sizes, hidden widgets, and widget settings go back to the site default. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep mine</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setResetOpen(false);
                setNoticeDismissed(true);
                void editor.reset();
              }}
            >
              Reset to default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Board ──────────────────────────────────────────────────────────────────

interface BoardProps {
  items: GridItem[];
  editor: LayoutEditor;
  widgetById: Map<string, DashboardWidgetDefinition>;
  grid: typeof DEFAULT_DASHBOARD_GRID;
  onOpenSettings: (key: string) => void;
}

interface DragState {
  key: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origin: GridItem;
  width: number;
  lastDx: number;
  lastDy: number;
}

function Board({ items, editor, widgetById, grid, onOpenSettings }: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const startDrag = useCallback(
    (event: PointerEvent<HTMLElement>, key: string, mode: "move" | "resize") => {
      if (!editor.editing) return;
      const origin = items.find((item) => item.key === key);
      const width = boardRef.current?.getBoundingClientRect().width ?? 0;
      if (!origin || width === 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { key, mode, startX: event.clientX, startY: event.clientY, origin, width, lastDx: 0, lastDy: 0 };
      setActiveKey(key);
    },
    [editor.editing, items],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const state = drag.current;
      if (!state) return;
      const { dx, dy } = pixelsToCells(event.clientX - state.startX, event.clientY - state.startY, state.width, grid);
      if (dx === state.lastDx && dy === state.lastDy) return;
      state.lastDx = dx;
      state.lastDy = dy;
      if (state.mode === "move") {
        editor.move(state.key, state.origin.x + dx, state.origin.y + dy);
      } else {
        const widget = widgetById.get(state.origin.widgetId);
        const allowed = widget?.sizes ?? (["md"] as DashboardWidgetSize[]);
        const size = nearestSize(state.origin.w + dx, state.origin.h + dy, allowed, grid);
        const cells = sizeCells(size, grid);
        editor.place(state.key, { x: state.origin.x, y: state.origin.y, w: cells.w, h: cells.h });
      }
    },
    [editor, grid, widgetById],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    setActiveKey(null);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, item: GridItem) => {
      if (!editor.editing) return;
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (event.shiftKey && (event.key === "ArrowRight" || event.key === "ArrowUp")) {
        handled();
        editor.cycleSizeOf(item.key, 1);
      } else if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowDown")) {
        handled();
        editor.cycleSizeOf(item.key, -1);
      } else if (event.key === "ArrowLeft") {
        handled();
        editor.move(item.key, item.x - 1, item.y);
      } else if (event.key === "ArrowRight") {
        handled();
        editor.move(item.key, item.x + 1, item.y);
      } else if (event.key === "ArrowUp") {
        handled();
        editor.move(item.key, item.x, item.y - 1);
      } else if (event.key === "ArrowDown") {
        handled();
        editor.move(item.key, item.x, item.y + 1);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        handled();
        editor.hide(item.key);
      }
    },
    [editor],
  );

  return (
    <div
      ref={boardRef}
      data-editing={editor.editing ? "true" : "false"}
      className={cn("flex flex-col gap-4 md:grid", editor.editing && "md:bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] md:bg-[length:16px_16px]")}
      style={{
        gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
        gridAutoRows: `${grid.rowHeight}px`,
        gap: `${grid.gap}px`,
      }}
    >
      {items.map((item, index) => {
        const definition = widgetById.get(item.widgetId);
        const size = sizeNameFor(item, grid) ?? nearestSize(item.w, item.h, definition?.sizes ?? ["md"], grid);
        return (
          <div
            key={item.key}
            data-widget-key={item.key}
            role={editor.editing ? "group" : undefined}
            tabIndex={editor.editing ? 0 : undefined}
            aria-label={editor.editing ? `${definition?.title ?? item.widgetId}: arrow keys move, shift+arrows resize, delete hides` : undefined}
            onKeyDown={(event) => onKeyDown(event, item)}
            className={cn(
              "relative min-h-40 outline-hidden md:min-h-0",
              editor.editing && "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              activeKey === item.key && "z-10 opacity-90",
            )}
            style={{
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
              order: index,
            }}
          >
            <WidgetHost
              item={item}
              definition={definition}
              size={size}
              editor={editor}
              onOpenSettings={() => onOpenSettings(item.key)}
              dragHandleProps={{
                onPointerDown: (event) => startDrag(event, item.key, "move"),
                onPointerMove,
                onPointerUp: endDrag,
                onPointerCancel: endDrag,
              }}
            />
            {editor.editing && (
              <button
                type="button"
                aria-label={`Resize ${definition?.title ?? item.widgetId}`}
                onPointerDown={(event) => startDrag(event, item.key, "resize")}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute bottom-0 right-0 hidden size-4 cursor-nwse-resize touch-none items-end justify-end p-0.5 text-muted-foreground hover:text-foreground md:flex"
              >
                <span aria-hidden="true" className="block size-2 border-b-2 border-r-2 border-current" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Widget host ────────────────────────────────────────────────────────────

interface WidgetHostProps {
  item: GridItem;
  definition: DashboardWidgetDefinition | undefined;
  size: DashboardWidgetSize;
  editor: LayoutEditor;
  onOpenSettings: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
}

function WidgetHost({ item, definition, size, editor, onOpenSettings, dragHandleProps }: WidgetHostProps) {
  const titleId = useId();
  const module = getWidgetModule(item.widgetId);
  const props: DashboardWidgetProps = {
    instanceKey: item.key,
    size,
    settings: resolveWidgetSettings(definition, item.settings),
    editing: editor.editing,
  };
  const title =
    typeof module?.title === "function" ? module.title(props) : module?.title ?? definition?.title ?? item.widgetId;
  const Actions = module?.Actions;

  return (
    <WidgetCard
      titleId={titleId}
      title={title}
      icon={definition?.icon}
      actions={Actions ? <Actions {...props} /> : undefined}
      editing={editor.editing}
      size={sizeNameFor(item)}
      hasSettings={Boolean(definition?.settings?.length)}
      onCycleSize={definition && definition.sizes.length > 1 ? () => editor.cycleSizeOf(item.key) : undefined}
      onOpenSettings={onOpenSettings}
      onHide={() => editor.hide(item.key)}
      dragHandleProps={dragHandleProps}
    >
      {module ? (
        <module.Widget {...props} />
      ) : (
        <WidgetEmpty
          icon="layout-grid"
          title="Widget unavailable"
          description={`No website module for "${item.widgetId}" yet. Add dashboard/widgets/${item.widgetId}/manifest.tsx.`}
        />
      )}
    </WidgetCard>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  icon: Icon,
  children,
  primary = false,
}: {
  onClick: () => void;
  icon: typeof LayoutGrid;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1 h-3 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <Skeleton className="h-52 md:col-span-6" />
        <Skeleton className="h-52 md:col-span-6" />
        <Skeleton className="h-52 md:col-span-4" />
        <Skeleton className="h-52 md:col-span-4" />
        <Skeleton className="h-52 md:col-span-4" />
      </div>
    </div>
  );
}
