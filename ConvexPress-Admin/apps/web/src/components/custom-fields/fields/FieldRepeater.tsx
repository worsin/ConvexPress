import { useMemo, useState } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { Button } from "@/components/ui/button";
import { PlusIcon, XIcon, GripVerticalIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RepeaterRow {
  [key: string]: string;
}

export function FieldRepeater({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const min = settings.min ?? 0;
  const max = settings.max ?? 0;
  const layout = settings.layout ?? "table"; // table, block, row
  const buttonLabel = settings.buttonLabel ?? "Add Row";
  const collapsed = settings.collapsed ?? "";

  const rows: RepeaterRow[] = useMemo(() => { try { return JSON.parse(value || "[]"); } catch { return []; } }, [value]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set(rows.map((_, i) => i)));

  const addRow = () => {
    if (max > 0 && rows.length >= max) return;
    const next = [...rows, {}];
    onChange(JSON.stringify(next));
    setExpandedRows((prev) => new Set([...prev, rows.length]));
  };

  const removeRow = (index: number) => {
    if (rows.length <= min) return;
    const next = rows.filter((_, i) => i !== index);
    onChange(JSON.stringify(next));
  };

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="border border-border">
            <div className="flex items-center gap-1 px-2 py-1.5 bg-muted">
              <GripVerticalIcon className="size-3 text-muted-foreground cursor-grab" />
              <button type="button" onClick={() => toggleRow(i)} className="flex-1 text-left text-xs text-foreground font-medium">
                Row {i + 1}
              </button>
              <ChevronDownIcon className={cn("size-3 text-muted-foreground transition-transform", expandedRows.has(i) && "rotate-180")} />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={rows.length <= min}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <XIcon className="size-3" />
              </button>
            </div>
            {expandedRows.has(i) && (
              <div className="px-3 py-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground italic">Sub-fields for row {i + 1} render here</p>
                {/* Sub-field rendering handled by MetaboxRenderer with row context */}
              </div>
            )}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={max > 0 && rows.length >= max}
        >
          <PlusIcon className="size-3.5" />
          {buttonLabel}
        </Button>
        {min > 0 && <p className="text-[10px] text-muted-foreground">Minimum {min} rows</p>}
        {max > 0 && <p className="text-[10px] text-muted-foreground">Maximum {max} rows</p>}
      </div>
    </FieldWrapper>
  );
}
