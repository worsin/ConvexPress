/**
 * PageQuickEdit - Inline quick edit form for the page list table
 *
 * Replaces the row when active. Allows editing:
 * title, slug, status, parent, template, and order.
 *
 * Wired to Convex page mutations.
 */

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePageMutations } from "@/hooks/pages/usePageMutations";
import { usePageTree } from "@/hooks/pages/usePageTree";
import { usePageTemplates } from "@/hooks/pages/usePageTemplates";
import type { Id } from "@backend/convex/_generated/dataModel";

/** Valid page status values */
type PageStatus = "auto-draft" | "draft" | "pending" | "publish" | "future" | "private" | "trash";

interface PageQuickEditProps {
  page: {
    _id: string;
    title: string;
    slug: string;
    status: string;
    parentId?: string;
    pageTemplate?: string;
    menuOrder?: number;
  };
  onClose: () => void;
}

interface PageTemplateOption {
  id: string;
  name: string;
}

export function PageQuickEdit({ page, onClose }: PageQuickEditProps) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [status, setStatus] = useState(page.status);
  const [parentId, setParentId] = useState(page.parentId ?? "");
  const [pageTemplate, setPageTemplate] = useState(page.pageTemplate ?? "default");
  const [menuOrder, setMenuOrder] = useState(page.menuOrder ?? 0);
  const [isSaving, setIsSaving] = useState(false);

  const { updatePage, setPageParent } = usePageMutations();
  const { tree } = usePageTree({ status: "all" });
  const { templates } = usePageTemplates();
  const templateOptions = templates as PageTemplateOption[];

  // Flatten tree for parent dropdown, excluding self AND all descendants
  // (selecting a descendant as parent would create a circular reference)
  const flattenTree = useCallback(
    (
      nodes: typeof tree,
      depth = 0,
    ): Array<{ id: string; title: string; depth: number }> => {
      const result: Array<{ id: string; title: string; depth: number }> = [];
      for (const node of nodes) {
        // Skip the current page AND all its descendants (skip the entire subtree)
        if (node._id === page._id) continue;
        result.push({ id: node._id, title: node.title, depth });
        if (node.children) {
          result.push(...flattenTree(node.children, depth + 1));
        }
      }
      return result;
    },
    [page._id],
  );

  const parentOptions = flattenTree(tree);

  const handleUpdate = useCallback(async () => {
    setIsSaving(true);
    try {
      // Detect parent change: user selected "(no parent)" to make top-level
      const originalParentId = page.parentId ?? "";
      const parentChanged = parentId !== originalParentId;

      // If parent changed to top-level (empty string), use setPageParent
      // because the update mutation cannot distinguish "no parentId arg"
      // from "clear parentId" (both are undefined in Convex args).
      if (parentChanged && !parentId) {
        await setPageParent(page._id as Id<"posts">, undefined);
      } else if (parentChanged && parentId) {
        await setPageParent(page._id as Id<"posts">, parentId as Id<"posts">);
      }

      // Update other fields (exclude parentId -- handled above via setPageParent)
      await updatePage({
        pageId: page._id as Id<"posts">,
        title,
        slug,
        status: status as PageStatus,
        pageTemplate,
        menuOrder,
      });
      onClose();
    } catch {
      // Error toast is handled by the mutation hooks
    } finally {
      setIsSaving(false);
    }
  }, [title, slug, status, parentId, pageTemplate, menuOrder, page._id, page.parentId, updatePage, setPageParent, onClose]);

  return (
    <div className="border border-border bg-card rounded-none">
      <div className="border-b border-border bg-muted/50 px-4 py-2">
        <h3 className="text-xs font-semibold text-foreground">Quick Edit</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Title + Slug row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Title
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Slug
            </Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Status + Parent row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Status
            </Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="draft">Draft</option>
              <option value="pending">Pending Review</option>
              <option value="publish">Published</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Parent
            </Label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="">(no parent)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {"\u2014".repeat(p.depth)} {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Template + Order row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Template
            </Label>
            <select
              value={pageTemplate}
              onChange={(e) => setPageTemplate(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Order
            </Label>
            <Input
              type="number"
              value={menuOrder}
              onChange={(e) => setMenuOrder(parseInt(e.target.value, 10) || 0)}
              min={0}
              className="w-20"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleUpdate} disabled={isSaving}>
            {isSaving ? "Updating..." : "Update"}
          </Button>
        </div>
      </div>
    </div>
  );
}
