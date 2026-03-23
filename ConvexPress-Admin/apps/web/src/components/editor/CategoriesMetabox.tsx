/**
 * CategoriesMetabox - Hierarchical category checkbox tree (Editor Wrapper)
 *
 * Displays categories as a nested checkbox tree with "All Categories" and
 * "Most Used" tabs. Includes an "Add New Category" inline form at the bottom.
 * Post-type only (hidden for pages).
 *
 * This is the editor-side wrapper that adapts the taxonomy/CategoriesMetabox
 * for the post editor's string-based ID interface.
 */

import { useCallback, useMemo } from "react";

import { CategoriesMetabox as TaxonomyCategoriesMetabox } from "@/components/taxonomy/CategoriesMetabox";

interface CategoriesMetaboxProps {
  selectedIds: string[];
  onToggle: (categoryId: string) => void;
}

export function CategoriesMetabox({
  selectedIds,
  onToggle,
}: CategoriesMetaboxProps) {
  // Convert string[] to Set<string> for the taxonomy component
  const selectedIdsSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );

  const handleToggle = useCallback(
    (categoryId: string) => {
      onToggle(categoryId);
    },
    [onToggle],
  );

  return (
    <TaxonomyCategoriesMetabox
      selectedIds={selectedIdsSet}
      onToggle={handleToggle}
    />
  );
}
