import { useState } from "react";
import {
  ChevronDownIcon,
  FileTextIcon,
  PenToolIcon,
  FolderIcon,
  TagIcon,
  LinkIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { MenuAddContentPanel } from "./MenuAddContentPanel";
import { MenuAddCustomLinkPanel } from "./MenuAddCustomLinkPanel";
import type { Id } from "@backend/convex/_generated/dataModel";

interface MenuAddItemsPanelProps {
  menuId: Id<"menus">;
}

interface AccordionSection {
  id: string;
  label: string;
  icon: typeof FileTextIcon;
}

const SECTIONS: AccordionSection[] = [
  { id: "pages", label: "Pages", icon: FileTextIcon },
  { id: "posts", label: "Posts", icon: PenToolIcon },
  { id: "custom", label: "Custom Links", icon: LinkIcon },
  { id: "categories", label: "Categories", icon: FolderIcon },
  { id: "tags", label: "Tags", icon: TagIcon },
];

/**
 * Left sidebar wrapper with accordion panels for adding items to a menu.
 * Contains: Pages, Posts, Custom Links, Categories, Tags.
 */
export function MenuAddItemsPanel({ menuId }: MenuAddItemsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["pages"]),
  );

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-foreground mb-3">
        Add menu items
      </h3>

      {SECTIONS.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const Icon = section.icon;

        return (
          <div
            key={section.id}
            className="border border-border bg-card"
          >
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
              aria-expanded={isExpanded}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-3 text-muted-foreground" />
                {section.label}
              </span>
              <ChevronDownIcon
                className={cn(
                  "size-3 text-muted-foreground transition-transform",
                  isExpanded && "rotate-180",
                )}
              />
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-border pt-2">
                {section.id === "custom" ? (
                  <MenuAddCustomLinkPanel menuId={menuId} />
                ) : (
                  <MenuAddContentPanel
                    menuId={menuId}
                    contentType={
                      section.id === "pages"
                        ? "page"
                        : section.id === "posts"
                          ? "post"
                          : section.id === "categories"
                            ? "category"
                            : "tag"
                    }
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
