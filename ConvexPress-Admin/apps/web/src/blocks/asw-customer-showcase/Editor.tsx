import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  RepeaterHeader,
  RepeaterItem,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { AswCustomerShowcaseAttrs } from "./schema";

const emptyItem: AswCustomerShowcaseAttrs["items"][number] = {
  quote: "",
  name: "",
  role: "",
  company: "",
  mediaId: "",
  mediaAlt: "",
  instrumentType: "",
  url: "",
};

export function AswCustomerShowcaseEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<AswCustomerShowcaseAttrs>) {
  const updateItem = (index: number, patch: Partial<AswCustomerShowcaseAttrs["items"][number]>) => {
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
        <RepeaterHeader label="Showcase items" disabled={disabled} onAdd={() => onChange({ ...attrs, items: [...attrs.items, emptyItem] })} />
        {attrs.items.map((item, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove showcase"
            onRemove={() => onChange({ ...attrs, items: attrs.items.filter((_, itemIndex) => itemIndex !== index) })}
          >
            <TextareaField label="Quote" value={item.quote} rows={4} disabled={disabled} onChange={(quote) => updateItem(index, { quote })} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Name" value={item.name} disabled={disabled} onChange={(name) => updateItem(index, { name })} />
              <TextField label="Role" value={item.role} disabled={disabled} onChange={(role) => updateItem(index, { role })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Company" value={item.company} disabled={disabled} onChange={(company) => updateItem(index, { company })} />
              <TextField label="Instrument type" value={item.instrumentType} disabled={disabled} onChange={(instrumentType) => updateItem(index, { instrumentType })} />
            </div>
            <TextField label="URL" value={item.url} disabled={disabled} onChange={(url) => updateItem(index, { url })} />
            <MediaField label="Image" value={item.mediaId} disabled={disabled} promptSeed={`${item.name} ${item.instrumentType}`} onChange={(mediaId) => updateItem(index, { mediaId })} />
            <TextField label="Media alt text" value={item.mediaAlt} disabled={disabled} onChange={(mediaAlt) => updateItem(index, { mediaAlt })} />
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
