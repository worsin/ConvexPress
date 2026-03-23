import { useMemo, useState } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { Button } from "@/components/ui/button";
import { PlusIcon, XIcon, GripVerticalIcon, ChevronDownIcon, LayoutListIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlexibleLayout {
  layout: string;
  label: string;
  fields: Record<string, string>;
}

export function FieldFlexibleContent({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const layouts: Array<{ name: string; label: string; min?: number; max?: number }> = settings.layouts ?? [];
  const min = settings.min ?? 0;
  const max = settings.max ?? 0;
  const buttonLabel = settings.buttonLabel ?? "Add Layout";

  const rows: FlexibleLayout[] = useMemo(() => { try { return JSON.parse(value || "[]"); } catch { return []; } }, [value]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set(rows.map((_, i) => i)));
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);

  const addLayout = (layoutName: string) => {
    if (max > 0 && rows.length >= max) return;
    const layout = layouts.find((l) => l.name === layoutName);
    if (!layout) return;
    const next: FlexibleLayout[] = [...rows, { layout: layoutName, label: layout.label, fields: {} }];
    onChange(JSON.stringify(next));
    setExpandedRows((prev) => new Set([...prev, rows.length]));
    setShowLayoutPicker(false);
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
              <LayoutListIcon className="size-3 text-muted-foreground" />
              <button type="button" onClick={() => toggleRow(i)} className="flex-1 text-left text-xs text-foreground">
                <span className="font-medium">{row.label}</span>
                <span className="text-muted-foreground ml-1">({row.layout})</span>
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
                <p className="text-[10px] text-muted-foreground italic">Layout "{row.layout}" fields render here</p>
                {/* Layout sub-fields rendered by MetaboxRenderer */}
              </div>
            )}
          </div>
        ))}

        {/* Add layout button with picker */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLayoutPicker(!showLayoutPicker)}
            disabled={max > 0 && rows.length >= max}
          >
            <PlusIcon className="size-3.5" />
            {buttonLabel}
          </Button>
          {showLayoutPicker && layouts.length > 0 && (
            <div className="absolute z-10 mt-1 w-48 border border-border bg-card shadow-lg">
              {layouts.map((layout) => (
                <button
                  key={layout.name}
                  type="button"
                  onClick={() => addLayout(layout.name)}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted border-b border-border last:border-0"
                >
                  {layout.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {layouts.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No layouts configured. Add layouts in the field settings.</p>
        )}
      </div>
    </FieldWrapper>
  );
}
