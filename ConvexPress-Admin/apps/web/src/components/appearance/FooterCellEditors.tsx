/**
 * Per-type editors for footer cells. One small component per cell type so
 * the cell dispatcher can render the right form without a giant switch
 * scattered through FooterRowsBuilder.
 *
 * Every editor takes `cell` + `onChange(newCell)`; the parent owns layout
 * (collapse/expand chrome, remove button, drag handle). The editor renders
 * ONLY the fields, no surrounding card.
 */

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MediaField } from "@/components/media/MediaField";
import type {
  FooterBrandCell,
  FooterCell,
  FooterContactCell,
  FooterCopyrightCell,
  FooterDividerCell,
  FooterHtmlCell,
  FooterImageCell,
  FooterLinksCell,
  FooterNavCell,
  FooterNewsletterCell,
  FooterPaymentsCell,
  FooterSocialCell,
  FooterTextCell,
} from "./types";

interface CellEditorProps<T extends FooterCell> {
  cell: T;
  onChange: (next: T) => void;
}

// ─── Small primitives ────────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Textarea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="rounded-none border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-hidden focus:border-primary"
    />
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 rounded-none border border-border bg-background px-2.5 text-sm text-foreground outline-hidden focus:border-primary"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

interface MenuLocationOption {
  slug: string;
  name: string;
  description?: string;
}

function MenuLocationSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const locations = useQuery(api.menus.queries.getMenuLocations) as
    | MenuLocationOption[]
    | undefined;

  if (!locations || locations.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="footer, footer-1, social"
      />
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-none border border-border bg-background px-2.5 text-sm text-foreground outline-hidden focus:border-primary"
    >
      {locations.map((location) => (
        <option key={location.slug} value={location.slug}>
          {location.name}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer border border-border bg-background accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function HeadingField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <FieldRow label="Heading">
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Optional column heading"
      />
    </FieldRow>
  );
}

// ─── Text ────────────────────────────────────────────────────────────────────

export function TextCellEditor({ cell, onChange }: CellEditorProps<FooterTextCell>) {
  return (
    <div className="flex flex-col gap-3">
      <HeadingField value={cell.heading} onChange={(v) => onChange({ ...cell, heading: v })} />
      <FieldRow label="Body" hint="Plain text. Line breaks render as paragraphs.">
        <Textarea
          value={cell.body}
          onChange={(v) => onChange({ ...cell, body: v })}
          rows={4}
        />
      </FieldRow>
    </div>
  );
}

// ─── Links ───────────────────────────────────────────────────────────────────

export function LinksCellEditor({ cell, onChange }: CellEditorProps<FooterLinksCell>) {
  const updateItem = useCallback(
    (idx: number, patch: Partial<FooterLinksCell["items"][number]>) => {
      const items = [...cell.items];
      items[idx] = { ...items[idx], ...patch };
      onChange({ ...cell, items });
    },
    [cell, onChange],
  );
  const removeItem = useCallback(
    (idx: number) => {
      const items = cell.items.filter((_, i) => i !== idx);
      onChange({ ...cell, items });
    },
    [cell, onChange],
  );
  const addItem = useCallback(() => {
    onChange({
      ...cell,
      items: [...cell.items, { label: "", url: "", target: "_self" }],
    });
  }, [cell, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <HeadingField value={cell.heading} onChange={(v) => onChange({ ...cell, heading: v })} />
      <div className="flex flex-col gap-2">
        {cell.items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <Input
              value={item.label}
              onChange={(e) => updateItem(idx, { label: e.target.value })}
              placeholder="Label"
              className="flex-1"
            />
            <Input
              value={item.url}
              onChange={(e) => updateItem(idx, { url: e.target.value })}
              placeholder="/path or https://…"
              className="flex-1"
            />
            <Select
              value={item.target ?? "_self"}
              onChange={(v) => updateItem(idx, { target: v })}
              options={[
                { value: "_self", label: "Same tab" },
                { value: "_blank", label: "New tab" },
              ]}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove link"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {cell.items.length === 0 && (
          <p className="text-xs italic text-muted-foreground">No links yet.</p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={addItem}
        className="self-start"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add link
      </Button>
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

export function NavCellEditor({ cell, onChange }: CellEditorProps<FooterNavCell>) {
  return (
    <div className="flex flex-col gap-3">
      <HeadingField value={cell.heading} onChange={(v) => onChange({ ...cell, heading: v })} />
      <FieldRow label="Menu location" hint="Pick which menu to render. Manage assignments under Appearance → Menu Locations.">
        <MenuLocationSelect
          value={cell.menuLocation}
          onChange={(menuLocation) => onChange({ ...cell, menuLocation })}
        />
      </FieldRow>
    </div>
  );
}

// ─── Image ───────────────────────────────────────────────────────────────────

export function ImageCellEditor({ cell, onChange }: CellEditorProps<FooterImageCell>) {
  return (
    <div className="flex flex-col gap-3">
      <MediaField
        label="Image"
        value={cell.mediaId ?? ""}
        onChange={(mediaId) => onChange({ ...cell, mediaId: mediaId || null })}
        promptSeed={cell.alt}
      />
      <FieldRow label="Alt text">
        <Input value={cell.alt} onChange={(e) => onChange({ ...cell, alt: e.target.value })} />
      </FieldRow>
      <FieldRow label="Link URL (optional)">
        <Input
          value={cell.href ?? ""}
          onChange={(e) => onChange({ ...cell, href: e.target.value })}
          placeholder="/path or https://…"
        />
      </FieldRow>
      <FieldRow label="Width (px)">
        <Input
          type="number"
          value={cell.width ?? 200}
          onChange={(e) => onChange({ ...cell, width: Number(e.target.value) || undefined })}
        />
      </FieldRow>
    </div>
  );
}

// ─── Social ──────────────────────────────────────────────────────────────────

export function SocialCellEditor({ cell, onChange }: CellEditorProps<FooterSocialCell>) {
  return (
    <div className="flex flex-col gap-3">
      <HeadingField value={cell.heading} onChange={(v) => onChange({ ...cell, heading: v })} />
      <FieldRow label="Style" hint="Links come from Settings → General → Social profiles.">
        <Select
          value={cell.style}
          onChange={(v) => onChange({ ...cell, style: v })}
          options={[
            { value: "icons", label: "Icons only" },
            { value: "icons-and-labels", label: "Icons + labels" },
            { value: "labels", label: "Labels only" },
          ]}
        />
      </FieldRow>
    </div>
  );
}

// ─── Newsletter ──────────────────────────────────────────────────────────────

export function NewsletterCellEditor({ cell, onChange }: CellEditorProps<FooterNewsletterCell>) {
  return (
    <div className="flex flex-col gap-3">
      <HeadingField value={cell.heading} onChange={(v) => onChange({ ...cell, heading: v })} />
      <FieldRow label="Subtext">
        <Textarea
          value={cell.subtext}
          onChange={(v) => onChange({ ...cell, subtext: v })}
          rows={2}
        />
      </FieldRow>
      <FieldRow label="Button text">
        <Input
          value={cell.buttonText}
          onChange={(e) => onChange({ ...cell, buttonText: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Audience ID (optional)" hint="Connect to an email provider list.">
        <Input
          value={cell.audienceId ?? ""}
          onChange={(e) => onChange({ ...cell, audienceId: e.target.value })}
        />
      </FieldRow>
    </div>
  );
}

// ─── Contact ─────────────────────────────────────────────────────────────────

export function ContactCellEditor({ cell, onChange }: CellEditorProps<FooterContactCell>) {
  return (
    <div className="flex flex-col gap-3">
      <HeadingField value={cell.heading} onChange={(v) => onChange({ ...cell, heading: v })} />
      <FieldRow label="Address">
        <Textarea
          value={cell.address}
          onChange={(v) => onChange({ ...cell, address: v })}
          rows={2}
        />
      </FieldRow>
      <FieldRow label="Phone">
        <Input
          value={cell.phone}
          onChange={(e) => onChange({ ...cell, phone: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Email">
        <Input
          value={cell.email}
          onChange={(e) => onChange({ ...cell, email: e.target.value })}
        />
      </FieldRow>
      <Checkbox
        checked={cell.showIcons}
        onChange={(v) => onChange({ ...cell, showIcons: v })}
        label="Show icons next to each field"
      />
    </div>
  );
}

// ─── Brand ───────────────────────────────────────────────────────────────────

export function BrandCellEditor({ cell, onChange }: CellEditorProps<FooterBrandCell>) {
  return (
    <div className="flex flex-col gap-3">
      <Checkbox
        checked={cell.showLogo}
        onChange={(v) => onChange({ ...cell, showLogo: v })}
        label="Show site logo"
      />
      <Checkbox
        checked={cell.showTagline}
        onChange={(v) => onChange({ ...cell, showTagline: v })}
        label="Show tagline"
      />
      <Checkbox
        checked={cell.showDescription}
        onChange={(v) => onChange({ ...cell, showDescription: v })}
        label="Show description"
      />
      {cell.showDescription && (
        <FieldRow label="Description">
          <Textarea
            value={cell.description}
            onChange={(v) => onChange({ ...cell, description: v })}
            rows={2}
          />
        </FieldRow>
      )}
    </div>
  );
}

// ─── HTML ────────────────────────────────────────────────────────────────────

export function HtmlCellEditor({ cell, onChange }: CellEditorProps<FooterHtmlCell>) {
  return (
    <div className="flex flex-col gap-3">
      <FieldRow
        label="Raw HTML"
        hint="Sanitized at render time on the public site. Use sparingly."
      >
        <Textarea
          value={cell.rawHtml}
          onChange={(v) => onChange({ ...cell, rawHtml: v })}
          rows={6}
          placeholder="<div>…</div>"
        />
      </FieldRow>
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function DividerCellEditor({ cell, onChange }: CellEditorProps<FooterDividerCell>) {
  return (
    <FieldRow label="Thickness">
      <Select
        value={cell.thickness}
        onChange={(v) => onChange({ ...cell, thickness: v })}
        options={[
          { value: "thin", label: "Thin" },
          { value: "medium", label: "Medium" },
          { value: "thick", label: "Thick" },
        ]}
      />
    </FieldRow>
  );
}

// ─── Copyright ───────────────────────────────────────────────────────────────

export function CopyrightCellEditor({ cell, onChange }: CellEditorProps<FooterCopyrightCell>) {
  return (
    <div className="flex flex-col gap-3">
      <FieldRow label="Text" hint="Use {year} to auto-insert the current year.">
        <Input
          value={cell.text}
          onChange={(e) => onChange({ ...cell, text: e.target.value })}
        />
      </FieldRow>
      <Checkbox
        checked={cell.insertYear}
        onChange={(v) => onChange({ ...cell, insertYear: v })}
        label="Replace {year} with current year on render"
      />
    </div>
  );
}

// ─── Payments ────────────────────────────────────────────────────────────────

export function PaymentsCellEditor({ cell, onChange }: CellEditorProps<FooterPaymentsCell>) {
  const knownMethods = [
    "visa",
    "mastercard",
    "amex",
    "discover",
    "paypal",
    "apple-pay",
    "google-pay",
    "stripe",
    "shop-pay",
  ];
  const toggle = (m: string) => {
    const methods = cell.methods.includes(m)
      ? cell.methods.filter((x) => x !== m)
      : [...cell.methods, m];
    onChange({ ...cell, methods });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Methods to display:</p>
      <div className="grid grid-cols-2 gap-1.5">
        {knownMethods.map((m) => (
          <Checkbox
            key={m}
            checked={cell.methods.includes(m)}
            onChange={() => toggle(m)}
            label={m}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export function FooterCellEditor({
  cell,
  onChange,
}: {
  cell: FooterCell;
  onChange: (next: FooterCell) => void;
}) {
  switch (cell.type) {
    case "text":
      return <TextCellEditor cell={cell} onChange={onChange} />;
    case "links":
      return <LinksCellEditor cell={cell} onChange={onChange} />;
    case "nav":
      return <NavCellEditor cell={cell} onChange={onChange} />;
    case "image":
      return <ImageCellEditor cell={cell} onChange={onChange} />;
    case "social":
      return <SocialCellEditor cell={cell} onChange={onChange} />;
    case "newsletter":
      return <NewsletterCellEditor cell={cell} onChange={onChange} />;
    case "contact":
      return <ContactCellEditor cell={cell} onChange={onChange} />;
    case "brand":
      return <BrandCellEditor cell={cell} onChange={onChange} />;
    case "html":
      return <HtmlCellEditor cell={cell} onChange={onChange} />;
    case "divider":
      return <DividerCellEditor cell={cell} onChange={onChange} />;
    case "copyright":
      return <CopyrightCellEditor cell={cell} onChange={onChange} />;
    case "payments":
      return <PaymentsCellEditor cell={cell} onChange={onChange} />;
  }
}
