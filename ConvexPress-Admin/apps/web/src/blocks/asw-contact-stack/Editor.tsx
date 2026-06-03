import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  RepeaterHeader,
  RepeaterItem,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { AswContactStackAttrs } from "./schema";

const emptyItem: AswContactStackAttrs["items"][number] = {
  label: "",
  value: "",
  href: "",
};

export function AswContactStackEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<AswContactStackAttrs>) {
  const updateItem = (index: number, patch: Partial<AswContactStackAttrs["items"][number]>) => {
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
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Phone" value={attrs.phone} type="tel" disabled={disabled} onChange={(phone) => onChange({ ...attrs, phone })} />
        <TextField label="Email" value={attrs.email} type="email" disabled={disabled} onChange={(email) => onChange({ ...attrs, email })} />
      </div>
      <TextareaField label="Address" value={attrs.address} rows={3} disabled={disabled} onChange={(address) => onChange({ ...attrs, address })} />
      <TextareaField label="Hours" value={attrs.hours} rows={3} disabled={disabled} onChange={(hours) => onChange({ ...attrs, hours })} />
      <TextField label="Map embed URL" value={attrs.mapEmbedUrl} type="url" disabled={disabled} onChange={(mapEmbedUrl) => onChange({ ...attrs, mapEmbedUrl })} />
      <div className="grid gap-3">
        <RepeaterHeader label="Extra contact rows" disabled={disabled} onAdd={() => onChange({ ...attrs, items: [...attrs.items, emptyItem] })} />
        {attrs.items.map((item, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove row"
            onRemove={() => onChange({ ...attrs, items: attrs.items.filter((_, itemIndex) => itemIndex !== index) })}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <TextField label="Label" value={item.label} disabled={disabled} onChange={(label) => updateItem(index, { label })} />
              <TextField label="Value" value={item.value} disabled={disabled} onChange={(value) => updateItem(index, { value })} />
              <TextField label="Link URL" value={item.href} disabled={disabled} onChange={(href) => updateItem(index, { href })} />
            </div>
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
