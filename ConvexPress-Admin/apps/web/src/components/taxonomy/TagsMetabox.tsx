/**
 * TagsMetabox - Post editor tags metabox
 *
 * TagInput component for adding tags. Tag chips for assigned tags.
 * "Choose from the most used tags" expandable link showing top 20.
 *
 * This is the taxonomy/TagsMetabox -- the standalone version using
 * real Convex queries. The editor/TagsMetabox wrapper delegates to this.
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { TagInput } from "./TagInput";

interface TagData {
  _id: string;
  name: string;
  slug: string;
  count: number;
}

interface TagsMetaboxProps {
  /** Currently selected tags. */
  selectedTags: TagData[];
  /** Called when a tag is added. */
  onAddTag: (tag: TagData) => void;
  /** Called when a tag is removed. */
  onRemoveTag: (tagId: string) => void;
}

export function TagsMetabox({
  selectedTags,
  onAddTag,
  onRemoveTag,
}: TagsMetaboxProps) {
  const [showMostUsed, setShowMostUsed] = useState(false);

  const mostUsedResult = useQuery(api.taxonomies.queries.list, {
    taxonomy: "post_tag" as const,
    orderBy: "count" as const,
    orderDir: "desc" as const,
    perPage: 20,
  });

  const mostUsedTags: TagData[] = useMemo(
    () =>
      (mostUsedResult?.terms ?? [])
        .filter(
          (t: { _id: string }) =>
            !selectedTags.some((st) => st._id === t._id),
        )
        .map(
          (t: {
            _id: string;
            name: string;
            slug: string;
            count: number;
          }) => ({
            _id: t._id,
            name: t.name,
            slug: t.slug,
            count: t.count,
          }),
        ),
    [mostUsedResult, selectedTags],
  );

  return (
    <div>
      {/* Tag input with autocomplete and chips */}
      <TagInput
        selectedTags={selectedTags}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
      />

      {/* Most used tags */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowMostUsed(!showMostUsed)}
          className="text-xs text-primary hover:underline"
        >
          Choose from the most used tags
        </button>

        {showMostUsed && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {mostUsedTags.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No tags found.
              </span>
            ) : (
              mostUsedTags.map((tag) => (
                <button
                  key={tag._id}
                  type="button"
                  onClick={() => onAddTag(tag)}
                  className={cn(
                    "text-xs text-primary hover:underline",
                    tag.count > 10 && "font-medium",
                  )}
                >
                  {tag.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
