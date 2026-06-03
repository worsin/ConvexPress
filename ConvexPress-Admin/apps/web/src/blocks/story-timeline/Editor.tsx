import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  RepeaterHeader,
  RepeaterItem,
  SelectField,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { StoryTimelineAttrs } from "./schema";

const emptyItem: StoryTimelineAttrs["items"][number] = {
  label: "",
  title: "",
  body: "",
  mediaId: "",
  mediaAlt: "",
  side: "auto",
  linkLabel: "",
  linkUrl: "",
};

export function StoryTimelineEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<StoryTimelineAttrs>) {
  const updateItem = (index: number, patch: Partial<StoryTimelineAttrs["items"][number]>) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
        <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      </div>
      <TextareaField label="Intro" value={attrs.intro} rows={3} disabled={disabled} onChange={(intro) => onChange({ ...attrs, intro })} />
      <div className="grid gap-3">
        <RepeaterHeader label="Timeline items" disabled={disabled} onAdd={() => onChange({ ...attrs, items: [...attrs.items, emptyItem] })} />
        {attrs.items.map((item, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove milestone"
            onRemove={() => onChange({ ...attrs, items: attrs.items.filter((_, itemIndex) => itemIndex !== index) })}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <TextField label="Label or year" value={item.label} disabled={disabled} onChange={(label) => updateItem(index, { label })} />
              <TextField label="Title" value={item.title} disabled={disabled} onChange={(title) => updateItem(index, { title })} />
              <SelectField
                label="Side"
                value={item.side}
                disabled={disabled}
                options={[
                  ["auto", "Auto"],
                  ["left", "Left"],
                  ["right", "Right"],
                ]}
                onChange={(side) => updateItem(index, { side })}
              />
            </div>
            <TextareaField label="Body" value={item.body} rows={4} disabled={disabled} onChange={(body) => updateItem(index, { body })} />
            <MediaField label="Milestone image" value={item.mediaId} disabled={disabled} promptSeed={item.title || item.body} onChange={(mediaId) => updateItem(index, { mediaId })} />
            <TextField label="Media alt text" value={item.mediaAlt} disabled={disabled} onChange={(mediaAlt) => updateItem(index, { mediaAlt })} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Link label" value={item.linkLabel} disabled={disabled} onChange={(linkLabel) => updateItem(index, { linkLabel })} />
              <TextField label="Link URL" value={item.linkUrl} disabled={disabled} onChange={(linkUrl) => updateItem(index, { linkUrl })} />
            </div>
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
