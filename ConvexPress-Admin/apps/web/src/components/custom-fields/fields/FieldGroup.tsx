import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldGroup({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const layout = settings.layout ?? "block"; // block, table, row

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="border border-border p-3 bg-muted/30">
        <p className="text-[10px] text-muted-foreground italic">
          Sub-fields render within this group ({layout} layout)
        </p>
        {/* Sub-fields are rendered by the parent FieldGroupBuilder / MetaboxRenderer */}
      </div>
    </FieldWrapper>
  );
}
