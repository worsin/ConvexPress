/**
 * SummarySectionEditor - Summary form fields
 *
 * Renders title and content fields for the summary section.
 */

import { useCallback } from "react";
import { SectionField } from "./SectionField";
import type { SummaryFields } from "@/types/editor";

interface SummarySectionEditorProps {
  value: SummaryFields;
  onChange: (summary: SummaryFields) => void;
}

export function SummarySectionEditor({ value, onChange }: SummarySectionEditorProps) {
  const update = useCallback(
    (field: keyof SummaryFields, val: string) => {
      onChange({ ...value, [field]: val });
    },
    [value, onChange],
  );

  return (
    <div className="space-y-3">
      <SectionField label="Summary Title">
        <input
          type="text"
          value={value.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Key Takeaways"
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Summary Content">
        <textarea
          value={value.content}
          onChange={(e) => update("content", e.target.value)}
          placeholder="Summary or key takeaways..."
          rows={4}
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
        />
      </SectionField>
    </div>
  );
}
