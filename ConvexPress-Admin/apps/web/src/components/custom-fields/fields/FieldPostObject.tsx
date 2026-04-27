import { useMemo } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

export function FieldPostObject({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const postTypes: string[] = settings.postTypes ?? ["post"];
  const multiple = settings.multiple ?? false;
  const selectedIds: string[] = useMemo(() => {
    if (multiple) { try { return JSON.parse(value || "[]"); } catch { return []; } }
    return value ? [value] : [];
  }, [value, multiple]);

  // Fetch posts for selection
  const posts = useQuery(api.posts.queries.list, { status: "publish", limit: 100 });

  const filteredPosts = useMemo(() => {
    if (!posts?.posts) return [];
    return posts.posts.filter((p: { postType?: string }) => postTypes.includes(p.postType ?? "post"));
  }, [posts, postTypes]);

  const handleChange = (postId: string) => {
    if (multiple) {
      const next = selectedIds.includes(postId) ? selectedIds.filter((id) => id !== postId) : [...selectedIds, postId];
      onChange(JSON.stringify(next));
    } else {
      onChange(postId);
    }
  };

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
        {!multiple && <option value="">- Select Post -</option>}
        {filteredPosts.map((p: { _id: string; title: string }) => (
          <option key={p._id} value={p._id}>{p.title}</option>
        ))}
      </select>
      {posts === undefined && <p className="text-[10px] text-muted-foreground mt-1">Loading posts...</p>}
    </FieldWrapper>
  );
}
