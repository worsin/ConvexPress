import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  RepeaterHeader,
  RepeaterItem,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { PromoBandAttrs } from "./schema";

const emptyDetail: PromoBandAttrs["details"][number] = {
  label: "",
  value: "",
};

export function PromoBandEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<PromoBandAttrs>) {
  const updateDetail = (index: number, patch: Partial<PromoBandAttrs["details"][number]>) => {
    onChange({
      ...attrs,
      details: attrs.details.map((detail, detailIndex) =>
        detailIndex === index ? { ...detail, ...patch } : detail,
      ),
    });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
        <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      </div>
      <TextareaField label="Body" value={attrs.body} rows={4} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <MediaField label="Promo media" value={attrs.mediaId} disabled={disabled} promptSeed={attrs.heading || attrs.body} onChange={(mediaId) => onChange({ ...attrs, mediaId })} />
      <TextField label="Media alt text" value={attrs.mediaAlt} disabled={disabled} onChange={(mediaAlt) => onChange({ ...attrs, mediaAlt })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Primary CTA label" value={attrs.primaryCtaLabel} disabled={disabled} onChange={(primaryCtaLabel) => onChange({ ...attrs, primaryCtaLabel })} />
        <TextField label="Primary CTA URL" value={attrs.primaryCtaUrl} disabled={disabled} onChange={(primaryCtaUrl) => onChange({ ...attrs, primaryCtaUrl })} />
        <TextField label="Secondary CTA label" value={attrs.secondaryCtaLabel} disabled={disabled} onChange={(secondaryCtaLabel) => onChange({ ...attrs, secondaryCtaLabel })} />
        <TextField label="Secondary CTA URL" value={attrs.secondaryCtaUrl} disabled={disabled} onChange={(secondaryCtaUrl) => onChange({ ...attrs, secondaryCtaUrl })} />
      </div>
      <div className="grid gap-3">
        <RepeaterHeader label="Details" disabled={disabled} onAdd={() => onChange({ ...attrs, details: [...attrs.details, emptyDetail] })} />
        {attrs.details.map((detail, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove detail"
            onRemove={() => onChange({ ...attrs, details: attrs.details.filter((_, detailIndex) => detailIndex !== index) })}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Label" value={detail.label} disabled={disabled} onChange={(label) => updateDetail(index, { label })} />
              <TextField label="Value" value={detail.value} disabled={disabled} onChange={(value) => updateDetail(index, { value })} />
            </div>
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
