/**
 * "Structure" add-items panel: headings and separators for sidebars and
 * dropdowns. Neither is a link.
 */

import { useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Heading as HeadingIcon, LoaderIcon, Minus, PlusIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MenuAddStructurePanelProps {
  menuId: Id<"menus">;
}

export function MenuAddStructurePanel({ menuId }: MenuAddStructurePanelProps) {
  const [heading, setHeading] = useState("");
  const [isAdding, startAdding] = useTransition();
  const addMenuItem = useMutation(api.menus.mutations.addMenuItem);

  const addHeading = () => {
    const label = heading.trim();
    if (!label) {
      toast.error("Heading text is required");
      return;
    }
    startAdding(async () => {
      try {
        await addMenuItem({ menuId, itemType: "heading", label });
        toast.success(`Heading "${label}" added`);
        setHeading("");
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to add heading");
      }
    });
  };

  const addSeparator = () => {
    startAdding(async () => {
      try {
        await addMenuItem({ menuId, itemType: "separator", label: "Separator" });
        toast.success("Separator added");
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to add separator");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <HeadingIcon className="size-3" />
        Structure
      </div>
      <p className="text-[10px] text-muted-foreground">Section labels and dividers for sidebars and dropdown menus. They are not links.</p>
      <div>
        <label htmlFor="structure-heading" className="mb-0.5 block text-[10px] text-muted-foreground">
          Heading text
        </label>
        <div className="flex gap-1.5">
          <Input
            id="structure-heading"
            value={heading}
            onChange={(event) => setHeading(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addHeading();
              }
            }}
            placeholder="e.g. Shopping"
            disabled={isAdding}
          />
          <Button variant="outline" size="sm" onClick={addHeading} disabled={isAdding} aria-label="Add heading">
            {isAdding ? <LoaderIcon className="size-3 animate-spin" /> : <PlusIcon className="size-3" />}
            Heading
          </Button>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={addSeparator} disabled={isAdding} className="w-full">
        <Minus className="size-3" />
        Add separator
      </Button>
    </div>
  );
}
