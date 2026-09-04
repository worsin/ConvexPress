import type { BlockEditorProps } from "@/lib/blocks/types";
import { CheckboxField, NumberField, TextareaField, TextField } from "../_shared/editorFields";
import type { CategoryTilesAttrs } from "./schema";

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CategoryTilesEditor({ attrs, onChange, disabled }: BlockEditorProps<CategoryTilesAttrs>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
        <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      </div>
      <TextareaField label="Intro" value={attrs.intro} rows={2} disabled={disabled} onChange={(intro) => onChange({ ...attrs, intro })} />
      <TextareaField
        label="Category slugs (one per line; leave empty for every visible category)"
        value={attrs.categorySlugs.join("\n")}
        rows={4}
        disabled={disabled}
        onChange={(value) => onChange({ ...attrs, categorySlugs: splitLines(value) })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <NumberField label="Max tiles" value={attrs.limit} min={1} max={24} disabled={disabled} onChange={(limit) => onChange({ ...attrs, limit })} />
        <NumberField label="Columns" value={attrs.columns} min={2} max={4} disabled={disabled} onChange={(columns) => onChange({ ...attrs, columns })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CheckboxField label="Show product counts" checked={attrs.showCounts} disabled={disabled} onChange={(showCounts) => onChange({ ...attrs, showCounts })} />
        <CheckboxField label="Show descriptions" checked={attrs.showDescriptions} disabled={disabled} onChange={(showDescriptions) => onChange({ ...attrs, showDescriptions })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="CTA label" value={attrs.ctaLabel} disabled={disabled} onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })} />
        <TextField label="CTA URL" value={attrs.ctaUrl} disabled={disabled} onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })} />
      </div>
      <p className="text-xs text-muted-foreground">
        Tiles use the category thumbnail when set, otherwise the first product photo in that category.
      </p>
    </div>
  );
}
