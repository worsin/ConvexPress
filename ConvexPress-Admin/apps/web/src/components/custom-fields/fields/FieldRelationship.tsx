import { useMemo, useState } from "react";
import type { FieldRendererProps } from "./index";
import { FieldWrapper } from "./FieldWrapper";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { XIcon, SearchIcon } from "lucide-react";

export function FieldRelationship({ field, value, onChange, labelPlacement, instructionPlacement }: FieldRendererProps) {
  const settings = useMemo(() => { try { return JSON.parse(field.settings); } catch { return {}; } }, [field.settings]);
  const postTypes: string[] = settings.postTypes ?? ["post"];
  const min = settings.min ?? 0;
  const max = settings.max ?? 0;
  const selectedIds: string[] = useMemo(() => { try { return JSON.parse(value || "[]"); } catch { return []; } }, [value]);
  const [search, setSearch] = useState("");

  // Fetch posts for selection
  const posts = useQuery(api.posts.queries.list, { status: "publish", limit: 100 });

  const filteredPosts = useMemo(() => {
    if (!posts?.posts) return [];
    return posts.posts.filter((p: { postType?: string; title: string }) => {
      if (!postTypes.includes(p.postType ?? "post")) return false;
      if (selectedIds.includes(p._id)) return false;
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [posts, postTypes, selectedIds, search]);

  const selectedPosts = useMemo(() => {
    if (!posts?.posts) return [];
    return selectedIds.map((id) => posts.posts.find((p: { _id: string }) => p._id === id)).filter(Boolean);
  }, [posts, selectedIds]);

  const addPost = (postId: string) => {
    if (max > 0 && selectedIds.length >= max) return;
    onChange(JSON.stringify([...selectedIds, postId]));
  };

  const removePost = (postId: string) => {
    onChange(JSON.stringify(selectedIds.filter((id) => id !== postId)));
  };

  return (
    <FieldWrapper label={field.label} instructions={field.instructions} required={field.required} labelPlacement={labelPlacement} instructionPlacement={instructionPlacement}>
      <div className="grid grid-cols-2 gap-2 border border-border">
        {/* Available posts */}
        <div className="border-r border-border">
          <div className="p-1.5 border-b border-border">
            <div className="flex items-center gap-1 px-1.5 h-7 border border-border bg-background">
              <SearchIcon className="size-3 text-muted-foreground" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="flex-1 bg-transparent text-xs focus:outline-hidden" />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filteredPosts.map((p: { _id: string; title: string }) => (
              <button key={p._id} type="button" onClick={() => addPost(p._id)} className="w-full text-left px-2 py-1 text-xs text-foreground hover:bg-muted border-b border-border last:border-0">
                {p.title}
              </button>
            ))}
            {filteredPosts.length === 0 && (
              <p className="px-2 py-3 text-[10px] text-muted-foreground text-center">No posts found</p>
            )}
          </div>
        </div>

        {/* Selected posts */}
        <div>
          <div className="p-1.5 border-b border-border">
            <p className="text-[10px] text-muted-foreground px-1">
              Selected ({selectedIds.length}{max > 0 ? `/${max}` : ""})
              {min > 0 && `, min ${min}`}
            </p>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {selectedPosts.map((p: { _id: string; title: string } | undefined) => p && (
              <div key={p._id} className="flex items-center justify-between px-2 py-1 border-b border-border last:border-0">
                <span className="text-xs text-foreground truncate">{p.title}</span>
                <button type="button" onClick={() => removePost(p._id)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
            {selectedPosts.length === 0 && (
              <p className="px-2 py-3 text-[10px] text-muted-foreground text-center">None selected</p>
            )}
          </div>
        </div>
      </div>
    </FieldWrapper>
  );
}
