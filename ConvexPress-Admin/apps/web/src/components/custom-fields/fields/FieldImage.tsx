import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { Button } from "@/components/ui/button";
import { ImageIcon, XIcon } from "lucide-react";

export function FieldImage({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="flex items-center gap-2">
        {value ? (
          <div className="flex items-center gap-2 border border-border px-2 py-1">
            <ImageIcon className="size-4 text-muted-foreground" />
            <span className="text-xs text-foreground truncate max-w-48">{value}</span>
            <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-destructive"><XIcon className="size-3" /></button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => { /* Media picker integration */ }}>
            <ImageIcon className="size-3.5" />
            Select Image
          </Button>
        )}
      </div>
    </FieldWrapper>
  );
}
