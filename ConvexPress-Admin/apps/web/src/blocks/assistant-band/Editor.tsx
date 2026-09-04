import type { BlockEditorProps } from "@/lib/blocks/types";
import { TextareaField, TextField } from "../_shared/editorFields";
import type { AssistantBandAttrs } from "./schema";

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AssistantBandEditor({ attrs, onChange, disabled }: BlockEditorProps<AssistantBandAttrs>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Eyebrow" value={attrs.eyebrow} disabled={disabled} onChange={(eyebrow) => onChange({ ...attrs, eyebrow })} />
        <TextField label="Heading" value={attrs.heading} disabled={disabled} onChange={(heading) => onChange({ ...attrs, heading })} />
      </div>
      <TextareaField label="Body" value={attrs.body} rows={3} disabled={disabled} onChange={(body) => onChange({ ...attrs, body })} />
      <TextareaField
        label="Example questions (one per line; empty uses the assistant's starter prompts)"
        value={attrs.prompts.join("\n")}
        rows={4}
        disabled={disabled}
        onChange={(value) => onChange({ ...attrs, prompts: splitLines(value) })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="CTA label" value={attrs.ctaLabel} disabled={disabled} onChange={(ctaLabel) => onChange({ ...attrs, ctaLabel })} />
        <TextField label="CTA URL" value={attrs.ctaUrl} disabled={disabled} onChange={(ctaUrl) => onChange({ ...attrs, ctaUrl })} />
      </div>
      <p className="text-xs text-muted-foreground">
        The assistant's name, tone and availability come from Settings › Shop assistant.
      </p>
    </div>
  );
}
