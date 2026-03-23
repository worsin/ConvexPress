import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { cn } from "@/lib/utils";

export function FieldCheckbox({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const choices: Array<{ value: string; label: string }> = settings.choices ?? [];
  const selected: string[] = useMemo(() => { try { return JSON.parse(value || "[]"); } catch { return []; } }, [value]);
  const layout = settings.layout ?? "vertical";

  const toggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
    onChange(JSON.stringify(next));
  };

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className={cn("flex gap-2", layout === "vertical" ? "flex-col" : "flex-row flex-wrap")}>
        {choices.map((c) => (
          <label key={c.value} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={selected.includes(c.value)} onChange={() => toggle(c.value)} className="size-3.5" />
            <span className="text-xs text-foreground">{c.label}</span>
          </label>
        ))}
      </div>
    </FieldWrapper>
  );
}
