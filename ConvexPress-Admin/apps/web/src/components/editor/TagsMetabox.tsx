/**
 * TagsMetabox - Tag input with autocomplete and removable chips (Editor Wrapper)
 *
 * Provides a text input with autocomplete suggestions, tag creation,
 * and a "Choose from the most used tags" link for a tag cloud.
 * Post-type only (hidden for pages).
 *
 * This is the editor-side wrapper that adapts the taxonomy/TagsMetabox
 * for the post editor's TagItem-based interface.
 */

import { useCallback } from "react";

import { TagsMetabox as TaxonomyTagsMetabox } from "@/components/taxonomy/TagsMetabox";
import type { TagItem } from "@/types/editor";

interface TagsMetaboxProps {
  selectedTags: TagItem[];
  onAddTag: (tag: TagItem) => void;
  onRemoveTag: (tagId: string) => void;
}

interface TagData {
  _id: string;
  name: string;
  slug: string;
  count: number;
}

export function TagsMetabox({
  selectedTags,
  onAddTag,
  onRemoveTag,
}: TagsMetaboxProps) {
  // Convert TagItem[] to TagData[] for the taxonomy component
  const taxonomyTags: TagData[] = selectedTags.map((t) => ({
    _id: t.id,
    name: t.name,
    slug: t.slug,
    count: t.postCount,
  }));

  const handleAddTag = useCallback(
    (tag: TagData) => {
      onAddTag({
        id: tag._id,
        name: tag.name,
        slug: tag.slug,
        postCount: tag.count,
      });
    },
    [onAddTag],
  );

  const handleRemoveTag = useCallback(
    (tagId: string) => {
      onRemoveTag(tagId);
    },
    [onRemoveTag],
  );

  return (
    <TaxonomyTagsMetabox
      selectedTags={taxonomyTags}
      onAddTag={handleAddTag}
      onRemoveTag={handleRemoveTag}
    />
  );
}
