import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

export function FieldOembed({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter URL to embed (YouTube, Vimeo, etc.)" className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring" />
    </FieldWrapper>
  );
}
