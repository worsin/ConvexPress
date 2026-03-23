import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldTimePicker({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const displayFormat = settings.displayFormat ?? "HH:mm";

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
      />
      {displayFormat !== "HH:mm" && (
        <p className="text-[10px] text-muted-foreground mt-0.5">Display format: {displayFormat}</p>
      )}
    </FieldWrapper>
  );
}
