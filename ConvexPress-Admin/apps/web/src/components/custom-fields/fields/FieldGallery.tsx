import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { Button } from "@/components/ui/button";
import { ImageIcon, XIcon } from "lucide-react";
import { useMemo } from "react";

export function FieldGallery({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const images: string[] = useMemo(() => { try { return JSON.parse(value || "[]"); } catch { return []; } }, [value]);
  const removeImage = (index: number) => { const next = images.filter((_, i) => i !== index); onChange(JSON.stringify(next)); };
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="space-y-2">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">{images.map((img, i) => (
            <div key={i} className="flex items-center gap-1 border border-border px-2 py-1 text-xs">
              <ImageIcon className="size-3 text-muted-foreground" /><span className="truncate max-w-24">{img}</span>
              <button type="button" onClick={() => removeImage(i)} className="text-muted-foreground hover:text-destructive"><XIcon className="size-3" /></button>
            </div>
          ))}</div>
        )}
        <Button variant="outline" size="sm" onClick={() => { /* Media picker for gallery */ }}>
          <ImageIcon className="size-3.5" />Add Images
        </Button>
      </div>
    </FieldWrapper>
  );
}
