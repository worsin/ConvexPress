/**
 * SourcesEditor - Sources textarea
 *
 * Simple textarea for listing sources/references (one per line or free-form).
 */

import { SectionField } from "./SectionField";

interface SourcesEditorProps {
  value: string;
  onChange: (sources: string) => void;
}

export function SourcesEditor({ value, onChange }: SourcesEditorProps) {
  return (
    <SectionField label="Sources & References">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="List your sources, one per line..."
        rows={4}
        className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y font-mono"
      />
      <p className="text-[10px] text-muted-foreground mt-1">
        One source per line. Include URLs where applicable.
      </p>
    </SectionField>
  );
}
