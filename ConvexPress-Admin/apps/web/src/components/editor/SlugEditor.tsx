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
import type { EditorContentType } from "@/types/editor";

interface SlugEditorProps {
  contentType: EditorContentType;
  slug: string;
  onChange: (slug: string) => void;
  /** Called to flag that user has manually edited the slug */
  onManualEdit?: () => void;
  /** Site URL from settings; falls back to "https://example.com" if not provided */
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

const DEFAULT_SITE_URL = "https://example.com";

export function SlugEditor({
  contentType,
  slug,
  onChange,
  onManualEdit,
  siteUrl,
}: SlugEditorProps) {
  const SITE_URL = siteUrl || DEFAULT_SITE_URL;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(slug);

  const permalink =
    contentType === "post"
      ? `${SITE_URL}/blog/${slug || "..."}`
      : `${SITE_URL}/${slug || "..."}`;

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
    <div className="text-xs text-muted-foreground">
      {!isEditing ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>Permalink:</span>
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-all"
          >
            {permalink}
          </a>
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
            {contentType === "post"
              ? `${SITE_URL}/blog/`
              : `${SITE_URL}/`}
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
    </div>
  );
}
