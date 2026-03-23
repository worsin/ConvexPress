import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldTextarea({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={settings.placeholder} maxLength={settings.maxLength} rows={settings.rows ?? 4} className="w-full rounded-none border border-border bg-background px-2 py-1.5 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring resize-y" />
    </FieldWrapper>
  );
}
