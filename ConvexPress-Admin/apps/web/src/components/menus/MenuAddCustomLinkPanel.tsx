import { useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { LinkIcon, LoaderIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Id } from "@backend/convex/_generated/dataModel";

interface MenuAddCustomLinkPanelProps {
  menuId: Id<"menus">;
}

/**
 * Panel for adding custom URL links to a menu.
 * Uses useTransition for pending state during item addition.
 */
export function MenuAddCustomLinkPanel({
  menuId,
}: MenuAddCustomLinkPanelProps) {
  const [url, setUrl] = useState("https://");
  const [label, setLabel] = useState("");
  const [isAdding, startAdding] = useTransition();
  const addMenuItem = useMutation(api.menus.mutations.addMenuItem);

  const handleAdd = () => {
    const trimmedUrl = url.trim();
    const trimmedLabel = label.trim();

    if (!trimmedUrl || trimmedUrl === "https://" || trimmedUrl === "http://") {
      toast.error("URL is required");
      return;
    }
    if (!trimmedLabel) {
      toast.error("Link text is required");
      return;
    }

    startAdding(async () => {
      try {
        await addMenuItem({
          menuId,
          itemType: "custom",
          label: trimmedLabel,
          url: trimmedUrl,
        });
        toast.success(`Custom link "${trimmedLabel}" added`);
        setUrl("https://");
        setLabel("");
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to add custom link",
        );
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <LinkIcon className="size-3" />
        Custom Links
      </div>

      <div className="space-y-2">
        <div>
          <label
            htmlFor="custom-url"
            className="block text-[10px] text-muted-foreground mb-0.5"
          >
            URL
          </label>
          <Input
            id="custom-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            disabled={isAdding}
          />
        </div>
        <div>
          <label
            htmlFor="custom-label"
            className="block text-[10px] text-muted-foreground mb-0.5"
          >
            Link Text
          </label>
          <Input
            id="custom-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Link text"
            disabled={isAdding}
          />
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={isAdding}
        className="w-full"
      >
        {isAdding ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <PlusIcon className="size-3" />
        )}
        Add to Menu
      </Button>
    </div>
  );
}
