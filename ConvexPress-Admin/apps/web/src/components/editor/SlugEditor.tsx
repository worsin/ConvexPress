/**
 * SlugEditor - Editable slug with live permalink preview
 *
 * Shows permalink in read mode with an Edit button. In edit mode,
 * provides an input for manual slug editing with OK/Cancel buttons.
 * Auto-sanitizes slug on blur.
 */

import { useCallback, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { pageRouteWarning } from "@backend/convex/helpers/pageRoutePolicy";
import { normalizeEditorSiteUrl } from "./editor-site-url";
import type { EditorContentType } from "@/types/editor";

interface SlugEditorProps {
  contentType: EditorContentType;
  slug: string;
  parentPageId?: string;
  onChange: (slug: string) => void;
  /** Called to flag that user has manually edited the slug */
  onManualEdit?: () => void;
  /** Authoritative public origin for the selected environment, when configured. */
  siteUrl?: string;
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function SlugEditor({
  contentType,
  slug,
  onChange,
  onManualEdit,
  siteUrl,
  parentPageId,
}: SlugEditorProps) {
  const SITE_URL = normalizeEditorSiteUrl(siteUrl) ?? "";
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(slug);

  const settings = useQuery(api.settings.queries.getPublic, contentType === "page" ? {} : "skip");
  const parent = useQuery(
    api.pages.queries.get,
    contentType === "page" && parentPageId ? { pageId: parentPageId as Id<"posts"> } : "skip",
  );
  const parentPath = typeof parent?.path === "string" ? parent.path : "";
  const candidateSlug = isEditing ? sanitizeSlug(editValue) : slug;
  const candidatePath = `${parentPath}/${candidateSlug}`;
  const warning =
    contentType === "page" && candidateSlug && (!parentPageId || parent)
      ? pageRouteWarning(candidatePath, settings?.dashboardConfig?.basePath)
      : null;
  const pagePrefix = parentPageId || warning ? `${SITE_URL}/page${parentPath}/` : `${SITE_URL}/`;

  const permalink =
    contentType === "post" ? `${SITE_URL}/blog/${slug || "..."}` : `${pagePrefix}${slug || "..."}`;

  const handleEdit = useCallback(() => {
    setEditValue(slug);
    setIsEditing(true);
  }, [slug]);

  const handleOk = useCallback(() => {
    const sanitized = sanitizeSlug(editValue);
    onChange(sanitized);
    onManualEdit?.();
    setIsEditing(false);
  }, [editValue, onChange, onManualEdit]);

  const handleCancel = useCallback(() => {
    setEditValue(slug);
    setIsEditing(false);
  }, [slug]);

  if (!slug && !isEditing) {
    return null;
  }

  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      {!isEditing ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>Permalink:</span>
          {SITE_URL ? (
            <a
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline break-all"
            >
              {permalink}
            </a>
          ) : (
            <span>Set this environment's public website address to preview its permalink.</span>
          )}
          <button
            type="button"
            onClick={handleEdit}
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            <Pencil className="size-3" />
            Edit
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="shrink-0">Permalink:</span>
          <span className="text-foreground">
            {contentType === "post" ? `${SITE_URL}/blog/` : pagePrefix}
          </span>
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleOk();
              }
              if (e.key === "Escape") {
                handleCancel();
              }
            }}
            className="h-6 text-xs w-32 inline-flex"
            autoFocus
          />
          <Button size="xs" onClick={handleOk}>
            OK
          </Button>
          <Button variant="ghost" size="xs" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}
      {warning && (
        <p role="status" className="border-l-2 border-destructive pl-2 text-destructive">
          {warning}
        </p>
      )}
    </div>
  );
}
