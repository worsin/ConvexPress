import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";

export function FieldTaxonomy({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const taxonomy: string = settings.taxonomy ?? "category";
  const fieldType = settings.fieldType ?? "checkbox"; // checkbox, select, multi_select, radio
  const selectedIds: string[] = useMemo(() => { try { return JSON.parse(value || "[]"); } catch { return []; } }, [value]);

  // Fetch terms for the taxonomy
  const terms = useQuery(api.taxonomies.queries.listTerms, { taxonomy, limit: 200 });

  const toggleTerm = (termId: string) => {
    const next = selectedIds.includes(termId) ? selectedIds.filter((id) => id !== termId) : [...selectedIds, termId];
    onChange(JSON.stringify(next));
  };

  if (fieldType === "select" || fieldType === "multi_select") {
    return (
      <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
        <select
          value={fieldType === "multi_select" ? undefined : (selectedIds[0] ?? "")}
          multiple={fieldType === "multi_select"}
          onChange={(e) => {
            if (fieldType === "multi_select") {
              const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
              onChange(JSON.stringify(selected));
            } else {
              onChange(JSON.stringify([e.target.value]));
            }
          }}
          className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
          style={fieldType === "multi_select" ? { height: "auto", minHeight: "6rem" } : undefined}
        >
          {fieldType !== "multi_select" && <option value="">- Select -</option>}
          {terms?.terms?.map((t: { _id: string; name: string }) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          )) ?? []}
        </select>
      </FieldWrapper>
    );
  }

  // Checkbox or radio layout
  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="max-h-48 overflow-y-auto border border-border p-2 space-y-1">
        {terms?.terms?.map((t: { _id: string; name: string }) => (
          <label key={t._id} className="flex items-center gap-1.5 cursor-pointer">
            {fieldType === "radio" ? (
              <input type="radio" name={field.key} checked={selectedIds.includes(t._id)} onChange={() => onChange(JSON.stringify([t._id]))} className="size-3.5" />
            ) : (
              <input type="checkbox" checked={selectedIds.includes(t._id)} onChange={() => toggleTerm(t._id)} className="size-3.5" />
            )}
            <span className="text-xs text-foreground">{t.name}</span>
          </label>
        )) ?? []}
        {terms === undefined && <p className="text-[10px] text-muted-foreground">Loading terms...</p>}
        {terms?.terms?.length === 0 && <p className="text-[10px] text-muted-foreground">No terms found</p>}
      </div>
    </FieldWrapper>
  );
}
