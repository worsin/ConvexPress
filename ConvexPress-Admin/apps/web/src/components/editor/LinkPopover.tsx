/**
 * LinkPopover - Link editing popover
 *
 * Appears when the user clicks the Link button in the toolbar or presses Ctrl+K.
 * Allows setting the URL, opening in a new tab, and removing the link.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";

interface LinkPopoverProps {
  editor: Editor;
  onClose: () => void;
}

export function LinkPopover({ editor, onClose }: LinkPopoverProps) {
  const currentUrl = editor.getAttributes("link").href || "";
  const [url, setUrl] = useState(currentUrl);
  const [openInNewTab, setOpenInNewTab] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    // Use a slight delay to avoid the popover closing immediately from the
    // same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Set link
  const handleSetLink = useCallback(() => {
    if (!url.trim()) {
      // Remove link if URL is empty
      editor.chain().focus().unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({
          href: url.trim(),
          target: openInNewTab ? "_blank" : null,
        })
        .run();
    }
    onClose();
  }, [editor, url, openInNewTab, onClose]);

  // Remove link
  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    onClose();
  }, [editor, onClose]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSetLink();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleSetLink, onClose],
  );

  return (
    <div
      ref={popoverRef}
      className="absolute top-2 left-1/2 -translate-x-1/2 z-50 w-80 bg-card border border-border shadow-lg p-3 space-y-2"
    >
      <div>
        <label
          htmlFor="link-url"
          className="block text-[10px] font-medium text-muted-foreground mb-1"
        >
          URL
        </label>
        <input
          ref={inputRef}
          id="link-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com"
          className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="link-new-tab"
          type="checkbox"
          checked={openInNewTab}
          onChange={(e) => setOpenInNewTab(e.target.checked)}
          className="size-3"
        />
        <label
          htmlFor="link-new-tab"
          className="text-[10px] text-muted-foreground cursor-pointer"
        >
          Open in new tab
        </label>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSetLink}
          className="bg-primary text-primary-foreground px-2 py-1 text-xs font-medium hover:bg-primary/80 transition-colors"
        >
          {currentUrl ? "Update" : "Insert"} Link
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={handleRemoveLink}
            className="text-destructive text-xs hover:underline"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
