import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldColorPicker({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const enableOpacity = settings.enableOpacity ?? false;

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 rounded-none border border-border bg-background cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="w-28 h-8 rounded-none border border-border bg-background px-2 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-ring"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-xs text-muted-foreground hover:text-destructive">Clear</button>
        )}
      </div>
    </FieldWrapper>
  );
}
