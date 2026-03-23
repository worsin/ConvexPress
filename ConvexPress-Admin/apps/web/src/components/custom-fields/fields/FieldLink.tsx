import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";

interface LinkValue {
  url: string;
  title: string;
  target: string;
}

export function FieldLink({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const link: LinkValue = useMemo(() => {
    try { const parsed = JSON.parse(value); return { url: parsed.url ?? "", title: parsed.title ?? "", target: parsed.target ?? "" }; }
    catch { return { url: "", title: "", target: "" }; }
  }, [value]);

  const update = (key: keyof LinkValue, val: string) => {
    onChange(JSON.stringify({ ...link, [key]: val }));
  };

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">URL</label>
          <input type="url" value={link.url} onChange={(e) => update("url", e.target.value)} placeholder="https://" className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Link Text</label>
          <input type="text" value={link.title} onChange={(e) => update("title", e.target.value)} placeholder="Link text" className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring" />
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={link.target === "_blank"} onChange={(e) => update("target", e.target.checked ? "_blank" : "")} className="size-3.5" />
          <span className="text-xs text-foreground">Open in new tab</span>
        </label>
      </div>
    </FieldWrapper>
  );
}
