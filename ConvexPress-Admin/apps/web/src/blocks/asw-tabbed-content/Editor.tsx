import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import {
  RepeaterHeader,
  RepeaterItem,
  SelectField,
  TextareaField,
  TextField,
} from "../_shared/editorFields";
import type { AswTabbedContentAttrs } from "./schema";

const emptyTab: AswTabbedContentAttrs["tabs"][number] = {
  label: "New tab",
  title: "",
  body: "",
  mediaId: "",
  mediaAlt: "",
  ctaLabel: "",
  ctaUrl: "",
};

export function AswTabbedContentEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<AswTabbedContentAttrs>) {
  const updateTab = (index: number, patch: Partial<AswTabbedContentAttrs["tabs"][number]>) => {
    onChange({
      ...attrs,
      tabs: attrs.tabs.map((tab, tabIndex) =>
        tabIndex === index ? { ...tab, ...patch } : tab,
      ),
    });
  };

  return (
    <div className="grid gap-4">
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.intro} rows={3} disabled={disabled} onChange={(intro) => onChange({ ...attrs, intro })} />
      <SelectField
        label="Orientation"
        value={attrs.orientation}
        disabled={disabled}
        options={[
          ["top", "Tabs across top"],
          ["left", "Tabs on left"],
        ]}
        onChange={(orientation) => onChange({ ...attrs, orientation })}
      />
      <div className="grid gap-3">
        <RepeaterHeader
          label="Tabs"
          disabled={disabled}
          onAdd={() => onChange({ ...attrs, tabs: [...attrs.tabs, emptyTab] })}
        />
        {attrs.tabs.map((tab, index) => (
          <RepeaterItem
            key={index}
            disabled={disabled}
            removeLabel="Remove tab"
            onRemove={() => onChange({ ...attrs, tabs: attrs.tabs.filter((_, tabIndex) => tabIndex !== index) })}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Tab label" value={tab.label} disabled={disabled} onChange={(label) => updateTab(index, { label })} />
              <TextField label="Panel title" value={tab.title} disabled={disabled} onChange={(title) => updateTab(index, { title })} />
            </div>
            <TextareaField label="Panel body" value={tab.body} rows={5} disabled={disabled} onChange={(body) => updateTab(index, { body })} />
            <MediaField label="Panel media" value={tab.mediaId} disabled={disabled} promptSeed={tab.title || tab.body} onChange={(mediaId) => updateTab(index, { mediaId })} />
            <TextField label="Media alt text" value={tab.mediaAlt} disabled={disabled} onChange={(mediaAlt) => updateTab(index, { mediaAlt })} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="CTA label" value={tab.ctaLabel} disabled={disabled} onChange={(ctaLabel) => updateTab(index, { ctaLabel })} />
              <TextField label="CTA URL" value={tab.ctaUrl} disabled={disabled} onChange={(ctaUrl) => updateTab(index, { ctaUrl })} />
            </div>
          </RepeaterItem>
        ))}
      </div>
    </div>
  );
}
