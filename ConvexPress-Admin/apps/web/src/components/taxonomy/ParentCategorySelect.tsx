/**
 * ParentCategorySelect - Indented parent category dropdown
 *
 * Populates from getCategoryTree. Categories are indented with "— " prefix
 * per depth level. First option is "None" (root level).
 * Used in AddCategoryForm and CategoriesMetabox inline add.
 */

import { useMemo } from "react";

interface CategoryTreeNode {
  _id: string;
  name: string;
  slug: string;
  count: number;
  isDefault: boolean;
  depth: number;
  children: CategoryTreeNode[];
}

interface FlatOption {
  id: string;
  name: string;
  depth: number;
}

interface ParentCategorySelectProps {
  /** Currently selected parent ID (empty string for "None"/root). */
  value: string;
  /** Change handler. */
  onChange: (value: string) => void;
  /** The category tree data from getCategoryTree query. */
  categoryTree: CategoryTreeNode[] | undefined;
  /** Optional: term ID to exclude from the list (to prevent self-parenting). */
  excludeId?: string;
  /** Optional: class overrides. */
  className?: string;
  /** Optional: aria label. */
  ariaLabel?: string;
}

function flattenTree(
  nodes: CategoryTreeNode[],
  excludeId?: string,
): FlatOption[] {
  const result: FlatOption[] = [];
  function walk(node: CategoryTreeNode, depth: number) {
    if (excludeId && node._id === excludeId) return;
    result.push({ id: node._id, name: node.name, depth });
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
  for (const root of nodes) {
    walk(root, 0);
  }
  return result;
}

export function ParentCategorySelect({
  value,
  onChange,
  categoryTree,
  excludeId,
  className,
  ariaLabel = "Parent category",
}: ParentCategorySelectProps) {
  const flatOptions = useMemo(
    () => (categoryTree ? flattenTree(categoryTree, excludeId) : []),
    [categoryTree, excludeId],
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={
        className ??
        "h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
      }
    >
      <option value="">None</option>
      {flatOptions.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {"—".repeat(opt.depth)}{opt.depth > 0 ? " " : ""}
          {opt.name}
        </option>
      ))}
    </select>
  );
}
