import { useState } from "react";
import {
  ChevronDownIcon,
  FileTextIcon,
  FolderIcon,
  Heading as HeadingIcon,
  LayoutPanelLeft,
  LinkIcon,
  PenToolIcon,
  TagIcon,
} from "lucide-react";

import { usePluginSettings } from "@/hooks/usePluginSettings";
import { cn } from "@/lib/utils";
import { MenuAddContentPanel } from "./MenuAddContentPanel";
import { MenuAddCustomLinkPanel } from "./MenuAddCustomLinkPanel";
import { MenuAddDashboardPanel } from "./MenuAddDashboardPanel";
import { MenuAddStructurePanel } from "./MenuAddStructurePanel";
import type { Id } from "@backend/convex/_generated/dataModel";

interface MenuAddItemsPanelProps {
  menuId: Id<"menus">;
}

type SectionId = "pages" | "posts" | "dashboard" | "custom" | "structure" | "categories" | "tags";

interface AccordionSection {
  id: SectionId;
  label: string;
  icon: typeof FileTextIcon;
  /** Hidden when this plugin is disabled. */
  pluginId?: string;
}

const SECTIONS: AccordionSection[] = [
  { id: "pages", label: "Pages", icon: FileTextIcon },
  { id: "posts", label: "Posts", icon: PenToolIcon },
  { id: "dashboard", label: "Dashboard pages", icon: LayoutPanelLeft, pluginId: "dashboard" },
  { id: "custom", label: "Custom Links", icon: LinkIcon },
  { id: "structure", label: "Structure", icon: HeadingIcon },
  { id: "categories", label: "Categories", icon: FolderIcon },
  { id: "tags", label: "Tags", icon: TagIcon },
];

/**
 * Left sidebar wrapper with accordion panels for adding items to a menu.
 * Contains: Pages, Posts, Dashboard pages, Custom Links, Structure, Categories, Tags.
 */
export function MenuAddItemsPanel({ menuId }: MenuAddItemsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(new Set(["pages"]));
  const { isEnabled } = usePluginSettings();

  const toggleSection = (sectionId: SectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const renderSection = (section: AccordionSection) => {
    switch (section.id) {
      case "custom":
        return <MenuAddCustomLinkPanel menuId={menuId} />;
      case "dashboard":
        return <MenuAddDashboardPanel menuId={menuId} />;
      case "structure":
        return <MenuAddStructurePanel menuId={menuId} />;
      case "pages":
        return <MenuAddContentPanel menuId={menuId} contentType="page" />;
      case "posts":
        return <MenuAddContentPanel menuId={menuId} contentType="post" />;
      case "categories":
        return <MenuAddContentPanel menuId={menuId} contentType="category" />;
      case "tags":
        return <MenuAddContentPanel menuId={menuId} contentType="tag" />;
    }
  };

  return (
    <div className="space-y-1">
      <h3 className="mb-3 text-xs font-semibold text-foreground">Add menu items</h3>

      {SECTIONS.filter((section) => !section.pluginId || isEnabled(section.pluginId)).map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const Icon = section.icon;

        return (
          <div key={section.id} className="border border-border bg-card">
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
              aria-expanded={isExpanded}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-3 text-muted-foreground" />
                {section.label}
              </span>
              <ChevronDownIcon className={cn("size-3 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
            </button>

            {isExpanded && <div className="border-t border-border px-3 pb-3 pt-2">{renderSection(section)}</div>}
          </div>
        );
      })}
    </div>
  );
}
