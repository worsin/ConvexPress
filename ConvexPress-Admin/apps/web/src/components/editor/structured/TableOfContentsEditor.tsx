/**
 * TableOfContentsEditor - Table of contents textarea
 *
 * Simple textarea for a manually curated or auto-generated table of contents.
 */

import { SectionField } from "./SectionField";

interface TableOfContentsEditorProps {
  value: string;
  onChange: (toc: string) => void;
}

export function TableOfContentsEditor({ value, onChange }: TableOfContentsEditorProps) {
  return (
    <SectionField label="Table of Contents">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="1. Introduction&#10;2. Topic One&#10;3. Topic Two&#10;..."
        rows={6}
        className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
      />
    </SectionField>
  );
}
