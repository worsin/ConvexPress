import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldSelect({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const choices: Array<{ value: string; label: string }> = settings.choices ?? [];
  const multiple = settings.multiple ?? false;
  const selectedValues: string[] = useMemo(() => { if (multiple) { try { return JSON.parse(value || "[]"); } catch { return []; } } return [value]; }, [value, multiple]);

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <select value={multiple ? undefined : value} multiple={multiple} onChange={(e) => {
        if (multiple) { const selected = Array.from(e.target.selectedOptions).map((o) => o.value); onChange(JSON.stringify(selected)); }
        else { onChange(e.target.value); }
      }} className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs">
        {settings.allowNull && <option value="">- Select -</option>}
        {choices.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
      </select>
    </FieldWrapper>
  );
}
