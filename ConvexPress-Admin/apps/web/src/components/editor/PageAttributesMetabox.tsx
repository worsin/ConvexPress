/**
 * PageAttributesMetabox - Parent page selector, template, and menu order
 *
 * Provides a hierarchical parent page dropdown, page template selector,
 * and numeric menu order input. Replaces Categories and Tags for pages.
 *
 * Wired to Convex page tree and templates queries.
 */

import { useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePageTree } from "@/hooks/pages/usePageTree";
import { usePageTemplates } from "@/hooks/pages/usePageTemplates";

interface PageAttributesMetaboxProps {
  parentPageId: string;
  menuOrder: number;
  pageTemplate?: string;
  /** The current page ID (to exclude from parent dropdown) */
  currentPageId?: string;
  onParentChange: (parentId: string) => void;
  onMenuOrderChange: (order: number) => void;
  onTemplateChange?: (template: string) => void;
}

interface FlatPageOption {
  id: string;
  title: string;
  depth: number;
}

export function PageAttributesMetabox({
  parentPageId,
  menuOrder,
  pageTemplate = "default",
  currentPageId,
  onParentChange,
  onMenuOrderChange,
  onTemplateChange,
}: PageAttributesMetaboxProps) {
  const { tree, isLoading: isLoadingTree } = usePageTree({ status: "all" });
  const { templates, isLoading: isLoadingTemplates } = usePageTemplates();

  // Flatten tree for parent dropdown, excluding current page and its descendants
  const flattenTree = useCallback(
    (
      nodes: typeof tree,
      depth = 0,
    ): FlatPageOption[] => {
      const result: FlatPageOption[] = [];
      for (const node of nodes) {
        // Exclude current page and all its descendants
        if (currentPageId && node._id === currentPageId) continue;
        result.push({ id: node._id, title: node.title, depth });
        if (node.children) {
          result.push(...flattenTree(node.children, depth + 1));
        }
      }
      return result;
    },
    [currentPageId],
  );

  const parentOptions = useMemo(() => flattenTree(tree), [tree, flattenTree]);

  return (
    <div className="space-y-3">
      {/* Parent Page */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Parent Page</Label>
        <select
          value={parentPageId}
          onChange={(e) => onParentChange(e.target.value)}
          className="w-full h-7 rounded-none border border-border bg-transparent px-2 text-xs"
          aria-label="Parent page"
          disabled={isLoadingTree}
        >
          <option value="">(no parent)</option>
          {parentOptions.map((page) => (
            <option key={page.id} value={page.id}>
              {"\u2014".repeat(page.depth)} {page.title}
            </option>
          ))}
        </select>
      </div>

      {/* Template */}
      {onTemplateChange && (
        <div className="space-y-1">
          <Label className="text-xs font-medium">Template</Label>
          <select
            value={pageTemplate}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="w-full h-7 rounded-none border border-border bg-transparent px-2 text-xs"
            aria-label="Page template"
            disabled={isLoadingTemplates}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Menu Order */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Order</Label>
        <Input
          type="number"
          value={menuOrder}
          onChange={(e) => onMenuOrderChange(parseInt(e.target.value, 10) || 0)}
          min={0}
          className="h-7 text-xs w-20"
          aria-label="Menu order"
        />
        <p className="text-xs text-muted-foreground">
          Pages are normally sorted alphabetically, but you can choose a
          custom order by entering a number here.
        </p>
      </div>
    </div>
  );
}
