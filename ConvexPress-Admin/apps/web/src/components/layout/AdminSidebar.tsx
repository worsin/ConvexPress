import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAdminShell } from "@/hooks/layout/useAdminShell";
import { useActiveSection } from "@/hooks/layout/useActiveSection";
import { usePendingCommentCount } from "@/hooks/layout/usePendingCommentCount";
import { ADMIN_NAV_SECTIONS } from "@/lib/admin-shell/nav-config";
import { filterNavSections } from "@/lib/admin-shell/capabilities";
import { SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_TRANSITION_MS } from "@/lib/admin-shell/constants";
import { useAuth } from "@/lib/auth-context";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarFooter } from "./SidebarFooter";
import { NavSection } from "./NavSection";

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

  // Filter nav sections by user capabilities
  const filteredSections = useMemo(() => {
    // Get capabilities from the role, or use admin-level fallback
    const capabilities = role?.capabilities ?? [];

    // Filter sections by capabilities
    let sections = filterNavSections(ADMIN_NAV_SECTIONS, capabilities);

    // Inject dynamic badge counts
    sections = sections.map((section) => {
      if (section.id === "comments" && pendingCommentCount > 0) {
        return { ...section, badge: pendingCommentCount };
      }
      return section;
    });

    return sections;
  }, [role, pendingCommentCount]);

  // Auto-expand the active section on mount and route changes
  useEffect(() => {
    if (activeSectionId) {
      expandSection(activeSectionId);
    }
  }, [activeSectionId, expandSection]);

  return (
    <nav
      aria-label="Admin navigation"
      className={cn(
        "hidden md:flex flex-col bg-sidebar border-r border-sidebar-border",
        "transition-[width] ease-in-out shrink-0",
      )}
      style={{
        width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
        transitionDuration: `${SIDEBAR_TRANSITION_MS}ms`,
      }}
    >
      {/* Header */}
      <SidebarHeader collapsed={sidebarCollapsed} />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2">
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

      {/* Footer with collapse toggle */}
      <SidebarFooter collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
    </nav>
  );
}
