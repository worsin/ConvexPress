import type { BlockEditorProps } from "@/lib/blocks/types";
import type { SampleAlertAttrs } from "./schema";

function TextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function SampleAlertEditor({
  attrs,
  onChange,
  disabled,
}: BlockEditorProps<SampleAlertAttrs>) {
  return (
    <div className="grid gap-3">
      <TextField
        label="Heading"
        value={attrs.heading}
        disabled={disabled}
        onChange={(heading) => onChange({ ...attrs, heading })}
      />
      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Body</span>
        <textarea
          value={attrs.body}
          disabled={disabled}
          rows={4}
          onChange={(event) => onChange({ ...attrs, body: event.target.value })}
          className="border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-hidden focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Variant</span>
          <select
            value={attrs.variant}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...attrs,
                variant: event.target.value as SampleAlertAttrs["variant"],
              })
            }
            className="h-9 border border-border bg-background px-2.5 text-sm text-foreground outline-hidden focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
          </select>
        </label>
        <TextField
          label="CTA label"
          value={attrs.ctaLabel}
          disabled={disabled}
          onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })}
        />
        <TextField
          label="CTA URL"
          value={attrs.ctaUrl}
          disabled={disabled}
          onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })}
        />
      </div>
    </div>
  );
}
