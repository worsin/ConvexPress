import { useEffect, useMemo } from "react";
import { useAdminShell } from "@/hooks/layout/useAdminShell";
import { useActiveSection } from "@/hooks/layout/useActiveSection";
import { usePendingCommentCount } from "@/hooks/layout/usePendingCommentCount";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { ADMIN_NAV_SECTIONS } from "@/lib/admin-shell/nav-config";
import { filterNavSections } from "@/lib/admin-shell/capabilities";
import { useAuth } from "@/lib/auth-context";
import { SidebarChrome } from "@/components/shell/SidebarChrome";
import { NavSection } from "./NavSection";

/**
 * Site navigation sidebar. Chrome (brand, site switcher, operator footer) is
 * shared with the standalone frame; this component only contributes the
 * capability-filtered navigation body.
 */
export function AdminSidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    expandedSections,
    toggleSection,
    expandSection,
  } = useAdminShell();

  const { role } = useAuth();
  const activeSectionId = useActiveSection();
  const pendingCommentCount = usePendingCommentCount();
  const { isEnabled: isPluginEnabled } = usePluginSettings();

  // Filter nav sections by user capabilities + plugin enablement
  const filteredSections = useMemo(() => {
    const capabilities = role?.capabilities ?? [];
    let sections = filterNavSections(ADMIN_NAV_SECTIONS, capabilities);

    sections = sections.filter(
      (section) => !section.pluginId || isPluginEnabled(section.pluginId),
    );

    sections = sections.map((section) =>
      section.children
        ? {
            ...section,
            children: section.children.filter(
              (child) => !child.pluginId || isPluginEnabled(child.pluginId),
            ),
          }
        : section,
    );

    sections = sections.map((section) => {
      if (section.id === "comments" && pendingCommentCount > 0) {
        return { ...section, badge: pendingCommentCount };
      }
      return section;
    });

    return sections;
  }, [role, pendingCommentCount, isPluginEnabled]);

  // Auto-expand the active section on mount and route changes
  useEffect(() => {
    if (activeSectionId) {
      expandSection(activeSectionId);
    }
  }, [activeSectionId, expandSection]);

  return (
    <SidebarChrome
      ariaLabel="Admin navigation"
      collapsed={sidebarCollapsed}
      onToggleCollapse={toggleSidebar}
      siteRoleName={role?.name ?? null}
      className="hidden md:flex"
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-1">
        <ul role="list" className="space-y-0.5">
          {filteredSections.map((section) => (
            <NavSection
              key={section.id}
              section={section}
              collapsed={sidebarCollapsed}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              isActive={activeSectionId === section.id}
            />
          ))}
        </ul>
      </div>
    </SidebarChrome>
  );
}
