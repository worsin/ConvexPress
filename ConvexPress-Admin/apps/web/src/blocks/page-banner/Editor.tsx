import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import { TextareaField, TextField } from "../_shared/editorFields";
import type { PageBannerAttrs } from "./schema";

export function PageBannerEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<PageBannerAttrs>) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
        <TextField label="Breadcrumb label" value={attrs.breadcrumbLabel} disabled={disabled} onChange={(breadcrumbLabel) => onChange({ ...attrs, breadcrumbLabel })} />
      </div>
      <TextField label="Title" value={attrs.title} disabled={disabled} onChange={(title) => onChange({ ...attrs, title })} />
      <TextareaField label="Subtitle" value={attrs.subtitle} rows={3} disabled={disabled} onChange={(subtitle) => onChange({ ...attrs, subtitle })} />
      <MediaField label="Banner media" value={attrs.mediaId} disabled={disabled} promptSeed={attrs.title || attrs.subtitle} onChange={(mediaId) => onChange({ ...attrs, mediaId })} />
      <TextField label="Media alt text" value={attrs.mediaAlt} disabled={disabled} onChange={(mediaAlt) => onChange({ ...attrs, mediaAlt })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="CTA label" value={attrs.ctaLabel} disabled={disabled} onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })} />
        <TextField label="CTA URL" value={attrs.ctaUrl} disabled={disabled} onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })} />
      </div>
    </div>
  );
}
