import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldWysiwyg({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={8} placeholder="Enter HTML content..." className="w-full rounded-none border border-border bg-background px-3 py-2 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-ring resize-y" />
      <p className="text-[10px] text-muted-foreground mt-1">Rich text editor integration pending (Content Editor System)</p>
    </FieldWrapper>
  );
}
