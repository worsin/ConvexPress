import { cn } from "@/lib/utils";
import { MAX_WIDTH_MAP } from "@/lib/layout/constants";
import type { LayoutConfig } from "@/lib/layout/types";

import { Breadcrumbs } from "./Breadcrumbs";
import { Sidebar } from "./Sidebar";

interface ContentWrapperProps {
  layoutConfig?: LayoutConfig;
  children: React.ReactNode;
  showSidebar?: boolean;
  showBreadcrumbs?: boolean;
}

/**
 * Wrapper around the Outlet that provides max-width, padding, responsive breakpoints,
 * and optional sidebar.
 */
export function ContentWrapper({
  layoutConfig,
  children,
  showSidebar,
  showBreadcrumbs = true,
}: ContentWrapperProps) {
  const maxWidth = layoutConfig?.contentMaxWidth ?? "lg";
  const sidebarPosition = layoutConfig?.sidebarPosition ?? "none";
  const sidebarWidgetArea = layoutConfig?.sidebarWidgetArea ?? "sidebar-1";
  const hasSidebar = showSidebar !== false && sidebarPosition !== "none";

  return (
    <div
      data-slot="content-wrapper"
      className={cn(
        "mx-auto w-full px-4 py-6 md:px-6 lg:px-8 lg:py-8",
        MAX_WIDTH_MAP[maxWidth],
      )}
    >
      {/* Breadcrumbs */}
      {showBreadcrumbs && <Breadcrumbs className="mb-4" />}

      {/* Content + optional sidebar */}
      {hasSidebar ? (
        <div
          className={cn(
            "flex gap-8",
            sidebarPosition === "left" && "flex-row-reverse",
          )}
        >
          <main id="main-content" role="main" className="min-w-0 flex-1">
            {children}
          </main>
          <Sidebar
            widgetAreaSlug={sidebarWidgetArea}
            position={sidebarPosition}
          />
        </div>
      ) : (
        <main id="main-content" role="main">
          {children}
        </main>
      )}
    </div>
  );
}
