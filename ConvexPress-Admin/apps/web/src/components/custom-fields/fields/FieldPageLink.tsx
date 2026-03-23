import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

export function FieldPageLink({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const multiple = settings.multiple ?? false;

  // Fetch pages for selection
  const pages = useQuery(api.posts.queries.list, { postType: "page", status: "publish", limit: 100 });

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <select
        value={multiple ? undefined : value}
        multiple={multiple}
        onChange={(e) => {
          if (multiple) {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange(JSON.stringify(selected));
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
        style={multiple ? { height: "auto", minHeight: "6rem" } : undefined}
      >
        {!multiple && <option value="">- Select Page -</option>}
        {pages?.posts?.map((p: { _id: string; title: string }) => (
          <option key={p._id} value={p._id}>{p.title}</option>
        )) ?? []}
      </select>
      {pages === undefined && <p className="text-[10px] text-muted-foreground mt-1">Loading pages...</p>}
    </FieldWrapper>
  );
}
