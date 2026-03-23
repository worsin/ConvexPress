import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { MenuItem } from "./types";

interface MenuItemEditorProps {
  item: MenuItem;
  onClose: () => void;
  onRemove: (itemId: Id<"menuItems">) => void;
}

/**
 * Expanded editor form for a single menu item.
 * Shows: label, title attribute, CSS classes, target, link rel, description, original reference.
 */
export function MenuItemEditor({
  item,
  onClose,
  onRemove,
}: MenuItemEditorProps) {
  const updateMenuItem = useMutation(api.menus.mutations.updateMenuItem);

  const [label, setLabel] = useState(item.label);
  const [title, setTitle] = useState(item.title ?? "");
  const [cssClasses, setCssClasses] = useState(item.cssClasses ?? "");
  const [openInNewTab, setOpenInNewTab] = useState(item.target === "_blank");
  const [linkRel, setLinkRel] = useState(item.linkRel ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedDraft = useMemo(
    () => ({
      label: label.trim(),
      title: title.trim() || undefined,
      cssClasses: cssClasses.trim() || undefined,
      target: openInNewTab ? "_blank" : "_self",
      linkRel: linkRel.trim() || undefined,
      description: description.trim() || undefined,
      url: item.itemType === "custom" ? url.trim() || undefined : undefined,
    }),
    [cssClasses, description, item.itemType, label, linkRel, openInNewTab, title, url],
  );
  const draftSignature = useMemo(
    () => JSON.stringify(normalizedDraft),
    [normalizedDraft],
  );
  const lastSavedSignatureRef = useRef(
    JSON.stringify({
      label: item.label.trim(),
      title: item.title?.trim() || undefined,
      cssClasses: item.cssClasses?.trim() || undefined,
      target: item.target === "_blank" ? "_blank" : "_self",
      linkRel: item.linkRel?.trim() || undefined,
      description: item.description?.trim() || undefined,
      url: item.itemType === "custom" ? item.url?.trim() || undefined : undefined,
    }),
  );

  useEffect(() => {
    if (draftSignature === lastSavedSignatureRef.current) {
      if (saveStatus === "pending" || saveStatus === "saving") {
        setSaveStatus("idle");
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (!normalizedDraft.label) {
      setSaveStatus("error");
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveStatus("pending");
    const payload = normalizedDraft;
    const payloadSignature = draftSignature;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      setSaveStatus("saving");
      void updateMenuItem({
        itemId: item._id,
        label: payload.label,
        title: payload.title,
        cssClasses: payload.cssClasses,
        target: payload.target,
        linkRel: payload.linkRel,
        description: payload.description,
        ...(item.itemType === "custom" ? { url: payload.url } : {}),
      })
        .then(() => {
          lastSavedSignatureRef.current = payloadSignature;
          setSaveStatus("saved");
        })
        .catch((error) => {
          setSaveStatus("error");
          toast.error(
            error instanceof Error ? error.message : "Failed to update item",
          );
        });
    }, 600);
  }, [draftSignature, item._id, item.itemType, normalizedDraft, saveStatus, updateMenuItem]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const statusMessage = () => {
    if (!normalizedDraft.label) return "Label is required";
    if (saveStatus === "saving") return "Saving...";
    if (saveStatus === "pending") return "Saving shortly...";
    if (saveStatus === "error") return "Autosave failed";
    if (saveStatus === "saved") return "Saved";
    return "Saved";
  };

  // Original reference label
  const originalLabel =
    item.itemType === "custom"
      ? `Custom URL: ${item.url ?? ""}`
      : `${item.itemType.charAt(0).toUpperCase() + item.itemType.slice(1)}: ${item.label}`;

  return (
    <div className="space-y-3 p-3 bg-muted/20 border-t border-border">
      {/* Custom URL field (only for custom links) */}
      {item.itemType === "custom" && (
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">
            URL
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
      )}

      {/* Navigation Label */}
      <div>
        <label className="block text-[10px] text-muted-foreground mb-0.5">
          Navigation Label
        </label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Navigation Label"
        />
      </div>

      {/* Title Attribute */}
      <div>
        <label className="block text-[10px] text-muted-foreground mb-0.5">
          Title Attribute
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title attribute (tooltip)"
        />
      </div>

      {/* Open in new tab */}
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={openInNewTab}
          onCheckedChange={(checked) => setOpenInNewTab(checked === true)}
        />
        <span className="text-[10px] text-foreground">
          Open link in a new tab
        </span>
      </label>

      {/* CSS Classes */}
      <div>
        <label className="block text-[10px] text-muted-foreground mb-0.5">
          CSS Classes (optional)
        </label>
        <Input
          value={cssClasses}
          onChange={(e) => setCssClasses(e.target.value)}
          placeholder="Space-separated class names"
        />
      </div>

      {/* Link Relationship */}
      <div>
        <label className="block text-[10px] text-muted-foreground mb-0.5">
          Link Relationship (XFN)
        </label>
        <Input
          value={linkRel}
          onChange={(e) => setLinkRel(e.target.value)}
          placeholder="e.g., nofollow"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-[10px] text-muted-foreground mb-0.5">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (shown in some themes)"
          rows={2}
          className="w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1.5 text-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 resize-none"
        />
      </div>

      {/* Original reference */}
      <p className="text-[10px] text-muted-foreground">
        Original: {originalLabel}
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <button
          type="button"
          onClick={() => onRemove(item._id)}
          className="text-[10px] text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
        >
          <Trash2Icon className="size-3" />
          Remove
        </button>
        <div className="flex items-center gap-2">
          <span
            className={
              saveStatus === "error"
                ? "text-[10px] text-destructive"
                : "text-[10px] text-muted-foreground"
            }
            aria-live="polite"
          >
            {statusMessage()}
          </span>
          <Button variant="outline" size="xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
