/**
 * FooterRowsBuilder — admin UI for the v2 block-style footer.
 *
 * Top-level layout is `rows → columns → cell`. The user drags rows to reorder
 * them, drags cells within a row to reorder columns, picks a width per cell,
 * and edits each cell with its dedicated editor (FooterCellEditors).
 *
 * Edits the Customizer draft only. When the user chooses conversion on an
 * empty rows config, we seed `rows` from
 * the legacy section toggles so nothing visually disappears on the Website.
 */

import { useState, useCallback, useMemo, useRef, type SetStateAction } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FOOTER_DEFAULTS } from "./constants";
import { FooterCellEditor } from "./FooterCellEditors";
import {
  FOOTER_CELL_CATALOG,
  FOOTER_ROW_BACKGROUND_OPTIONS,
  FOOTER_ROW_BORDER_OPTIONS,
  FOOTER_ROW_CONTAINER_OPTIONS,
  FOOTER_ROW_PADDING_OPTIONS,
  convertLegacyFooterToRows,
  makeColumn,
  makeDefaultCell,
  makeRow,
} from "./footerRowsHelpers";
import type {
  FooterCell,
  FooterCellType,
  FooterColumn,
  FooterConfig,
  FooterNavCell,
  FooterRow,
} from "./types";

function deepMerge<T extends object>(
  defaults: T,
  overrides: Partial<T> | null | undefined,
): T {
  if (!overrides) return { ...defaults };
  const result = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const defVal = (defaults as Record<string, unknown>)[key];
    const overVal = (overrides as Record<string, unknown>)[key];
    if (
      defVal &&
      typeof defVal === "object" &&
      !Array.isArray(defVal) &&
      overVal &&
      typeof overVal === "object" &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        defVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else if (overVal !== undefined) {
      result[key] = overVal;
    }
  }
  return result as T;
}

function makeFooterPresetRows(preset: "classic" | "newsletter" | "minimal"): FooterRow[] {
  if (preset === "minimal") {
    return [
      makeRow([
        makeColumn(makeDefaultCell("copyright"), 8),
        makeColumn(makeDefaultCell("social"), 4),
      ]),
    ];
  }

  if (preset === "newsletter") {
    return [
      makeRow([
        makeColumn(makeDefaultCell("brand"), 4),
        makeColumn(makeDefaultCell("newsletter"), 8),
      ]),
      makeRow([
        makeColumn(makeDefaultCell("nav"), 4),
        makeColumn({ ...(makeDefaultCell("nav") as FooterNavCell), menuLocation: "footer-2" }, 4),
        makeColumn(makeDefaultCell("social"), 4),
      ]),
      makeRow([makeColumn(makeDefaultCell("copyright"), 12)]),
    ];
  }

  return [
    makeRow([
      makeColumn(makeDefaultCell("brand"), 3),
      makeColumn(makeDefaultCell("nav"), 3),
      makeColumn({ ...(makeDefaultCell("nav") as FooterNavCell), menuLocation: "footer-2" }, 3),
      makeColumn(makeDefaultCell("contact"), 3),
    ]),
    makeRow([
      makeColumn(makeDefaultCell("copyright"), 8),
      makeColumn(makeDefaultCell("social"), 4),
    ]),
  ];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FooterRowsBuilder({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const merged: FooterConfig = useMemo(
    () => deepMerge(FOOTER_DEFAULTS, value as Partial<FooterConfig>),
    [value],
  );
  const controlled = useRef({ merged, onChange });
  controlled.current = { merged, onChange };
  const rows = merged.rows ?? [];
  const setRows = useCallback((next: SetStateAction<FooterRow[]>) => {
    const current = controlled.current;
    const nextRows = typeof next === "function" ? next(current.merged.rows ?? []) : next;
    current.onChange({ ...current.merged, rows: nextRows });
  }, []);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [expandedCellIds, setExpandedCellIds] = useState<Set<string>>(new Set());
  const [cellPickerForRow, setCellPickerForRow] = useState<string | null>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const patchRow = useCallback(
    (rowId: string, patch: Partial<FooterRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const patchColumn = useCallback(
    (rowId: string, colId: string, patch: Partial<FooterColumn>) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id !== rowId
            ? r
            : {
                ...r,
                columns: r.columns.map((c) =>
                  c.id === colId ? { ...c, ...patch } : c,
                ),
              },
        ),
      );
    },
    [],
  );

  const patchCell = useCallback(
    (rowId: string, colId: string, next: FooterCell) => {
      patchColumn(rowId, colId, { cell: next });
    },
    [patchColumn],
  );

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      makeRow([makeColumn(makeDefaultCell("text"))]),
    ]);
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const addCellToRow = useCallback((rowId: string, type: FooterCellType) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id !== rowId
          ? r
          : {
              ...r,
              columns: [...r.columns, makeColumn(makeDefaultCell(type))],
            },
      ),
    );
    setCellPickerForRow(null);
  }, []);

  const removeCell = useCallback((rowId: string, colId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id !== rowId
          ? r
          : { ...r, columns: r.columns.filter((c) => c.id !== colId) },
      ),
    );
  }, []);

  const handleRowDragEnd = useCallback((evt: DragEndEvent) => {
    const { active, over } = evt;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === active.id);
      const to = prev.findIndex((r) => r.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }, []);

  const handleColumnDragEnd = useCallback(
    (rowId: string, evt: DragEndEvent) => {
      const { active, over } = evt;
      if (!over || active.id === over.id) return;
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          const from = r.columns.findIndex((c) => c.id === active.id);
          const to = r.columns.findIndex((c) => c.id === over.id);
          if (from < 0 || to < 0) return r;
          return { ...r, columns: arrayMove(r.columns, from, to) };
        }),
      );
    },
    [],
  );

  const toggleRowExpanded = useCallback((id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCellExpanded = useCallback((id: string) => {
    setExpandedCellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConvertFromLegacy = useCallback(() => {
    const fresh = convertLegacyFooterToRows(merged);
    setRows(fresh);
    // Auto-expand the new rows so the user immediately sees them.
    setExpandedRowIds(new Set(fresh.map((r) => r.id)));
  }, [merged]);

  const applyPreset = useCallback((preset: "classic" | "newsletter" | "minimal") => {
    const nextRows = makeFooterPresetRows(preset);
    setRows(nextRows);
    setExpandedRowIds(new Set(nextRows.map((row) => row.id)));
  }, []);

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-border bg-muted/20 p-8 text-center">
        <h3 className="text-base font-semibold text-foreground">
          The footer builder is empty
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Build a custom footer with rows of mixed content cells — text,
          menus, social, newsletter, and more.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" />
            Add empty row
          </Button>
          <Button type="button" variant="outline" onClick={handleConvertFromLegacy}>
            Convert from current sections
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("classic")}>
            Classic preset
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("newsletter")}>
            Newsletter preset
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("minimal")}>
            Minimal preset
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          The Website uses your footer sections until you publish a row layout.
        </p>
      </div>
    );
  }

  // ─── Builder ──────────────────────────────────────────────────────────────
  return (
    <div className="@container/footer-builder flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-3 @min-[40rem]/footer-builder:flex-row @min-[40rem]/footer-builder:items-center @min-[40rem]/footer-builder:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Footer Builder</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Drag to reorder. Click a row or cell to edit. Changes stay in your draft until published.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("classic")}>
            Classic
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("newsletter")}>
            Newsletter
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("minimal")}>
            Minimal
          </Button>
        </div>
      </div>

      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleRowDragEnd}
      >
        <SortableContext
          items={rows.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
            {rows.map((row, idx) => (
              <SortableRow
                key={row.id}
                row={row}
                index={idx}
                expanded={expandedRowIds.has(row.id)}
                onToggleExpanded={() => toggleRowExpanded(row.id)}
                onPatchRow={(patch) => patchRow(row.id, patch)}
                onPatchColumn={(colId, patch) => patchColumn(row.id, colId, patch)}
                onPatchCell={(colId, next) => patchCell(row.id, colId, next)}
                onColumnDragEnd={(evt) => handleColumnDragEnd(row.id, evt)}
                onRemoveCell={(colId) => removeCell(row.id, colId)}
                onRemoveRow={() => removeRow(row.id)}
                expandedCellIds={expandedCellIds}
                onToggleCellExpanded={toggleCellExpanded}
                isCellPickerOpen={cellPickerForRow === row.id}
                onOpenCellPicker={() => setCellPickerForRow(row.id)}
                onCloseCellPicker={() => setCellPickerForRow(null)}
                onAddCell={(type) => addCellToRow(row.id, type)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        className="self-start"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add row
      </Button>
    </div>
  );
}

// ─── Sortable row ────────────────────────────────────────────────────────────

interface SortableRowProps {
  row: FooterRow;
  index: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPatchRow: (patch: Partial<FooterRow>) => void;
  onPatchColumn: (colId: string, patch: Partial<FooterColumn>) => void;
  onPatchCell: (colId: string, next: FooterCell) => void;
  onColumnDragEnd: (evt: DragEndEvent) => void;
  onRemoveCell: (colId: string) => void;
  onRemoveRow: () => void;
  expandedCellIds: Set<string>;
  onToggleCellExpanded: (id: string) => void;
  isCellPickerOpen: boolean;
  onOpenCellPicker: () => void;
  onCloseCellPicker: () => void;
  onAddCell: (type: FooterCellType) => void;
}

function SortableRow({
  row,
  index,
  expanded,
  onToggleExpanded,
  onPatchRow,
  onPatchColumn,
  onPatchCell,
  onColumnDragEnd,
  onRemoveCell,
  onRemoveRow,
  expandedCellIds,
  onToggleCellExpanded,
  isCellPickerOpen,
  onOpenCellPicker,
  onCloseCellPicker,
  onAddCell,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const colSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border bg-card"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-2 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag row"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left text-sm font-medium text-foreground"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span>Row {index + 1}</span>
          <span className="text-xs text-muted-foreground">
            ({row.columns.length} cell{row.columns.length === 1 ? "" : "s"} ·{" "}
            {row.background} · {row.padding} pad)
          </span>
        </button>
        <button
          type="button"
          onClick={onRemoveRow}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove row"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 p-3">
          {/* Row settings */}
          <div className="grid grid-cols-2 gap-2 @min-[32rem]/footer-builder:grid-cols-4">
            <RowSelect
              label="Background"
              value={row.background}
              onChange={(v) =>
                onPatchRow({ background: v as FooterRow["background"] })
              }
              options={FOOTER_ROW_BACKGROUND_OPTIONS}
            />
            <RowSelect
              label="Padding"
              value={row.padding}
              onChange={(v) => onPatchRow({ padding: v as FooterRow["padding"] })}
              options={FOOTER_ROW_PADDING_OPTIONS}
            />
            <RowSelect
              label="Container"
              value={row.container}
              onChange={(v) =>
                onPatchRow({ container: v as FooterRow["container"] })
              }
              options={FOOTER_ROW_CONTAINER_OPTIONS}
            />
            <RowSelect
              label="Top border"
              value={row.topBorder ?? "none"}
              onChange={(v) =>
                onPatchRow({ topBorder: v as FooterRow["topBorder"] })
              }
              options={FOOTER_ROW_BORDER_OPTIONS}
            />
          </div>

          {/* Columns */}
          <DndContext
            sensors={colSensors}
            collisionDetection={closestCenter}
            onDragEnd={onColumnDragEnd}
          >
            <SortableContext
              items={row.columns.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {row.columns.map((column, ci) => (
                  <SortableColumn
                    key={column.id}
                    column={column}
                    index={ci}
                    expanded={expandedCellIds.has(column.id)}
                    onToggleExpanded={() => onToggleCellExpanded(column.id)}
                    onPatchColumn={(patch) => onPatchColumn(column.id, patch)}
                    onPatchCell={(next) => onPatchCell(column.id, next)}
                    onRemove={() => onRemoveCell(column.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add cell */}
          {isCellPickerOpen ? (
            <CellTypePicker onPick={onAddCell} onClose={onCloseCellPicker} />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenCellPicker}
              className="self-start"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add cell
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sortable column / cell ──────────────────────────────────────────────────

interface SortableColumnProps {
  column: FooterColumn;
  index: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPatchColumn: (patch: Partial<FooterColumn>) => void;
  onPatchCell: (next: FooterCell) => void;
  onRemove: () => void;
}

function SortableColumn({
  column,
  index,
  expanded,
  onToggleExpanded,
  onPatchColumn,
  onPatchCell,
  onRemove,
}: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const catalogEntry = FOOTER_CELL_CATALOG.find((c) => c.type === column.cell.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border bg-background"
    >
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag cell"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left text-xs"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="font-medium text-foreground">
            {catalogEntry?.title ?? column.cell.type} {index + 1}
          </span>
          {column.cell.heading && (
            <span className="truncate text-muted-foreground">
              · "{column.cell.heading}"
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">w:</span>
          <Input
            type="number"
            min={1}
            max={12}
            value={column.width ?? ""}
            placeholder="auto"
            onChange={(e) => {
              const v = e.target.value;
              onPatchColumn({ width: v ? Math.min(12, Math.max(1, Number(v))) : undefined });
            }}
            className="h-7 w-14"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove cell"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="p-3">
          <FooterCellEditor cell={column.cell} onChange={onPatchCell} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RowSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 min-w-0 max-w-full rounded-none border border-border bg-background px-2 text-xs text-foreground outline-hidden focus:border-primary"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CellTypePicker({
  onPick,
  onClose,
}: {
  onPick: (type: FooterCellType) => void;
  onClose: () => void;
}) {
  return (
    <div className="border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Pick a cell type</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5 @min-[28rem]/footer-builder:grid-cols-2 @min-[40rem]/footer-builder:grid-cols-3">
        {FOOTER_CELL_CATALOG.map((entry) => (
          <button
            key={entry.type}
            type="button"
            onClick={() => onPick(entry.type)}
            className={cn(
              "flex flex-col items-start gap-0.5 border border-border bg-background p-2 text-left transition-colors hover:border-primary",
            )}
          >
            <span className="text-xs font-medium text-foreground">
              {entry.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {entry.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
