import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { cn } from "@/lib/utils";

export function FieldButtonGroup({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const choices: Array<{ value: string; label: string }> = settings.choices ?? [];

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="inline-flex border border-border divide-x divide-border">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={cn(
              "px-3 h-8 text-xs transition-colors",
              value === c.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-muted"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </FieldWrapper>
  );
}
