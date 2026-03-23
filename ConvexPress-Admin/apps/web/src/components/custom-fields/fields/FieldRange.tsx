import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldRange({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const min = settings.min ?? 0;
  const max = settings.max ?? 100;
  const step = settings.step ?? 1;
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="flex items-center gap-3">
        <input type="range" value={value || String(min)} onChange={(e) => onChange(e.target.value)} min={min} max={max} step={step} className="flex-1 h-2 accent-primary" />
        <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">{value || min}</span>
      </div>
    </FieldWrapper>
  );
}
