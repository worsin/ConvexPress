import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { ProductShowcaseAttrs } from "./schema";

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProductShowcaseEditor({ attrs, onChange, disabled }: BlockEditorProps<ProductShowcaseAttrs>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
        <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      </div>
      <TextareaField label="Intro" value={attrs.intro} rows={2} disabled={disabled} onChange={(intro) => onChange({ ...attrs, intro })} />
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField
          label="Products"
          value={attrs.source}
          disabled={disabled}
          options={[
            ["newest", "Newest in the catalog"],
            ["category", "From a category"],
            ["sale", "On sale"],
            ["slugs", "Hand-picked (slugs)"],
          ]}
          onChange={(source) => onChange({ ...attrs, source })}
        />
        <NumberField label="Count" value={attrs.count} min={1} max={24} disabled={disabled} onChange={(count) => onChange({ ...attrs, count })} />
        <NumberField label="Columns" value={attrs.columns} min={2} max={4} disabled={disabled} onChange={(columns) => onChange({ ...attrs, columns })} />
      </div>
      {attrs.source === "category" && (
        <TextField label="Category slug" value={attrs.categorySlug} disabled={disabled} onChange={(categorySlug) => onChange({ ...attrs, categorySlug })} />
      )}
      {attrs.source === "slugs" && (
        <TextareaField
          label="Product slugs (one per line, in display order)"
          value={attrs.productSlugs.join("\n")}
          rows={4}
          disabled={disabled}
          onChange={(value) => onChange({ ...attrs, productSlugs: splitLines(value) })}
        />
      )}
      <CheckboxField label="Show add to cart" checked={attrs.showAddToCart} disabled={disabled} onChange={(showAddToCart) => onChange({ ...attrs, showAddToCart })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="CTA label" value={attrs.ctaLabel} disabled={disabled} onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })} />
        <TextField label="CTA URL" value={attrs.ctaUrl} disabled={disabled} onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })} />
      </div>
      <p className="text-xs text-muted-foreground">
        Prices, stock and cart state are live on the public site; nothing here is typed by hand.
      </p>
    </div>
  );
}
