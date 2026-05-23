import {
  AlignLeft,
  BadgeDollarSign,
  Bookmark,
  CalendarClock,
  Code as CodeIcon,
  Columns2,
  FormInput,
  Globe,
  GraduationCap,
  Grid3x3,
  HelpCircle,
  Heading as HeadingIcon,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Layers,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Mail,
  Map as MapIcon,
  MessageCircle,
  Minus,
  MousePointerClick,
  Newspaper,
  Pilcrow,
  Quote as QuoteIcon,
  Rows3,
  SeparatorHorizontal,
  ShoppingBag,
  Sparkles,
  Tag as TagIcon,
  Users2,
  Video,
} from "lucide-react";

import { MediaField } from "@/components/media/MediaField";
import type {
  AdminBlockDefinition,
  BlockName,
  ConvexPressBlock,
} from "./types";
import {
  accordionAttrsSchema,
  authorBioAttrsSchema,
  bentoGridAttrsSchema,
  bookingCtaAttrsSchema,
  codeAttrsSchema,
  comparisonTableAttrsSchema,
  contactFormAttrsSchema,
  ctaBandAttrsSchema,
  ctaWithFormAttrsSchema,
  dividerAttrsSchema,
  embedAttrsSchema,
  faqAttrsSchema,
  featureGridAttrsSchema,
  featureListAlternatingAttrsSchema,
  featuredProductsAttrsSchema,
  headingAttrsSchema,
  heroAttrsSchema,
  heroSplitAttrsSchema,
  heroTextOnlyAttrsSchema,
  imageAttrsSchema,
  latestPostsAttrsSchema,
  listAttrsSchema,
  logoCloudAttrsSchema,
  mediaTextAttrsSchema,
  newsletterSignupAttrsSchema,
  paragraphAttrsSchema,
  pricingCardsAttrsSchema,
  processStepsAttrsSchema,
  quoteAttrsSchema,
  richTextAttrsSchema,
  roadmapTimelineAttrsSchema,
  socialLinksAttrsSchema,
  spacerAttrsSchema,
  statsBandAttrsSchema,
  tabsAttrsSchema,
  tagCloudAttrsSchema,
  teamGridAttrsSchema,
  testimonialAttrsSchema,
  type AccordionAttrs,
  type AuthorBioAttrs,
  type BentoGridAttrs,
  type BookingCtaAttrs,
  type CodeAttrs,
  type ComparisonTableAttrs,
  type ContactFormAttrs,
  type CtaBandAttrs,
  type CtaWithFormAttrs,
  type DividerAttrs,
  type EmbedAttrs,
  type FaqAttrs,
  type FeatureGridAttrs,
  type FeatureListAlternatingAttrs,
  type FeaturedProductsAttrs,
  type HeadingAttrs,
  type HeroAttrs,
  type HeroSplitAttrs,
  type HeroTextOnlyAttrs,
  type ImageAttrs,
  type LatestPostsAttrs,
  type ListAttrs,
  type LogoCloudAttrs,
  type MediaTextAttrs,
  type NewsletterSignupAttrs,
  type ParagraphAttrs,
  type PricingCardsAttrs,
  type ProcessStepsAttrs,
  type QuoteAttrs,
  type RichTextAttrs,
  type RoadmapTimelineAttrs,
  type SocialLinksAttrs,
  type SpacerAttrs,
  type StatsBandAttrs,
  type TabsAttrs,
  type TagCloudAttrs,
  type TeamGridAttrs,
  type TestimonialAttrs,
} from "./schemas";

// ============================================================================
// Shared field components — content fields only, no design controls.
// ============================================================================

function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  rows = 3,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className="border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="size-4 border border-border bg-background"
      />
      {label}
    </label>
  );
}

function SelectField<TValue extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: TValue;
  options: Array<[TValue, string]>;
  onChange: (value: TValue) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          const original = options.find(([v]) => String(v) === raw)?.[0];
          if (original !== undefined) onChange(original);
        }}
        disabled={disabled}
        className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={String(optionValue)} value={String(optionValue)}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function RepeaterHeader({
  label,
  disabled,
  onAdd,
}: {
  label: string;
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        Add item
      </button>
    </div>
  );
}

function RemoveRepeaterButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="justify-self-start text-xs text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}

// ============================================================================
// Wave A — content blocks
// ============================================================================

function ParagraphEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: ParagraphAttrs;
  onChange: (attrs: ParagraphAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextareaField
        label="Body"
        value={attrs.body}
        disabled={disabled}
        rows={5}
        placeholder="Write a paragraph. Supports **bold**, *italic*, and [links](https://...)."
        onChange={(body) => onChange({ ...attrs, body })}
      />
    </div>
  );
}

function HeadingEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: HeadingAttrs;
  onChange: (attrs: HeadingAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField
        label="Heading"
        value={attrs.text}
        disabled={disabled}
        onChange={(text) => onChange({ ...attrs, text })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField<number>
          label="Level"
          value={attrs.level}
          disabled={disabled}
          options={[
            [1, "H1"],
            [2, "H2"],
            [3, "H3"],
            [4, "H4"],
            [5, "H5"],
            [6, "H6"],
          ]}
          onChange={(level) => onChange({ ...attrs, level: level as HeadingAttrs["level"] })}
        />
        <TextField
          label="Anchor (optional)"
          value={attrs.anchor}
          disabled={disabled}
          placeholder="section-slug"
          onChange={(anchor) => onChange({ ...attrs, anchor })}
        />
      </div>
    </div>
  );
}

function ListEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: ListAttrs;
  onChange: (attrs: ListAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<ListAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="grid gap-3">
      <SelectField<ListAttrs["style"]>
        label="Style"
        value={attrs.style}
        disabled={disabled}
        options={[
          ["bullet", "Bulleted"],
          ["ordered", "Numbered"],
          ["task", "Task list (checkboxes)"],
        ]}
        onChange={(style) => onChange({ ...attrs, style })}
      />
      <div className="grid gap-2">
        <RepeaterHeader
          label="Items"
          disabled={disabled}
          onAdd={() =>
            onChange({ ...attrs, items: [...attrs.items, { text: "" }] })
          }
        />
        {attrs.items.map((item, index) => (
          <div key={index} className="grid gap-2 border border-border bg-background p-3">
            <TextField
              label={`Item ${index + 1}`}
              value={item.text}
              disabled={disabled}
              onChange={(text) => updateItem(index, { text })}
            />
            {attrs.style === "task" && (
              <CheckboxField
                label="Completed"
                checked={item.done ?? false}
                disabled={disabled}
                onChange={(done) => updateItem(index, { done })}
              />
            )}
            <RemoveRepeaterButton
              label="Remove item"
              disabled={disabled || attrs.items.length === 1}
              onClick={() =>
                onChange({
                  ...attrs,
                  items: attrs.items.filter((_, i) => i !== index),
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: ImageAttrs;
  onChange: (attrs: ImageAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <MediaField
        label="Image"
        value={attrs.mediaId}
        disabled={disabled}
        promptSeed={attrs.alt || attrs.caption || ""}
        onChange={(mediaId) => onChange({ ...attrs, mediaId })}
      />
      <TextField
        label="Alt text"
        value={attrs.alt}
        disabled={disabled}
        placeholder="Describe the image for screen readers"
        onChange={(alt) => onChange({ ...attrs, alt })}
      />
      <TextField
        label="Caption (optional)"
        value={attrs.caption}
        disabled={disabled}
        onChange={(caption) => onChange({ ...attrs, caption })}
      />
      <TextField
        label="Link URL (optional)"
        value={attrs.href}
        disabled={disabled}
        placeholder="https://..."
        onChange={(href) => onChange({ ...attrs, href })}
      />
    </div>
  );
}

function QuoteEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: QuoteAttrs;
  onChange: (attrs: QuoteAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextareaField
        label="Quote"
        value={attrs.text}
        disabled={disabled}
        rows={4}
        onChange={(text) => onChange({ ...attrs, text })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="Attribution (optional)"
          value={attrs.cite}
          disabled={disabled}
          placeholder="Author or source"
          onChange={(cite) => onChange({ ...attrs, cite })}
        />
        <TextField
          label="Source URL (optional)"
          value={attrs.source}
          disabled={disabled}
          placeholder="https://..."
          onChange={(source) => onChange({ ...attrs, source })}
        />
      </div>
    </div>
  );
}

function CodeEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: CodeAttrs;
  onChange: (attrs: CodeAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="Language"
          value={attrs.language}
          disabled={disabled}
          placeholder="typescript, python, ..."
          onChange={(language) => onChange({ ...attrs, language })}
        />
        <TextField
          label="Filename (optional)"
          value={attrs.filename}
          disabled={disabled}
          onChange={(filename) => onChange({ ...attrs, filename })}
        />
      </div>
      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Code</span>
        <textarea
          value={attrs.code}
          onChange={(event) => onChange({ ...attrs, code: event.target.value })}
          rows={10}
          disabled={disabled}
          spellCheck={false}
          className="border border-border bg-background px-2.5 py-2 font-mono text-xs text-foreground outline-hidden transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
    </div>
  );
}

function DividerEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: DividerAttrs;
  onChange: (attrs: DividerAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <SelectField<DividerAttrs["variant"]>
      label="Variant"
      value={attrs.variant}
      disabled={disabled}
      options={[
        ["default", "Default"],
        ["section", "Section break"],
        ["subtle", "Subtle"],
      ]}
      onChange={(variant) => onChange({ ...attrs, variant })}
    />
  );
}

function SpacerEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: SpacerAttrs;
  onChange: (attrs: SpacerAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <SelectField<SpacerAttrs["size"]>
      label="Size"
      value={attrs.size}
      disabled={disabled}
      options={[
        ["small", "Small"],
        ["medium", "Medium"],
        ["large", "Large"],
        ["xlarge", "Extra large"],
      ]}
      onChange={(size) => onChange({ ...attrs, size })}
    />
  );
}

function EmbedEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: EmbedAttrs;
  onChange: (attrs: EmbedAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField
        label="URL"
        value={attrs.url}
        disabled={disabled}
        placeholder="https://youtube.com/watch?v=... | https://vimeo.com/... | https://twitter.com/..."
        onChange={(url) => onChange({ ...attrs, url })}
      />
      <TextField
        label="Caption (optional)"
        value={attrs.caption}
        disabled={disabled}
        onChange={(caption) => onChange({ ...attrs, caption })}
      />
    </div>
  );
}

// ============================================================================
// Marketing block editors (kept, no layout strip)
// ============================================================================

function HeroEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: HeroAttrs;
  onChange: (attrs: HeroAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Title" value={attrs.title} disabled={disabled} onChange={(title) => onChange({ ...attrs, title })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={4} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Primary CTA Label" value={attrs.primaryCtaLabel} disabled={disabled} onChange={(primaryCtaLabel) => onChange({ ...attrs, primaryCtaLabel })} />
        <TextField label="Primary CTA URL" value={attrs.primaryCtaUrl} disabled={disabled} onChange={(primaryCtaUrl) => onChange({ ...attrs, primaryCtaUrl })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Secondary CTA Label" value={attrs.secondaryCtaLabel} disabled={disabled} onChange={(secondaryCtaLabel) => onChange({ ...attrs, secondaryCtaLabel })} />
        <TextField label="Secondary CTA URL" value={attrs.secondaryCtaUrl} disabled={disabled} onChange={(secondaryCtaUrl) => onChange({ ...attrs, secondaryCtaUrl })} />
      </div>
      <MediaField label="Hero image" value={attrs.mediaId} disabled={disabled} promptSeed={attrs.title || attrs.body} onChange={(mediaId) => onChange({ ...attrs, mediaId })} />
    </div>
  );
}

function RichTextEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: RichTextAttrs;
  onChange: (attrs: RichTextAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={6} onChange={(body) => onChange({ ...attrs, body })} />
    </div>
  );
}

function FeatureGridEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: FeatureGridAttrs;
  onChange: (attrs: FeatureGridAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<FeatureGridAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-2">
        <RepeaterHeader
          label="Feature Cards"
          disabled={disabled}
          onAdd={() =>
            onChange({ ...attrs, items: [...attrs.items, { title: "", description: "" }] })
          }
        />
        {attrs.items.map((item, index) => (
          <div key={index} className="grid gap-2 border border-border bg-background p-3">
            <TextField label="Title" value={item.title} disabled={disabled} onChange={(title) => updateItem(index, { title })} />
            <TextareaField label="Description" value={item.description} disabled={disabled} rows={2} onChange={(description) => updateItem(index, { description })} />
            <RemoveRepeaterButton
              label="Remove card"
              disabled={disabled}
              onClick={() =>
                onChange({ ...attrs, items: attrs.items.filter((_, itemIndex) => itemIndex !== index) })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CtaBandEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: CtaBandAttrs;
  onChange: (attrs: CtaBandAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Primary CTA Label" value={attrs.primaryCtaLabel} disabled={disabled} onChange={(primaryCtaLabel) => onChange({ ...attrs, primaryCtaLabel })} />
        <TextField label="Primary CTA URL" value={attrs.primaryCtaUrl} disabled={disabled} onChange={(primaryCtaUrl) => onChange({ ...attrs, primaryCtaUrl })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Secondary CTA Label" value={attrs.secondaryCtaLabel} disabled={disabled} onChange={(secondaryCtaLabel) => onChange({ ...attrs, secondaryCtaLabel })} />
        <TextField label="Secondary CTA URL" value={attrs.secondaryCtaUrl} disabled={disabled} onChange={(secondaryCtaUrl) => onChange({ ...attrs, secondaryCtaUrl })} />
      </div>
    </div>
  );
}

function MediaTextEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: MediaTextAttrs;
  onChange: (attrs: MediaTextAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={5} onChange={(body) => onChange({ ...attrs, body })} />
      <MediaField label="Image" value={attrs.mediaId} disabled={disabled} promptSeed={attrs.heading || attrs.body} onChange={(mediaId) => onChange({ ...attrs, mediaId })} />
      <TextField label="Media Alt" value={attrs.mediaAlt} disabled={disabled} onChange={(mediaAlt) => onChange({ ...attrs, mediaAlt })} />
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField<MediaTextAttrs["mediaPosition"]>
          label="Media Position"
          value={attrs.mediaPosition}
          disabled={disabled}
          options={[
            ["left", "Left"],
            ["right", "Right"],
          ]}
          onChange={(mediaPosition) => onChange({ ...attrs, mediaPosition })}
        />
        <TextField label="CTA Label" value={attrs.ctaLabel} disabled={disabled} onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })} />
        <TextField label="CTA URL" value={attrs.ctaUrl} disabled={disabled} onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })} />
      </div>
    </div>
  );
}

function TestimonialsEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: TestimonialAttrs;
  onChange: (attrs: TestimonialAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<TestimonialAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader label="Testimonials" disabled={disabled} onAdd={() => onChange({ ...attrs, items: [...attrs.items, { quote: "", name: "", role: "" }] })} />
      {attrs.items.map((item, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextareaField label="Quote" value={item.quote} disabled={disabled} rows={3} onChange={(quote) => updateItem(index, { quote })} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Name" value={item.name} disabled={disabled} onChange={(name) => updateItem(index, { name })} />
            <TextField label="Role" value={item.role} disabled={disabled} onChange={(role) => updateItem(index, { role })} />
          </div>
          <RemoveRepeaterButton disabled={disabled} label="Remove testimonial" onClick={() => onChange({ ...attrs, items: attrs.items.filter((_, itemIndex) => itemIndex !== index) })} />
        </div>
      ))}
    </div>
  );
}

function PricingCardsEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: PricingCardsAttrs;
  onChange: (attrs: PricingCardsAttrs) => void;
  disabled?: boolean;
}) {
  const updatePlan = (
    index: number,
    patch: Partial<PricingCardsAttrs["plans"][number]>,
  ) => {
    onChange({
      ...attrs,
      plans: attrs.plans.map((plan, planIndex) =>
        planIndex === index ? { ...plan, ...patch } : plan,
      ),
    });
  };

  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader label="Plans" disabled={disabled} onAdd={() => onChange({ ...attrs, plans: [...attrs.plans, { name: "", price: "", description: "", features: [], ctaLabel: "", ctaUrl: "", featured: false }] })} />
      {attrs.plans.map((plan, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Plan Name" value={plan.name} disabled={disabled} onChange={(name) => updatePlan(index, { name })} />
            <TextField label="Price" value={plan.price} disabled={disabled} onChange={(price) => updatePlan(index, { price })} />
          </div>
          <TextareaField label="Description" value={plan.description} disabled={disabled} rows={2} onChange={(description) => updatePlan(index, { description })} />
          <TextareaField
            label="Features"
            value={plan.features.join("\n")}
            disabled={disabled}
            rows={4}
            onChange={(value) => updatePlan(index, { features: value.split("\n").map((feature) => feature.trim()).filter(Boolean) })}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="CTA Label" value={plan.ctaLabel} disabled={disabled} onChange={(ctaLabel) => updatePlan(index, { ctaLabel })} />
            <TextField label="CTA URL" value={plan.ctaUrl} disabled={disabled} onChange={(ctaUrl) => updatePlan(index, { ctaUrl })} />
          </div>
          <CheckboxField label="Featured plan" checked={plan.featured} disabled={disabled} onChange={(featured) => updatePlan(index, { featured })} />
          <RemoveRepeaterButton disabled={disabled} label="Remove plan" onClick={() => onChange({ ...attrs, plans: attrs.plans.filter((_, planIndex) => planIndex !== index) })} />
        </div>
      ))}
    </div>
  );
}

function FaqEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: FaqAttrs;
  onChange: (attrs: FaqAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<FaqAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader label="Questions" disabled={disabled} onAdd={() => onChange({ ...attrs, items: [...attrs.items, { question: "", answer: "" }] })} />
      {attrs.items.map((item, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextField label="Question" value={item.question} disabled={disabled} onChange={(question) => updateItem(index, { question })} />
          <TextareaField label="Answer" value={item.answer} disabled={disabled} rows={3} onChange={(answer) => updateItem(index, { answer })} />
          <RemoveRepeaterButton disabled={disabled} label="Remove question" onClick={() => onChange({ ...attrs, items: attrs.items.filter((_, itemIndex) => itemIndex !== index) })} />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Wave B — additional marketing block editors
// ============================================================================

function HeroTextOnlyEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: HeroTextOnlyAttrs;
  onChange: (attrs: HeroTextOnlyAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Title" value={attrs.title} disabled={disabled} onChange={(title) => onChange({ ...attrs, title })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={4} onChange={(body) => onChange({ ...attrs, body })} />
      <SelectField<HeroTextOnlyAttrs["alignment"]>
        label="Alignment"
        value={attrs.alignment}
        disabled={disabled}
        options={[["center", "Center"], ["left", "Left"]]}
        onChange={(alignment) => onChange({ ...attrs, alignment })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Primary CTA Label" value={attrs.primaryCtaLabel} disabled={disabled} onChange={(primaryCtaLabel) => onChange({ ...attrs, primaryCtaLabel })} />
        <TextField label="Primary CTA URL" value={attrs.primaryCtaUrl} disabled={disabled} onChange={(primaryCtaUrl) => onChange({ ...attrs, primaryCtaUrl })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Secondary CTA Label" value={attrs.secondaryCtaLabel} disabled={disabled} onChange={(secondaryCtaLabel) => onChange({ ...attrs, secondaryCtaLabel })} />
        <TextField label="Secondary CTA URL" value={attrs.secondaryCtaUrl} disabled={disabled} onChange={(secondaryCtaUrl) => onChange({ ...attrs, secondaryCtaUrl })} />
      </div>
    </div>
  );
}

function HeroSplitEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: HeroSplitAttrs;
  onChange: (attrs: HeroSplitAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Title" value={attrs.title} disabled={disabled} onChange={(title) => onChange({ ...attrs, title })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={4} onChange={(body) => onChange({ ...attrs, body })} />
      <MediaField label="Hero image" value={attrs.mediaId} disabled={disabled} promptSeed={attrs.title || attrs.body} onChange={(mediaId) => onChange({ ...attrs, mediaId })} />
      <TextField label="Media Alt" value={attrs.mediaAlt} disabled={disabled} onChange={(mediaAlt) => onChange({ ...attrs, mediaAlt })} />
      <SelectField<HeroSplitAttrs["mediaSide"]>
        label="Media Side"
        value={attrs.mediaSide}
        disabled={disabled}
        options={[["right", "Right"], ["left", "Left"]]}
        onChange={(mediaSide) => onChange({ ...attrs, mediaSide })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Primary CTA Label" value={attrs.primaryCtaLabel} disabled={disabled} onChange={(primaryCtaLabel) => onChange({ ...attrs, primaryCtaLabel })} />
        <TextField label="Primary CTA URL" value={attrs.primaryCtaUrl} disabled={disabled} onChange={(primaryCtaUrl) => onChange({ ...attrs, primaryCtaUrl })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Secondary CTA Label" value={attrs.secondaryCtaLabel} disabled={disabled} onChange={(secondaryCtaLabel) => onChange({ ...attrs, secondaryCtaLabel })} />
        <TextField label="Secondary CTA URL" value={attrs.secondaryCtaUrl} disabled={disabled} onChange={(secondaryCtaUrl) => onChange({ ...attrs, secondaryCtaUrl })} />
      </div>
    </div>
  );
}

function FeatureListAlternatingEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: FeatureListAlternatingAttrs;
  onChange: (attrs: FeatureListAlternatingAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<FeatureListAlternatingAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader
        label="Items"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, items: [...attrs.items, { title: "", body: "", mediaId: "", mediaAlt: "", ctaLabel: "", ctaUrl: "" }] })}
      />
      {attrs.items.map((item, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextField label="Title" value={item.title} disabled={disabled} onChange={(title) => updateItem(index, { title })} />
          <TextareaField label="Body" value={item.body} disabled={disabled} rows={3} onChange={(body) => updateItem(index, { body })} />
          <div className="grid gap-3 md:grid-cols-2">
            <MediaField label="Image" value={item.mediaId} disabled={disabled} promptSeed={item.title || item.body} onChange={(mediaId) => updateItem(index, { mediaId })} />
            <TextField label="Media Alt" value={item.mediaAlt} disabled={disabled} onChange={(mediaAlt) => updateItem(index, { mediaAlt })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="CTA Label" value={item.ctaLabel} disabled={disabled} onChange={(ctaLabel) => updateItem(index, { ctaLabel })} />
            <TextField label="CTA URL" value={item.ctaUrl} disabled={disabled} onChange={(ctaUrl) => updateItem(index, { ctaUrl })} />
          </div>
          <RemoveRepeaterButton
            label="Remove item"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, items: attrs.items.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function LogoCloudEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: LogoCloudAttrs;
  onChange: (attrs: LogoCloudAttrs) => void;
  disabled?: boolean;
}) {
  const updateLogo = (
    index: number,
    patch: Partial<LogoCloudAttrs["logos"][number]>,
  ) => {
    onChange({
      ...attrs,
      logos: attrs.logos.map((logo, i) => (i === index ? { ...logo, ...patch } : logo)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <RepeaterHeader
        label="Logos"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, logos: [...attrs.logos, { name: "", mediaId: "", href: "" }] })}
      />
      {attrs.logos.map((logo, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <TextField label="Name" value={logo.name} disabled={disabled} onChange={(name) => updateLogo(index, { name })} />
            <MediaField label="Logo" value={logo.mediaId} disabled={disabled} promptSeed={`${logo.name} logo, white background, vector style`} onChange={(mediaId) => updateLogo(index, { mediaId })} />
            <TextField label="Link URL (optional)" value={logo.href} disabled={disabled} onChange={(href) => updateLogo(index, { href })} />
          </div>
          <RemoveRepeaterButton
            label="Remove logo"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, logos: attrs.logos.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function StatsBandEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: StatsBandAttrs;
  onChange: (attrs: StatsBandAttrs) => void;
  disabled?: boolean;
}) {
  const updateStat = (
    index: number,
    patch: Partial<StatsBandAttrs["stats"][number]>,
  ) => {
    onChange({
      ...attrs,
      stats: attrs.stats.map((stat, i) => (i === index ? { ...stat, ...patch } : stat)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader
        label="Stats"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, stats: [...attrs.stats, { value: "", label: "" }] })}
      />
      {attrs.stats.map((stat, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Value" value={stat.value} disabled={disabled} onChange={(value) => updateStat(index, { value })} />
            <TextField label="Label" value={stat.label} disabled={disabled} onChange={(label) => updateStat(index, { label })} />
          </div>
          <RemoveRepeaterButton
            label="Remove stat"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, stats: attrs.stats.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function TeamGridEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: TeamGridAttrs;
  onChange: (attrs: TeamGridAttrs) => void;
  disabled?: boolean;
}) {
  const updateMember = (
    index: number,
    patch: Partial<TeamGridAttrs["members"][number]>,
  ) => {
    onChange({
      ...attrs,
      members: attrs.members.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader
        label="Team members"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, members: [...attrs.members, { name: "", role: "", bio: "", mediaId: "", href: "" }] })}
      />
      {attrs.members.map((member, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Name" value={member.name} disabled={disabled} onChange={(name) => updateMember(index, { name })} />
            <TextField label="Role" value={member.role} disabled={disabled} onChange={(role) => updateMember(index, { role })} />
          </div>
          <TextareaField label="Bio" value={member.bio} disabled={disabled} rows={2} onChange={(bio) => updateMember(index, { bio })} />
          <MediaField label="Photo" value={member.mediaId} disabled={disabled} promptSeed={`portrait of ${member.name || "a team member"}, professional headshot`} onChange={(mediaId) => updateMember(index, { mediaId })} />
          <TextField label="Link URL" value={member.href} disabled={disabled} onChange={(href) => updateMember(index, { href })} />
          <RemoveRepeaterButton
            label="Remove member"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, members: attrs.members.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function ComparisonTableEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: ComparisonTableAttrs;
  onChange: (attrs: ComparisonTableAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <TextField
        label="Columns (comma separated — first is row label header)"
        value={attrs.columns.join(", ")}
        disabled={disabled}
        onChange={(value) =>
          onChange({
            ...attrs,
            columns: value.split(",").map((c) => c.trim()).filter(Boolean),
          })
        }
      />
      <RepeaterHeader
        label="Rows"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, rows: [...attrs.rows, { label: "", cells: [] }] })}
      />
      {attrs.rows.map((row, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextField
            label="Row label"
            value={row.label}
            disabled={disabled}
            onChange={(label) =>
              onChange({
                ...attrs,
                rows: attrs.rows.map((r, i) => (i === index ? { ...r, label } : r)),
              })
            }
          />
          <TextField
            label={`Cells (comma separated, ${attrs.columns.length - 1} expected)`}
            value={row.cells.join(", ")}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                ...attrs,
                rows: attrs.rows.map((r, i) =>
                  i === index ? { ...r, cells: value.split(",").map((c) => c.trim()) } : r,
                ),
              })
            }
          />
          <RemoveRepeaterButton
            label="Remove row"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, rows: attrs.rows.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function ProcessStepsEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: ProcessStepsAttrs;
  onChange: (attrs: ProcessStepsAttrs) => void;
  disabled?: boolean;
}) {
  const updateStep = (
    index: number,
    patch: Partial<ProcessStepsAttrs["steps"][number]>,
  ) => {
    onChange({
      ...attrs,
      steps: attrs.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader
        label="Steps"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, steps: [...attrs.steps, { title: "", body: "" }] })}
      />
      {attrs.steps.map((step, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextField label={`Step ${index + 1} title`} value={step.title} disabled={disabled} onChange={(title) => updateStep(index, { title })} />
          <TextareaField label="Description" value={step.body} disabled={disabled} rows={3} onChange={(body) => updateStep(index, { body })} />
          <RemoveRepeaterButton
            label="Remove step"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, steps: attrs.steps.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function RoadmapTimelineEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: RoadmapTimelineAttrs;
  onChange: (attrs: RoadmapTimelineAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<RoadmapTimelineAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader
        label="Roadmap items"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, items: [...attrs.items, { label: "", title: "", body: "", status: "planned" }] })}
      />
      {attrs.items.map((item, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Label (e.g. Q3 2026)" value={item.label} disabled={disabled} onChange={(label) => updateItem(index, { label })} />
            <SelectField<RoadmapTimelineAttrs["items"][number]["status"]>
              label="Status"
              value={item.status}
              disabled={disabled}
              options={[["done", "Done"], ["in_progress", "In progress"], ["planned", "Planned"]]}
              onChange={(status) => updateItem(index, { status })}
            />
          </div>
          <TextField label="Title" value={item.title} disabled={disabled} onChange={(title) => updateItem(index, { title })} />
          <TextareaField label="Description" value={item.body} disabled={disabled} rows={2} onChange={(body) => updateItem(index, { body })} />
          <RemoveRepeaterButton
            label="Remove item"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, items: attrs.items.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function BentoGridEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: BentoGridAttrs;
  onChange: (attrs: BentoGridAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<BentoGridAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader
        label="Cells"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, items: [...attrs.items, { title: "", body: "", mediaId: "", size: "medium", ctaLabel: "", ctaUrl: "" }] })}
      />
      {attrs.items.map((item, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextField label="Title" value={item.title} disabled={disabled} onChange={(title) => updateItem(index, { title })} />
          <TextareaField label="Body" value={item.body} disabled={disabled} rows={2} onChange={(body) => updateItem(index, { body })} />
          <div className="grid gap-3 md:grid-cols-3">
            <SelectField<BentoGridAttrs["items"][number]["size"]>
              label="Cell size"
              value={item.size}
              disabled={disabled}
              options={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]]}
              onChange={(size) => updateItem(index, { size })}
            />
            <TextField label="CTA URL" value={item.ctaUrl} disabled={disabled} onChange={(ctaUrl) => updateItem(index, { ctaUrl })} />
          </div>
          <MediaField label="Cell media" value={item.mediaId} disabled={disabled} promptSeed={item.title || item.body} onChange={(mediaId) => updateItem(index, { mediaId })} />
          <TextField label="CTA Label" value={item.ctaLabel} disabled={disabled} onChange={(ctaLabel) => updateItem(index, { ctaLabel })} />
          <RemoveRepeaterButton
            label="Remove cell"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, items: attrs.items.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Wave C — forms / conversions
// ============================================================================

function ContactFormEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: ContactFormAttrs;
  onChange: (attrs: ContactFormAttrs) => void;
  disabled?: boolean;
}) {
  const updateField = (
    index: number,
    patch: Partial<ContactFormAttrs["fields"][number]>,
  ) => {
    onChange({
      ...attrs,
      fields: attrs.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Submit button label" value={attrs.submitLabel} disabled={disabled} onChange={(submitLabel) => onChange({ ...attrs, submitLabel })} />
        <TextField label="Recipient email" value={attrs.recipientEmail} disabled={disabled} onChange={(recipientEmail) => onChange({ ...attrs, recipientEmail })} />
      </div>
      <TextField label="Success message" value={attrs.successMessage} disabled={disabled} onChange={(successMessage) => onChange({ ...attrs, successMessage })} />
      <RepeaterHeader
        label="Fields"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, fields: [...attrs.fields, { name: "field", label: "Field", type: "text", required: false, placeholder: "", options: [] }] })}
      />
      {attrs.fields.map((field, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <TextField label="Name" value={field.name} disabled={disabled} onChange={(name) => updateField(index, { name })} />
            <TextField label="Label" value={field.label} disabled={disabled} onChange={(label) => updateField(index, { label })} />
            <SelectField<ContactFormAttrs["fields"][number]["type"]>
              label="Type"
              value={field.type}
              disabled={disabled}
              options={[["text", "Text"], ["email", "Email"], ["tel", "Phone"], ["textarea", "Long text"], ["select", "Select"]]}
              onChange={(type) => updateField(index, { type })}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Placeholder" value={field.placeholder} disabled={disabled} onChange={(placeholder) => updateField(index, { placeholder })} />
            <CheckboxField label="Required" checked={field.required} disabled={disabled} onChange={(required) => updateField(index, { required })} />
          </div>
          {field.type === "select" && (
            <TextareaField
              label="Options (one per line)"
              value={field.options.join("\n")}
              disabled={disabled}
              rows={3}
              onChange={(value) => updateField(index, { options: value.split("\n").map((s) => s.trim()).filter(Boolean) })}
            />
          )}
          <RemoveRepeaterButton
            label="Remove field"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, fields: attrs.fields.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function NewsletterSignupEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: NewsletterSignupAttrs;
  onChange: (attrs: NewsletterSignupAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Placeholder" value={attrs.placeholder} disabled={disabled} onChange={(placeholder) => onChange({ ...attrs, placeholder })} />
        <TextField label="Submit label" value={attrs.submitLabel} disabled={disabled} onChange={(submitLabel) => onChange({ ...attrs, submitLabel })} />
      </div>
      <TextField label="Success message" value={attrs.successMessage} disabled={disabled} onChange={(successMessage) => onChange({ ...attrs, successMessage })} />
      <SelectField<NewsletterSignupAttrs["variant"]>
        label="Variant"
        value={attrs.variant}
        disabled={disabled}
        options={[["inline", "Inline"], ["large", "Large"]]}
        onChange={(variant) => onChange({ ...attrs, variant })}
      />
    </div>
  );
}

function CtaWithFormEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: CtaWithFormAttrs;
  onChange: (attrs: CtaWithFormAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Placeholder" value={attrs.placeholder} disabled={disabled} onChange={(placeholder) => onChange({ ...attrs, placeholder })} />
        <TextField label="Submit label" value={attrs.submitLabel} disabled={disabled} onChange={(submitLabel) => onChange({ ...attrs, submitLabel })} />
      </div>
      <TextField label="Fine print (optional)" value={attrs.fineprint} disabled={disabled} onChange={(fineprint) => onChange({ ...attrs, fineprint })} />
    </div>
  );
}

function BookingCtaEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: BookingCtaAttrs;
  onChange: (attrs: BookingCtaAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={3} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="CTA Label" value={attrs.ctaLabel} disabled={disabled} onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })} />
        <TextField label="CTA URL" value={attrs.ctaUrl} disabled={disabled} onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })} />
      </div>
      <TextField label="Embed URL (Cal.com / Calendly — optional)" value={attrs.embedUrl} disabled={disabled} onChange={(embedUrl) => onChange({ ...attrs, embedUrl })} />
    </div>
  );
}

// ============================================================================
// Wave D — content discovery
// ============================================================================

function LatestPostsEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: LatestPostsAttrs;
  onChange: (attrs: LatestPostsAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Count</span>
          <input
            type="number"
            min={1}
            max={24}
            value={attrs.count}
            disabled={disabled}
            onChange={(e) => onChange({ ...attrs, count: Math.max(1, Math.min(24, Number(e.target.value) || 3)) })}
            className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden focus:border-primary"
          />
        </label>
        <TextField label="Category slug (optional)" value={attrs.categorySlug} disabled={disabled} onChange={(categorySlug) => onChange({ ...attrs, categorySlug })} />
        <TextField label="Tag slug (optional)" value={attrs.tagSlug} disabled={disabled} onChange={(tagSlug) => onChange({ ...attrs, tagSlug })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CheckboxField label="Show excerpts" checked={attrs.showExcerpts} disabled={disabled} onChange={(showExcerpts) => onChange({ ...attrs, showExcerpts })} />
        <CheckboxField label="Show authors" checked={attrs.showAuthors} disabled={disabled} onChange={(showAuthors) => onChange({ ...attrs, showAuthors })} />
      </div>
    </div>
  );
}

function FeaturedProductsEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: FeaturedProductsAttrs;
  onChange: (attrs: FeaturedProductsAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Body" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <TextareaField
        label="Product IDs (one per line, optional — leave empty for latest)"
        value={attrs.productIds.join("\n")}
        disabled={disabled}
        rows={4}
        onChange={(value) => onChange({ ...attrs, productIds: value.split("\n").map((s) => s.trim()).filter(Boolean) })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Count</span>
          <input
            type="number"
            min={1}
            max={12}
            value={attrs.count}
            disabled={disabled}
            onChange={(e) => onChange({ ...attrs, count: Math.max(1, Math.min(12, Number(e.target.value) || 4)) })}
            className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden focus:border-primary"
          />
        </label>
        <CheckboxField label="Show price" checked={attrs.showPrice} disabled={disabled} onChange={(showPrice) => onChange({ ...attrs, showPrice })} />
      </div>
    </div>
  );
}

function AuthorBioEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: AuthorBioAttrs;
  onChange: (attrs: AuthorBioAttrs) => void;
  disabled?: boolean;
}) {
  const updateLink = (
    index: number,
    patch: Partial<AuthorBioAttrs["links"][number]>,
  ) => {
    onChange({
      ...attrs,
      links: attrs.links.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="User ID (leave empty to use the page author)" value={attrs.userId} disabled={disabled} onChange={(userId) => onChange({ ...attrs, userId })} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Name override" value={attrs.name} disabled={disabled} onChange={(name) => onChange({ ...attrs, name })} />
        <TextField label="Role" value={attrs.role} disabled={disabled} onChange={(role) => onChange({ ...attrs, role })} />
      </div>
      <TextareaField label="Bio" value={attrs.bio} disabled={disabled} rows={3} onChange={(bio) => onChange({ ...attrs, bio })} />
      <MediaField label="Photo" value={attrs.mediaId} disabled={disabled} promptSeed={`portrait of ${attrs.name || "the author"}, professional headshot`} onChange={(mediaId) => onChange({ ...attrs, mediaId })} />
      <RepeaterHeader
        label="Links"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, links: [...attrs.links, { label: "", href: "" }] })}
      />
      {attrs.links.map((link, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Label" value={link.label} disabled={disabled} onChange={(label) => updateLink(index, { label })} />
            <TextField label="URL" value={link.href} disabled={disabled} onChange={(href) => updateLink(index, { href })} />
          </div>
          <RemoveRepeaterButton
            label="Remove link"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, links: attrs.links.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function SocialLinksEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: SocialLinksAttrs;
  onChange: (attrs: SocialLinksAttrs) => void;
  disabled?: boolean;
}) {
  const updateLink = (
    index: number,
    patch: Partial<SocialLinksAttrs["links"][number]>,
  ) => {
    onChange({
      ...attrs,
      links: attrs.links.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Heading (optional)" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <RepeaterHeader
        label="Links"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, links: [...attrs.links, { platform: "", label: "", href: "" }] })}
      />
      {attrs.links.map((link, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <TextField label="Platform" value={link.platform} disabled={disabled} placeholder="twitter, github, linkedin..." onChange={(platform) => updateLink(index, { platform })} />
            <TextField label="Label" value={link.label} disabled={disabled} onChange={(label) => updateLink(index, { label })} />
            <TextField label="URL" value={link.href} disabled={disabled} onChange={(href) => updateLink(index, { href })} />
          </div>
          <RemoveRepeaterButton
            label="Remove link"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, links: attrs.links.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function TagCloudEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: TagCloudAttrs;
  onChange: (attrs: TagCloudAttrs) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <TextField label="Heading (optional)" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Max tags</span>
        <input
          type="number"
          min={1}
          max={100}
          value={attrs.max}
          disabled={disabled}
          onChange={(e) => onChange({ ...attrs, max: Math.max(1, Math.min(100, Number(e.target.value) || 30)) })}
          className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden focus:border-primary"
        />
      </label>
    </div>
  );
}

// ============================================================================
// Wave E — layout containers
// ============================================================================

function AccordionEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: AccordionAttrs;
  onChange: (attrs: AccordionAttrs) => void;
  disabled?: boolean;
}) {
  const updateItem = (
    index: number,
    patch: Partial<AccordionAttrs["items"][number]>,
  ) => {
    onChange({
      ...attrs,
      items: attrs.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <TextareaField label="Intro" value={attrs.body} disabled={disabled} rows={2} onChange={(body) => onChange({ ...attrs, body })} />
      <RepeaterHeader
        label="Items"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, items: [...attrs.items, { title: "", body: "" }] })}
      />
      {attrs.items.map((item, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextField label={`Item ${index + 1} title`} value={item.title} disabled={disabled} onChange={(title) => updateItem(index, { title })} />
          <TextareaField label="Body" value={item.body} disabled={disabled} rows={4} onChange={(body) => updateItem(index, { body })} />
          <RemoveRepeaterButton
            label="Remove item"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, items: attrs.items.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

function TabsEditor({
  attrs,
  onChange,
  disabled,
}: {
  attrs: TabsAttrs;
  onChange: (attrs: TabsAttrs) => void;
  disabled?: boolean;
}) {
  const updateTab = (
    index: number,
    patch: Partial<TabsAttrs["tabs"][number]>,
  ) => {
    onChange({
      ...attrs,
      tabs: attrs.tabs.map((tab, i) => (i === index ? { ...tab, ...patch } : tab)),
    });
  };
  return (
    <div className="grid gap-3">
      <TextField label="Heading (optional)" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      <RepeaterHeader
        label="Tabs"
        disabled={disabled}
        onAdd={() => onChange({ ...attrs, tabs: [...attrs.tabs, { label: "", body: "" }] })}
      />
      {attrs.tabs.map((tab, index) => (
        <div key={index} className="grid gap-2 border border-border bg-background p-3">
          <TextField label={`Tab ${index + 1} label`} value={tab.label} disabled={disabled} onChange={(label) => updateTab(index, { label })} />
          <TextareaField label="Content" value={tab.body} disabled={disabled} rows={5} onChange={(body) => updateTab(index, { body })} />
          <RemoveRepeaterButton
            label="Remove tab"
            disabled={disabled}
            onClick={() => onChange({ ...attrs, tabs: attrs.tabs.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Registry
// ============================================================================

export const CORE_BLOCKS = [
  // ── Content blocks (Wave A) ────────────────────────────────────────────────
  {
    name: "core/paragraph",
    title: "Paragraph",
    description: "A plain text paragraph. Supports inline markdown emphasis.",
    category: "text",
    keywords: ["paragraph", "p", "text", "body"],
    icon: Pilcrow,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: paragraphAttrsSchema.parse({ body: "" }),
    schema: paragraphAttrsSchema,
    Editor: ParagraphEditor,
    aiHints: {
      useFor: "regular prose paragraphs, transitional copy, blog post body text",
      avoid: "headings, lists, marketing-section copy (use heading/list/hero instead)",
    },
  },
  {
    name: "core/heading",
    title: "Heading",
    description: "A section heading (H1 through H6).",
    category: "text",
    keywords: ["heading", "h1", "h2", "h3", "title"],
    icon: HeadingIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: headingAttrsSchema.parse({}),
    schema: headingAttrsSchema,
    Editor: HeadingEditor,
    aiHints: {
      useFor: "section headings inside an article or page",
      avoid: "the page title (that lives outside the block list) or hero headings (use core/hero)",
    },
  },
  {
    name: "core/list",
    title: "List",
    description: "Bulleted, numbered, or task list.",
    category: "text",
    keywords: ["list", "bullet", "ul", "ol", "task", "todo"],
    icon: ListIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: listAttrsSchema.parse({ items: [{ text: "" }] }),
    schema: listAttrsSchema,
    Editor: ListEditor,
    aiHints: {
      useFor: "any list of items — features, steps, checklist, points",
      avoid: "feature grids with descriptions (use core/feature-grid)",
    },
  },
  {
    name: "core/image",
    title: "Image",
    description: "A standalone image with optional caption and link.",
    category: "media",
    keywords: ["image", "img", "photo", "picture"],
    icon: ImageIcon,
    version: 1,
    supports: { multiple: true, media: true },
    defaultAttrs: imageAttrsSchema.parse({}),
    schema: imageAttrsSchema,
    Editor: ImageEditor,
    aiHints: {
      useFor: "single images in blog content or page bodies",
      avoid: "hero media (use core/hero) or side-by-side media (use core/media-text)",
    },
  },
  {
    name: "core/quote",
    title: "Quote",
    description: "A pull quote or blockquote with optional attribution.",
    category: "text",
    keywords: ["quote", "blockquote", "pull quote"],
    icon: QuoteIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: quoteAttrsSchema.parse({}),
    schema: quoteAttrsSchema,
    Editor: QuoteEditor,
    aiHints: {
      useFor: "memorable lines, source citations, customer voice in content",
      avoid: "multiple testimonials together (use core/testimonials)",
    },
  },
  {
    name: "core/code",
    title: "Code",
    description: "A fenced code block with syntax highlighting.",
    category: "text",
    keywords: ["code", "pre", "snippet"],
    icon: CodeIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: codeAttrsSchema.parse({}),
    schema: codeAttrsSchema,
    Editor: CodeEditor,
    aiHints: {
      useFor: "code snippets, terminal output, config examples",
      avoid: "inline code within a paragraph",
    },
  },
  {
    name: "core/divider",
    title: "Divider",
    description: "A horizontal separator between sections.",
    category: "layout",
    keywords: ["divider", "separator", "hr", "rule"],
    icon: Minus,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: dividerAttrsSchema.parse({}),
    schema: dividerAttrsSchema,
    Editor: DividerEditor,
    aiHints: {
      useFor: "creating breathing room between major content shifts",
      avoid: "decorating every section — let the skill handle visual rhythm",
    },
  },
  {
    name: "core/spacer",
    title: "Spacer",
    description: "Semantic vertical spacing — the skill decides actual height.",
    category: "layout",
    keywords: ["spacer", "space", "gap"],
    icon: SeparatorHorizontal,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: spacerAttrsSchema.parse({}),
    schema: spacerAttrsSchema,
    Editor: SpacerEditor,
    aiHints: {
      useFor: "explicit extra vertical space between two adjacent blocks",
      avoid: "fine-tuning layout — that is the skill's job",
    },
  },
  {
    name: "core/embed",
    title: "Embed",
    description: "Embed a YouTube, Vimeo, Twitter/X, TikTok, Loom, Spotify, or other URL.",
    category: "media",
    keywords: ["embed", "video", "youtube", "vimeo", "tweet", "iframe"],
    icon: Video,
    version: 1,
    supports: { multiple: true, media: true },
    defaultAttrs: embedAttrsSchema.parse({}),
    schema: embedAttrsSchema,
    Editor: EmbedEditor,
    aiHints: {
      useFor: "video and rich-media embeds from external providers",
      avoid: "image embeds (use core/image)",
    },
  },

  // ── Marketing blocks (originals, kept) ─────────────────────────────────────
  {
    name: "core/hero",
    title: "Hero",
    description: "Page-opening section with copy, calls to action, and optional media.",
    category: "marketing",
    keywords: ["intro", "banner", "landing"],
    icon: Sparkles,
    version: 1,
    supports: { media: true, multiple: false },
    defaultAttrs: heroAttrsSchema.parse({
      eyebrow: "New page",
      title: "A focused page opening",
      body: "Introduce the page with a clear promise and a useful next step.",
      primaryCtaLabel: "Get started",
      primaryCtaUrl: "/contact",
      secondaryCtaLabel: "Learn more",
      secondaryCtaUrl: "/blog",
      mediaId: "",
    }),
    schema: heroAttrsSchema,
    Editor: HeroEditor,
    aiHints: {
      useFor: "the first block on landing pages, product pages, marketing pages",
      avoid: "blog posts (use core/heading + core/paragraph)",
    },
  },
  {
    name: "core/rich-text",
    title: "Rich Text Section",
    description: "A copy-only section with eyebrow, heading, and body.",
    category: "text",
    keywords: ["copy", "content", "section"],
    icon: Rows3,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: richTextAttrsSchema.parse({
      eyebrow: "",
      heading: "Section heading",
      body: "Write clear page copy here.",
    }),
    schema: richTextAttrsSchema,
    Editor: RichTextEditor,
    aiHints: {
      useFor: "long-form copy sections with an eyebrow/heading/body structure",
      avoid: "single paragraphs (use core/paragraph) or major page openings (use core/hero)",
    },
  },
  {
    name: "core/feature-grid",
    title: "Feature Grid",
    description: "A grid of feature cards with a section intro.",
    category: "marketing",
    keywords: ["features", "cards", "grid"],
    icon: Rows3,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: featureGridAttrsSchema.parse({
      eyebrow: "Highlights",
      heading: "What makes this useful",
      body: "Add a few focused points that make the value easy to scan.",
      items: [
        { title: "Fast to edit", description: "Each card has clear fields." },
        { title: "Easy to reuse", description: "The block can appear on any page." },
        { title: "AI-friendly", description: "The schema gives AI safe structure." },
      ],
    }),
    schema: featureGridAttrsSchema,
    Editor: FeatureGridEditor,
    aiHints: {
      useFor: "3–6 features or benefits with short descriptions on a marketing page",
      avoid: "more than 8 items (consider splitting into multiple blocks)",
    },
  },
  {
    name: "core/cta-band",
    title: "CTA Band",
    description: "A focused call-to-action section.",
    category: "marketing",
    keywords: ["cta", "conversion", "button"],
    icon: MousePointerClick,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: ctaBandAttrsSchema.parse({
      eyebrow: "Next step",
      heading: "Ready to move forward?",
      body: "Point visitors toward the most useful action.",
      primaryCtaLabel: "Contact us",
      primaryCtaUrl: "/contact",
      secondaryCtaLabel: "",
      secondaryCtaUrl: "",
    }),
    schema: ctaBandAttrsSchema,
    Editor: CtaBandEditor,
    aiHints: {
      useFor: "the closing section of a landing page, or mid-page conversion nudges",
      avoid: "blog post endings (use core/paragraph with a link)",
    },
  },
  {
    name: "core/media-text",
    title: "Media + Text",
    description: "A split section with copy, supporting media, and one action.",
    category: "media",
    keywords: ["image", "split", "story"],
    icon: Images,
    version: 1,
    supports: { media: true, multiple: true },
    defaultAttrs: mediaTextAttrsSchema.parse({
      eyebrow: "Story",
      heading: "A useful detail with supporting media",
      body: "Pair focused copy with an image, product screenshot, or visual proof point.",
      mediaId: "",
      mediaAlt: "",
      mediaPosition: "right",
      ctaLabel: "",
      ctaUrl: "",
    }),
    schema: mediaTextAttrsSchema,
    Editor: MediaTextEditor,
    aiHints: {
      useFor: "alternating image-text storytelling sections (the typical SaaS \"see how it works\" pattern)",
      avoid: "single paragraphs (use core/paragraph)",
    },
  },
  {
    name: "core/testimonials",
    title: "Testimonials",
    description: "A set of customer quotes with attribution.",
    category: "marketing",
    keywords: ["reviews", "quotes", "proof"],
    icon: QuoteIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: testimonialAttrsSchema.parse({
      eyebrow: "Social proof",
      heading: "What customers are saying",
      body: "",
      items: [
        { quote: "This made the decision simple.", name: "Customer Name", role: "Role or company" },
        { quote: "The experience was clear from the first step.", name: "Customer Name", role: "Role or company" },
      ],
    }),
    schema: testimonialAttrsSchema,
    Editor: TestimonialsEditor,
    aiHints: {
      useFor: "social proof sections, customer voice, before-conversion reassurance",
      avoid: "a single quote (use core/quote)",
    },
  },
  {
    name: "core/pricing-cards",
    title: "Pricing Cards",
    description: "A comparison-ready pricing section with plans and features.",
    category: "commerce",
    keywords: ["pricing", "plans", "packages"],
    icon: BadgeDollarSign,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: pricingCardsAttrsSchema.parse({
      eyebrow: "Pricing",
      heading: "Choose the right plan",
      body: "Give visitors a clear way to compare options.",
      plans: [
        {
          name: "Starter",
          price: "$99",
          description: "For focused launches.",
          features: ["Core setup", "Essential support", "Fast delivery"],
          ctaLabel: "Start",
          ctaUrl: "/contact",
          featured: false,
        },
        {
          name: "Growth",
          price: "$299",
          description: "For teams that need more capacity.",
          features: ["Everything in Starter", "Advanced sections", "Priority support"],
          ctaLabel: "Choose Growth",
          ctaUrl: "/contact",
          featured: true,
        },
      ],
    }),
    schema: pricingCardsAttrsSchema,
    Editor: PricingCardsEditor,
    aiHints: {
      useFor: "pricing pages, plan comparison sections",
      avoid: "feature lists without prices (use core/feature-grid)",
    },
  },
  {
    name: "core/faq",
    title: "FAQ",
    description: "A list of common questions and answers.",
    category: "text",
    keywords: ["questions", "answers", "support"],
    icon: HelpCircle,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: faqAttrsSchema.parse({
      eyebrow: "FAQ",
      heading: "Common questions",
      body: "",
      items: [
        { question: "What should visitors know first?", answer: "Use this space to answer the most important buying or support question." },
        { question: "How does this work?", answer: "Explain the next step in plain language." },
      ],
    }),
    schema: faqAttrsSchema,
    Editor: FaqEditor,
    aiHints: {
      useFor: "FAQ sections, objection handling, support content",
      avoid: "single questions (use core/heading + core/paragraph)",
    },
  },

  // ── Wave B — additional marketing blocks ──────────────────────────────────
  {
    name: "core/hero-text-only",
    title: "Hero (text only)",
    description: "Hero section without media — for centered or left-aligned copy openers.",
    category: "marketing",
    keywords: ["hero", "intro", "banner"],
    icon: AlignLeft,
    version: 1,
    supports: { multiple: false },
    defaultAttrs: heroTextOnlyAttrsSchema.parse({ title: "A focused opener", body: "A short subtitle that explains the value." }),
    schema: heroTextOnlyAttrsSchema,
    Editor: HeroTextOnlyEditor,
    aiHints: {
      useFor: "minimalist hero sections without imagery",
      avoid: "media-heavy pages (use core/hero or core/hero-split)",
    },
  },
  {
    name: "core/hero-split",
    title: "Hero (split)",
    description: "Hero with copy on one side and media on the other.",
    category: "marketing",
    keywords: ["hero", "split", "image"],
    icon: Columns2,
    version: 1,
    supports: { multiple: false, media: true },
    defaultAttrs: heroSplitAttrsSchema.parse({ title: "Two-column hero", body: "Copy on one side, media on the other." }),
    schema: heroSplitAttrsSchema,
    Editor: HeroSplitEditor,
    aiHints: { useFor: "SaaS-style hero with product screenshot or illustration" },
  },
  {
    name: "core/feature-list-alternating",
    title: "Feature list (alternating)",
    description: "Sequence of feature blocks with media alternating left/right.",
    category: "marketing",
    keywords: ["features", "alternating", "story"],
    icon: Layers,
    version: 1,
    supports: { multiple: true, media: true },
    defaultAttrs: featureListAlternatingAttrsSchema.parse({}),
    schema: featureListAlternatingAttrsSchema,
    Editor: FeatureListAlternatingEditor,
    aiHints: { useFor: "deeper feature storytelling — 3–6 items, each with a screenshot" },
  },
  {
    name: "core/logo-cloud",
    title: "Logo cloud",
    description: "Row of customer or partner logos.",
    category: "marketing",
    keywords: ["logos", "brands", "as-seen-on"],
    icon: Bookmark,
    version: 1,
    supports: { multiple: true, media: true },
    defaultAttrs: logoCloudAttrsSchema.parse({ heading: "Trusted by teams at" }),
    schema: logoCloudAttrsSchema,
    Editor: LogoCloudEditor,
    aiHints: { useFor: "social proof via customer logos" },
  },
  {
    name: "core/stats-band",
    title: "Stats band",
    description: "Big-number stats with labels.",
    category: "marketing",
    keywords: ["stats", "numbers", "metrics"],
    icon: GraduationCap,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: statsBandAttrsSchema.parse({ stats: [{ value: "10k+", label: "Active users" }] }),
    schema: statsBandAttrsSchema,
    Editor: StatsBandEditor,
    aiHints: { useFor: "highlight headline metrics that build credibility" },
  },
  {
    name: "core/team-grid",
    title: "Team grid",
    description: "Team members with photo, role, and bio.",
    category: "marketing",
    keywords: ["team", "people", "about"],
    icon: Users2,
    version: 1,
    supports: { multiple: false, media: true },
    defaultAttrs: teamGridAttrsSchema.parse({}),
    schema: teamGridAttrsSchema,
    Editor: TeamGridEditor,
    aiHints: { useFor: "about pages showing the team" },
  },
  {
    name: "core/comparison-table",
    title: "Comparison table",
    description: "Feature comparison versus competitors.",
    category: "marketing",
    keywords: ["comparison", "vs", "competitors"],
    icon: LayoutGrid,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: comparisonTableAttrsSchema.parse({}),
    schema: comparisonTableAttrsSchema,
    Editor: ComparisonTableEditor,
    aiHints: { useFor: "explicit feature-by-feature comparison against alternatives" },
  },
  {
    name: "core/process-steps",
    title: "Process steps",
    description: "Numbered step-by-step process or onboarding flow.",
    category: "marketing",
    keywords: ["steps", "how it works", "process", "onboarding"],
    icon: ListOrderedIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: processStepsAttrsSchema.parse({ steps: [{ title: "Step 1", body: "First, do this." }] }),
    schema: processStepsAttrsSchema,
    Editor: ProcessStepsEditor,
    aiHints: { useFor: "how-it-works sections, onboarding sequences" },
  },
  {
    name: "core/roadmap-timeline",
    title: "Roadmap timeline",
    description: "Timeline of past, current, and upcoming items.",
    category: "marketing",
    keywords: ["roadmap", "timeline", "launches"],
    icon: MapIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: roadmapTimelineAttrsSchema.parse({}),
    schema: roadmapTimelineAttrsSchema,
    Editor: RoadmapTimelineEditor,
    aiHints: { useFor: "public roadmap pages, changelog sections" },
  },
  {
    name: "core/bento-grid",
    title: "Bento grid",
    description: "Modern asymmetric feature layout — large + small cells.",
    category: "marketing",
    keywords: ["bento", "grid", "features", "modern"],
    icon: Grid3x3,
    version: 1,
    supports: { multiple: true, media: true },
    defaultAttrs: bentoGridAttrsSchema.parse({}),
    schema: bentoGridAttrsSchema,
    Editor: BentoGridEditor,
    aiHints: { useFor: "visually-rich feature showcases (Apple-style)" },
  },

  // ── Wave C — forms / conversions ──────────────────────────────────────────
  {
    name: "core/contact-form",
    title: "Contact form",
    description: "Configurable contact form with custom fields.",
    category: "forms",
    keywords: ["contact", "form", "lead"],
    icon: FormInput,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: contactFormAttrsSchema.parse({
      heading: "Get in touch",
      fields: [
        { name: "name", label: "Name", type: "text", required: true, placeholder: "", options: [] },
        { name: "email", label: "Email", type: "email", required: true, placeholder: "", options: [] },
        { name: "message", label: "Message", type: "textarea", required: true, placeholder: "", options: [] },
      ],
    }),
    schema: contactFormAttrsSchema,
    Editor: ContactFormEditor,
    aiHints: { useFor: "contact pages, lead-capture forms" },
  },
  {
    name: "core/newsletter-signup",
    title: "Newsletter signup",
    description: "Email signup — inline strip or large card.",
    category: "forms",
    keywords: ["newsletter", "email", "subscribe"],
    icon: Mail,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: newsletterSignupAttrsSchema.parse({ heading: "Stay in the loop", body: "One email, every Tuesday." }),
    schema: newsletterSignupAttrsSchema,
    Editor: NewsletterSignupEditor,
    aiHints: { useFor: "growing the email list — anywhere on the page" },
  },
  {
    name: "core/cta-with-form",
    title: "CTA with inline form",
    description: "Conversion CTA with an email-capture form inline.",
    category: "forms",
    keywords: ["cta", "form", "conversion"],
    icon: MousePointerClick,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: ctaWithFormAttrsSchema.parse({ heading: "Try it free" }),
    schema: ctaWithFormAttrsSchema,
    Editor: CtaWithFormEditor,
    aiHints: { useFor: "marketing-page conversions that combine pitch + signup" },
  },
  {
    name: "core/booking-cta",
    title: "Booking CTA",
    description: "Book-a-time CTA, optionally with an embedded scheduler.",
    category: "forms",
    keywords: ["booking", "calendar", "schedule", "demo"],
    icon: CalendarClock,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: bookingCtaAttrsSchema.parse({ heading: "Book a demo" }),
    schema: bookingCtaAttrsSchema,
    Editor: BookingCtaEditor,
    aiHints: { useFor: "demo or consultation booking pages" },
  },

  // ── Wave D — content discovery ────────────────────────────────────────────
  {
    name: "core/latest-posts",
    title: "Latest posts",
    description: "Auto-list of recent blog posts.",
    category: "site",
    keywords: ["posts", "blog", "latest"],
    icon: Newspaper,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: latestPostsAttrsSchema.parse({}),
    schema: latestPostsAttrsSchema,
    Editor: LatestPostsEditor,
    aiHints: { useFor: "blog index sections on a marketing page" },
  },
  {
    name: "core/featured-products",
    title: "Featured products",
    description: "Hand-picked or latest product grid.",
    category: "commerce",
    keywords: ["products", "featured", "shop"],
    icon: ShoppingBag,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: featuredProductsAttrsSchema.parse({}),
    schema: featuredProductsAttrsSchema,
    Editor: FeaturedProductsEditor,
    aiHints: { useFor: "homepage product showcases, featured collections" },
  },
  {
    name: "core/author-bio",
    title: "Author bio",
    description: "Author card with photo, role, bio, and links.",
    category: "site",
    keywords: ["author", "bio", "byline"],
    icon: MessageCircle,
    version: 1,
    supports: { multiple: true, media: true },
    defaultAttrs: authorBioAttrsSchema.parse({}),
    schema: authorBioAttrsSchema,
    Editor: AuthorBioEditor,
    aiHints: { useFor: "blog post footers, about-the-author sections" },
  },
  {
    name: "core/social-links",
    title: "Social links",
    description: "Icon row of social profile links.",
    category: "site",
    keywords: ["social", "twitter", "linkedin", "icons"],
    icon: Globe,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: socialLinksAttrsSchema.parse({}),
    schema: socialLinksAttrsSchema,
    Editor: SocialLinksEditor,
    aiHints: { useFor: "footers, about pages, contact sections" },
  },
  {
    name: "core/tag-cloud",
    title: "Tag cloud",
    description: "Auto-generated tag list for blog discovery.",
    category: "site",
    keywords: ["tags", "topics", "discover"],
    icon: TagIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: tagCloudAttrsSchema.parse({}),
    schema: tagCloudAttrsSchema,
    Editor: TagCloudEditor,
    aiHints: { useFor: "sidebar tag clouds, blog discovery sections" },
  },

  // ── Wave E — layout containers ────────────────────────────────────────────
  {
    name: "core/accordion",
    title: "Accordion",
    description: "Collapsible Q&A or progressive-disclosure list.",
    category: "layout",
    keywords: ["accordion", "expand", "collapse", "details"],
    icon: ListIcon,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: accordionAttrsSchema.parse({ items: [{ title: "First section", body: "..." }] }),
    schema: accordionAttrsSchema,
    Editor: AccordionEditor,
    aiHints: { useFor: "progressive disclosure of long content (docs-style)" },
  },
  {
    name: "core/tabs",
    title: "Tabs",
    description: "Tabbed content panels.",
    category: "layout",
    keywords: ["tabs", "switcher", "tabbed"],
    icon: Columns2,
    version: 1,
    supports: { multiple: true },
    defaultAttrs: tabsAttrsSchema.parse({ tabs: [{ label: "Overview", body: "..." }, { label: "Details", body: "..." }] }),
    schema: tabsAttrsSchema,
    Editor: TabsEditor,
    aiHints: { useFor: "comparing variants of similar info, segmenting docs" },
  },
] satisfies AdminBlockDefinition<Record<string, unknown>>[];

type DiscoveredBlockModule = {
  default?: AdminBlockDefinition<Record<string, unknown>>;
  definition?: AdminBlockDefinition<Record<string, unknown>>;
};

const OFFICIAL_BLOCK_MODULES = import.meta.glob<DiscoveredBlockModule>(
  "../../blocks/*/manifest.tsx",
  { eager: true },
);
const LOCAL_BLOCK_MODULES = import.meta.glob<DiscoveredBlockModule>(
  "../../blocks.local/*/manifest.tsx",
  { eager: true },
);

function collectDiscoveredBlocks() {
  const seen = new Set(CORE_BLOCKS.map((definition) => String(definition.name)));
  const discovered: Array<AdminBlockDefinition<Record<string, unknown>>> = [];

  for (const module of [
    ...Object.values(OFFICIAL_BLOCK_MODULES),
    ...Object.values(LOCAL_BLOCK_MODULES),
  ]) {
    const definition = module.default ?? module.definition;
    if (!definition || seen.has(String(definition.name))) continue;
    seen.add(String(definition.name));
    discovered.push(definition);
  }

  return discovered;
}

export const REGISTERED_BLOCKS: Array<AdminBlockDefinition<Record<string, unknown>>> = [
  ...CORE_BLOCKS,
  ...collectDiscoveredBlocks(),
];

export const BLOCK_REGISTRY = new Map<BlockName, AdminBlockDefinition<Record<string, unknown>>>(
  REGISTERED_BLOCKS.map((definition) => [definition.name, definition]),
);

export function getAllBlockDefinitions() {
  return REGISTERED_BLOCKS;
}

export function getBlockSource(name: BlockName): "core" | "official" | "local" | "extension" {
  if (String(name).startsWith("core/")) return "core";
  if (String(name).startsWith("local/")) return "local";
  if (String(name).startsWith("extension/")) return "extension";
  return "official";
}

export function isBlockEnabled(
  name: BlockName,
  disabledBlockNames: readonly string[] | undefined,
) {
  return !new Set(disabledBlockNames ?? []).has(String(name));
}

export function getEnabledBlockDefinitions(
  disabledBlockNames: readonly string[] | undefined,
) {
  const disabled = new Set(disabledBlockNames ?? []);
  return REGISTERED_BLOCKS.filter((definition) => !disabled.has(String(definition.name)));
}

export function getBlockDefinition(name: BlockName) {
  return BLOCK_REGISTRY.get(name);
}

/**
 * Categories displayed in the inserter, in display order.
 * Adding a new category? Add it here and ensure at least one block uses it.
 */
export const BLOCK_CATEGORY_ORDER: Array<{
  key: AdminBlockDefinition<any>["category"];
  label: string;
}> = [
  { key: "text", label: "Content" },
  { key: "media", label: "Media" },
  { key: "marketing", label: "Marketing" },
  { key: "layout", label: "Layout" },
  { key: "commerce", label: "Commerce" },
  { key: "forms", label: "Forms" },
  { key: "site", label: "Site" },
  { key: "custom", label: "Custom" },
];

export function createBlock(name: BlockName): ConvexPressBlock {
  const definition = getBlockDefinition(name);
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);

  if (!definition) {
    return {
      id: `blk_${timestamp}_${random}`,
      name,
      version: 1,
      attrs: {},
    };
  }

  return {
    id: `blk_${timestamp}_${random}`,
    name: definition.name,
    version: definition.version,
    attrs: definition.defaultAttrs,
  };
}
