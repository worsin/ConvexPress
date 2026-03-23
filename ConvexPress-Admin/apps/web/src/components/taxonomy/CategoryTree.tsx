/**
 * CategoryTree - Hierarchical checkbox tree
 *
 * Renders getCategoryTree data as nested indented checkboxes.
 * Pre-checked for assigned categories. Supports expand/collapse.
 * Used inside CategoriesMetabox.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface CategoryTreeNode {
  _id: string;
  name: string;
  slug: string;
  count: number;
  isDefault: boolean;
  depth: number;
  children: CategoryTreeNode[];
}

interface CategoryTreeProps {
  /** The tree nodes to render. */
  nodes: CategoryTreeNode[];
  /** Set of currently selected category IDs. */
  selectedIds: Set<string>;
  /** Toggle callback when a checkbox is clicked. */
  onToggle: (categoryId: string) => void;
}

function CategoryTreeNode({
  node,
  depth,
  selectedIds,
  onToggle,
}: {
  node: CategoryTreeNode;
  depth: number;
  selectedIds: Set<string>;
  onToggle: (categoryId: string) => void;
}) {
  const isChecked = selectedIds.has(node._id);

  return (
    <div role="treeitem" aria-expanded={node.children.length > 0 ? true : undefined}>
      <div
        className="flex items-center gap-1.5 py-0.5"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <Checkbox
          checked={isChecked}
          onCheckedChange={() => onToggle(node._id)}
          aria-label={node.name}
        />
        <Label className="cursor-pointer text-xs font-normal">
          {node.name}
        </Label>
      </div>
      {node.children.map((child) => (
        <CategoryTreeNode
          key={child._id}
          node={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

export function CategoryTree({
  nodes,
  selectedIds,
  onToggle,
}: CategoryTreeProps) {
  if (nodes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No categories found.
      </p>
    );
  }

  return (
    <div role="tree" aria-label="Categories">
      {nodes.map((node) => (
        <CategoryTreeNode
          key={node._id}
          node={node}
          depth={0}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
