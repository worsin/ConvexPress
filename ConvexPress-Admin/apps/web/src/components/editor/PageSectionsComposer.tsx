import { Plus, ArrowUp, ArrowDown, Trash2, CopyPlus } from "lucide-react";
import { useId, type ReactNode } from "react";

import { MediaPicker } from "@/components/media/MediaPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createDefaultSection,
  getPageTemplateManifest,
  type PageSectionType,
} from "@/lib/page-builder/templates";
import type { PageSection } from "@/types/editor";

interface PageSectionsComposerProps {
  templateId: string;
  value: PageSection[];
  onChange: (sections: PageSection[]) => void;
}

type FeatureItem = { title: string; description: string };
type PlanItem = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string;
  ctaLabel: string;
  ctaUrl: string;
  featured?: boolean;
};
type TestimonialItem = { quote: string; name: string; role: string };
type SectionShell = NonNullable<PageSection["shell"]>;

export function PageSectionsComposer({
  templateId,
  value,
  onChange,
}: PageSectionsComposerProps) {
  const manifest = getPageTemplateManifest(templateId);

  const replaceSection = (sectionId: string, updater: (section: PageSection) => PageSection) => {
    onChange(value.map((section) => section.id === sectionId ? updater(section) : section));
  };

  const addSection = (type: PageSectionType) => {
    onChange([...value, createDefaultSection(type)]);
  };

  const duplicateSection = (sectionId: string) => {
    const section = value.find((item) => item.id === sectionId);
    if (!section) return;
    onChange([...value, { ...section, id: `${section.type}-${Date.now()}` }]);
  };

  const removeSection = (sectionId: string) => {
    onChange(value.filter((section) => section.id !== sectionId));
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    const index = value.findIndex((item) => item.id === sectionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    onChange(next);
  };

  const resetToTemplate = () => {
    onChange(manifest.defaultSections.map((section) => ({ ...section, id: `${section.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })));
  };

  return (
    <section className="space-y-4 border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Template Sections</h2>
          <p className="text-xs text-muted-foreground">
            This template is section-based. Reorder the stack and fill only the fields each section supports.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={resetToTemplate}>
          Reset to Template
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {manifest.allowedSections.map((sectionType) => (
          <Button
            key={sectionType}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addSection(sectionType)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            {sectionLabel(sectionType)}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {value.length === 0 ? (
          <div className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            This template uses sections. Add your first section above.
          </div>
        ) : (
          value.map((section, index) => (
            <article key={section.id} className="space-y-3 border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Section {index + 1}
                  </p>
                  <h3 className="text-sm font-semibold text-foreground">
                    {sectionLabel(section.type)}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton onClick={() => moveSection(section.id, -1)} disabled={index === 0} label="Move section up">
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton onClick={() => moveSection(section.id, 1)} disabled={index === value.length - 1} label="Move section down">
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton onClick={() => duplicateSection(section.id)} label="Duplicate section">
                    <CopyPlus className="size-3.5" />
                  </IconButton>
                  <IconButton onClick={() => removeSection(section.id)} label="Remove section">
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>

              <SectionShellEditor
                value={section.shell}
                onChange={(shell) => replaceSection(section.id, (current) => ({ ...current, shell }))}
              />

              <SectionFields
                section={section}
                onChange={(data) => replaceSection(section.id, (current) => ({ ...current, data }))}
              />
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-7 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SectionShellEditor({
  value,
  onChange,
}: {
  value: PageSection["shell"];
  onChange: (shell: PageSection["shell"]) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <SelectField
        label="Background"
        value={value?.tone ?? "default"}
        options={[
          ["default", "Default"],
          ["muted", "Muted"],
          ["accent", "Accent"],
          ["contrast", "Contrast"],
        ]}
        onChange={(tone) => onChange({ ...value, tone: tone as SectionShell["tone"] })}
      />
      <SelectField
        label="Padding"
        value={value?.padding ?? "normal"}
        options={[
          ["normal", "Normal"],
          ["spacious", "Spacious"],
        ]}
        onChange={(padding) => onChange({ ...value, padding: padding as SectionShell["padding"] })}
      />
      <SelectField
        label="Container"
        value={value?.container ?? "content"}
        options={[
          ["content", "Content"],
          ["wide", "Wide"],
        ]}
        onChange={(container) => onChange({ ...value, container: container as SectionShell["container"] })}
      />
    </div>
  );
}

function SectionFields({
  section,
  onChange,
}: {
  section: PageSection;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const data = (section.data ?? {}) as Record<string, unknown>;

  switch (section.type) {
    case "hero":
      return (
        <div className="grid gap-3">
          <TextField label="Eyebrow" value={stringValue(data.eyebrow)} onChange={(eyebrow) => onChange({ ...data, eyebrow })} />
          <TextField label="Title" value={stringValue(data.title)} onChange={(title) => onChange({ ...data, title })} />
          <TextareaField label="Body" value={stringValue(data.body)} rows={4} onChange={(body) => onChange({ ...data, body })} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Primary CTA Label" value={stringValue(data.primaryCtaLabel)} onChange={(primaryCtaLabel) => onChange({ ...data, primaryCtaLabel })} />
            <TextField label="Primary CTA URL" value={stringValue(data.primaryCtaUrl)} onChange={(primaryCtaUrl) => onChange({ ...data, primaryCtaUrl })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Secondary CTA Label" value={stringValue(data.secondaryCtaLabel)} onChange={(secondaryCtaLabel) => onChange({ ...data, secondaryCtaLabel })} />
            <TextField label="Secondary CTA URL" value={stringValue(data.secondaryCtaUrl)} onChange={(secondaryCtaUrl) => onChange({ ...data, secondaryCtaUrl })} />
          </div>
          <MediaField
            label="Hero Image"
            mediaId={stringValue(data.mediaId)}
            onChange={(mediaId) => onChange({ ...data, mediaId })}
          />
        </div>
      );
    case "feature-grid":
      return (
        <div className="grid gap-3">
          <TextField label="Eyebrow" value={stringValue(data.eyebrow)} onChange={(eyebrow) => onChange({ ...data, eyebrow })} />
          <TextField label="Heading" value={stringValue(data.heading)} onChange={(heading) => onChange({ ...data, heading })} />
          <TextareaField label="Intro" value={stringValue(data.body)} rows={3} onChange={(body) => onChange({ ...data, body })} />
          <ArrayBlock
            title="Feature Cards"
            items={arrayValue<FeatureItem>(data.items)}
            onAdd={() => onChange({ ...data, items: [...arrayValue<FeatureItem>(data.items), { title: "", description: "" }] })}
            onRemove={(index) => onChange({ ...data, items: arrayValue<FeatureItem>(data.items).filter((_, itemIndex) => itemIndex !== index) })}
            renderItem={(item, index) => (
              <div className="grid gap-2 md:grid-cols-2">
                <TextField label={`Card ${index + 1} Title`} value={item.title} onChange={(title) => onChange({ ...data, items: replaceAt(arrayValue<FeatureItem>(data.items), index, { ...item, title }) })} />
                <TextField label={`Card ${index + 1} Description`} value={item.description} onChange={(description) => onChange({ ...data, items: replaceAt(arrayValue<FeatureItem>(data.items), index, { ...item, description }) })} />
              </div>
            )}
          />
        </div>
      );
    case "story-split":
      return (
        <div className="grid gap-3">
          <TextField label="Eyebrow" value={stringValue(data.eyebrow)} onChange={(eyebrow) => onChange({ ...data, eyebrow })} />
          <TextField label="Heading" value={stringValue(data.heading)} onChange={(heading) => onChange({ ...data, heading })} />
          <TextareaField label="Body" value={stringValue(data.body)} rows={5} onChange={(body) => onChange({ ...data, body })} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="CTA Label" value={stringValue(data.ctaLabel)} onChange={(ctaLabel) => onChange({ ...data, ctaLabel })} />
            <TextField label="CTA URL" value={stringValue(data.ctaUrl)} onChange={(ctaUrl) => onChange({ ...data, ctaUrl })} />
          </div>
          <MediaField
            label="Story Image"
            mediaId={stringValue(data.mediaId)}
            onChange={(mediaId) => onChange({ ...data, mediaId })}
          />
        </div>
      );
    case "pricing-cards":
      return (
        <div className="grid gap-3">
          <TextField label="Eyebrow" value={stringValue(data.eyebrow)} onChange={(eyebrow) => onChange({ ...data, eyebrow })} />
          <TextField label="Heading" value={stringValue(data.heading)} onChange={(heading) => onChange({ ...data, heading })} />
          <TextareaField label="Intro" value={stringValue(data.body)} rows={3} onChange={(body) => onChange({ ...data, body })} />
          <ArrayBlock
            title="Plans"
            items={arrayValue<PlanItem>(data.plans)}
            onAdd={() => onChange({ ...data, plans: [...arrayValue<PlanItem>(data.plans), { name: "", price: "", period: "", description: "", features: "", ctaLabel: "", ctaUrl: "", featured: false }] })}
            onRemove={(index) => onChange({ ...data, plans: arrayValue<PlanItem>(data.plans).filter((_, itemIndex) => itemIndex !== index) })}
            renderItem={(item, index) => (
              <div className="space-y-2">
                <div className="grid gap-2 md:grid-cols-3">
                  <TextField label="Plan Name" value={item.name} onChange={(name) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, name }) })} />
                  <TextField label="Price" value={item.price} onChange={(price) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, price }) })} />
                  <TextField label="Period" value={item.period} onChange={(period) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, period }) })} />
                </div>
                <TextareaField label="Description" value={item.description} rows={2} onChange={(description) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, description }) })} />
                <TextareaField label="Features (one per line)" value={item.features} rows={4} onChange={(features) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, features }) })} />
                <div className="grid gap-2 md:grid-cols-2">
                  <TextField label="CTA Label" value={item.ctaLabel} onChange={(ctaLabel) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, ctaLabel }) })} />
                  <TextField label="CTA URL" value={item.ctaUrl} onChange={(ctaUrl) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, ctaUrl }) })} />
                </div>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={!!item.featured}
                    onChange={(e) => onChange({ ...data, plans: replaceAt(arrayValue<PlanItem>(data.plans), index, { ...item, featured: e.target.checked }) })}
                  />
                  Featured plan
                </label>
              </div>
            )}
          />
        </div>
      );
    case "testimonial-band":
      return (
        <div className="grid gap-3">
          <TextField label="Eyebrow" value={stringValue(data.eyebrow)} onChange={(eyebrow) => onChange({ ...data, eyebrow })} />
          <TextField label="Heading" value={stringValue(data.heading)} onChange={(heading) => onChange({ ...data, heading })} />
          <TextareaField label="Intro" value={stringValue(data.body)} rows={3} onChange={(body) => onChange({ ...data, body })} />
          <ArrayBlock
            title="Testimonials"
            items={arrayValue<TestimonialItem>(data.testimonials)}
            onAdd={() => onChange({ ...data, testimonials: [...arrayValue<TestimonialItem>(data.testimonials), { quote: "", name: "", role: "" }] })}
            onRemove={(index) => onChange({ ...data, testimonials: arrayValue<TestimonialItem>(data.testimonials).filter((_, itemIndex) => itemIndex !== index) })}
            renderItem={(item, index) => (
              <div className="space-y-2">
                <TextareaField label={`Quote ${index + 1}`} value={item.quote} rows={3} onChange={(quote) => onChange({ ...data, testimonials: replaceAt(arrayValue<TestimonialItem>(data.testimonials), index, { ...item, quote }) })} />
                <div className="grid gap-2 md:grid-cols-2">
                  <TextField label="Name" value={item.name} onChange={(name) => onChange({ ...data, testimonials: replaceAt(arrayValue<TestimonialItem>(data.testimonials), index, { ...item, name }) })} />
                  <TextField label="Role" value={item.role} onChange={(role) => onChange({ ...data, testimonials: replaceAt(arrayValue<TestimonialItem>(data.testimonials), index, { ...item, role }) })} />
                </div>
              </div>
            )}
          />
        </div>
      );
    case "cta-band":
      return (
        <div className="grid gap-3">
          <TextField label="Eyebrow" value={stringValue(data.eyebrow)} onChange={(eyebrow) => onChange({ ...data, eyebrow })} />
          <TextField label="Heading" value={stringValue(data.heading)} onChange={(heading) => onChange({ ...data, heading })} />
          <TextareaField label="Body" value={stringValue(data.body)} rows={3} onChange={(body) => onChange({ ...data, body })} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Primary CTA Label" value={stringValue(data.primaryCtaLabel)} onChange={(primaryCtaLabel) => onChange({ ...data, primaryCtaLabel })} />
            <TextField label="Primary CTA URL" value={stringValue(data.primaryCtaUrl)} onChange={(primaryCtaUrl) => onChange({ ...data, primaryCtaUrl })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Secondary CTA Label" value={stringValue(data.secondaryCtaLabel)} onChange={(secondaryCtaLabel) => onChange({ ...data, secondaryCtaLabel })} />
            <TextField label="Secondary CTA URL" value={stringValue(data.secondaryCtaUrl)} onChange={(secondaryCtaUrl) => onChange({ ...data, secondaryCtaUrl })} />
          </div>
        </div>
      );
    case "rich-text":
      return (
        <div className="grid gap-3">
          <TextField label="Eyebrow" value={stringValue(data.eyebrow)} onChange={(eyebrow) => onChange({ ...data, eyebrow })} />
          <TextField label="Heading" value={stringValue(data.heading)} onChange={(heading) => onChange({ ...data, heading })} />
          <TextareaField label="Body" value={stringValue(data.body)} rows={6} onChange={(body) => onChange({ ...data, body })} />
        </div>
      );
  }
}

function MediaField({
  label,
  mediaId,
  onChange,
}: {
  label: string;
  mediaId: string;
  onChange: (mediaId: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <MediaPicker
        label={mediaId ? "Change Image" : "Select Image"}
        selectedId={mediaId ? (mediaId as never) : undefined}
        allowedTypes={["image"]}
        onSelect={(selectedId) => onChange(String(selectedId))}
        onClear={() => onChange("")}
      />
    </div>
  );
}

function ArrayBlock<T>({
  title,
  items,
  onAdd,
  onRemove,
  renderItem,
}: {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{title}</Label>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          Add Item
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="space-y-2 border border-border p-3">
            {renderItem(item, index)}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId} className="text-xs font-medium">{label}</Label>
      <input
        id={fieldId}
        name={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full border border-border bg-background px-3 text-sm outline-hidden focus:border-primary"
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId} className="text-xs font-medium">{label}</Label>
      <textarea
        id={fieldId}
        name={fieldId}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId} className="text-xs font-medium">{label}</Label>
      <select
        id={fieldId}
        name={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 w-full border border-border bg-background px-3 text-sm")}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function sectionLabel(type: PageSectionType) {
  switch (type) {
    case "hero":
      return "Hero";
    case "feature-grid":
      return "Feature Grid";
    case "story-split":
      return "Story Split";
    case "pricing-cards":
      return "Pricing Cards";
    case "testimonial-band":
      return "Testimonial Band";
    case "cta-band":
      return "CTA Band";
    case "rich-text":
      return "Rich Text";
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function replaceAt<T>(items: T[], index: number, nextItem: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}
