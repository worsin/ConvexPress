import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAdminShell } from "@/hooks/layout/useAdminShell";
import { useActiveSection } from "@/hooks/layout/useActiveSection";
import { usePendingCommentCount } from "@/hooks/layout/usePendingCommentCount";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { ADMIN_NAV_SECTIONS } from "@/lib/admin-shell/nav-config";
import { filterNavSections } from "@/lib/admin-shell/capabilities";
import { useAuth } from "@/lib/auth-context";
import { NavSection } from "./NavSection";
import { Shield, X } from "lucide-react";

/**
 * Mobile sidebar overlay with backdrop.
 * Slides in from the left on mobile viewports.
 * Applies the same capability filtering as the desktop sidebar.
 */
export function MobileSidebarOverlay() {
  const {
    mobileSidebarOpen,
    closeMobileSidebar,
    expandedSections,
    toggleSection,
  } = useAdminShell();

  const { role } = useAuth();
  const activeSectionId = useActiveSection();
  const pendingCommentCount = usePendingCommentCount();
  const { isEnabled: isPluginEnabled } = usePluginSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  // Filter nav sections by user capabilities + plugin enablement (same as desktop sidebar)
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

    // Inject dynamic badge counts
    sections = sections.map((section) => {
      if (section.id === "comments" && pendingCommentCount > 0) {
        return { ...section, badge: pendingCommentCount };
      }
      return section;
    });

    return sections;
  }, [role, pendingCommentCount, isPluginEnabled]);

  // Close on Escape key
  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMobileSidebar();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileSidebarOpen, closeMobileSidebar]);

  // Focus trap: focus the panel when it opens, and trap Tab within it
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mobileSidebarOpen && panelRef.current) {
      // Remember what triggered the open so we can restore focus on close
      triggerRef.current = document.activeElement as HTMLElement | null;
      panelRef.current.focus();
    } else if (!mobileSidebarOpen && triggerRef.current) {
      // Restore focus to the trigger element (hamburger button)
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [mobileSidebarOpen]);

  // Full focus trap: cycle Tab through focusable elements within the panel
  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const handleTabTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if at first focusable, wrap to last
        if (document.activeElement === first || document.activeElement === panelRef.current) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if at last focusable, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTabTrap);
    return () => document.removeEventListener("keydown", handleTabTrap);
  }, [mobileSidebarOpen]);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSidebarOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 md:hidden",
          mobileSidebarOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border",
          "transform transition-transform duration-300 ease-in-out md:hidden",
          "flex flex-col outline-hidden",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between border-b border-sidebar-border px-3 h-12">
          <div className="flex items-center gap-2">
            <Shield className="size-5 shrink-0 text-sidebar-primary-foreground" />
            <span className="text-sm font-semibold text-sidebar-foreground">
              ConvexPress
            </span>
          </div>
          <button
            type="button"
            onClick={closeMobileSidebar}
            className="rounded-sm p-1 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            aria-label="Close navigation menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <ul role="list" className="space-y-0.5">
            {filteredSections.map((section) => (
              <NavSection
                key={section.id}
                section={section}
                collapsed={false}
                isExpanded={expandedSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
                isActive={activeSectionId === section.id}
              />
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
