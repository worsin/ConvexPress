import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldDateTimePicker({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const displayFormat = settings.displayFormat ?? "yyyy-MM-dd HH:mm";

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
      />
      {displayFormat !== "yyyy-MM-dd HH:mm" && (
        <p className="text-[10px] text-muted-foreground mt-0.5">Display format: {displayFormat}</p>
      )}
    </FieldWrapper>
  );
}
