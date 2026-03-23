import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldText({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="flex items-center">
        {settings.prepend && <span className="h-8 inline-flex items-center px-2 border border-r-0 border-border bg-muted text-xs text-muted-foreground">{settings.prepend}</span>}
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={settings.placeholder} maxLength={settings.maxLength} className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring" />
        {settings.append && <span className="h-8 inline-flex items-center px-2 border border-l-0 border-border bg-muted text-xs text-muted-foreground">{settings.append}</span>}
      </div>
    </FieldWrapper>
  );
}
