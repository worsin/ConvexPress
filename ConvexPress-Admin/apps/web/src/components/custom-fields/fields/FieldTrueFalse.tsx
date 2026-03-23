import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldTrueFalse({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const onLabel = settings.onLabel ?? "Yes";
  const offLabel = settings.offLabel ?? "No";
  const isOn = value === "1" || value === "true";

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <label className="flex items-center gap-2 cursor-pointer">
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={() => onChange(isOn ? "0" : "1")}
          className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border transition-colors"
          style={{ backgroundColor: isOn ? "var(--color-primary)" : "var(--color-muted)" }}
        >
          <span
            className="pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform"
            style={{ transform: isOn ? "translateX(16px)" : "translateX(2px)" }}
          />
        </button>
        <span className="text-xs text-foreground">{isOn ? onLabel : offLabel}</span>
      </label>
    </FieldWrapper>
  );
}
