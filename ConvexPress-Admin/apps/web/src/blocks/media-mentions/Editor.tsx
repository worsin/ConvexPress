import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  RepeaterHeader,
  RepeaterItem,
  SelectField,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { MediaMentionsAttrs } from "./schema";

const emptyItem: MediaMentionsAttrs["items"][number] = {
  title: "",
  source: "",
  byline: "",
  summary: "",
  mediaId: "",
  mediaAlt: "",
  ctaLabel: "Read more",
  ctaUrl: "",
  kind: "article",
};

export function MediaMentionsEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<MediaMentionsAttrs>) {
  const updateItem = (index: number, patch: Partial<MediaMentionsAttrs["items"][number]>) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="grid gap-4">
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.intro} rows={3} disabled={disabled} onChange={(intro) => onChange({ ...attrs, intro })} />
      <div className="grid gap-3">
        <RepeaterHeader label="Media mentions" disabled={disabled} onAdd={() => onChange({ ...attrs, items: [...attrs.items, emptyItem] })} />
        {attrs.items.map((item, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove mention"
            onRemove={() => onChange({ ...attrs, items: attrs.items.filter((_, itemIndex) => itemIndex !== index) })}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Title" value={item.title} disabled={disabled} onChange={(title) => updateItem(index, { title })} />
              <SelectField
                label="Kind"
                value={item.kind}
                disabled={disabled}
                options={[
                  ["article", "Article"],
                  ["pdf", "PDF"],
                  ["video", "Video"],
                  ["audio", "Audio"],
                ]}
                onChange={(kind) => updateItem(index, { kind })}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Source" value={item.source} disabled={disabled} onChange={(source) => updateItem(index, { source })} />
              <TextField label="Byline" value={item.byline} disabled={disabled} onChange={(byline) => updateItem(index, { byline })} />
            </div>
            <TextareaField label="Summary" value={item.summary} rows={3} disabled={disabled} onChange={(summary) => updateItem(index, { summary })} />
            <MediaField label="Image or thumbnail" value={item.mediaId} disabled={disabled} promptSeed={item.title || item.summary} onChange={(mediaId) => updateItem(index, { mediaId })} />
            <TextField label="Media alt text" value={item.mediaAlt} disabled={disabled} onChange={(mediaAlt) => updateItem(index, { mediaAlt })} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="CTA label" value={item.ctaLabel} disabled={disabled} onChange={(ctaLabel) => updateItem(index, { ctaLabel })} />
              <TextField label="CTA URL" value={item.ctaUrl} disabled={disabled} onChange={(ctaUrl) => updateItem(index, { ctaUrl })} />
            </div>
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
