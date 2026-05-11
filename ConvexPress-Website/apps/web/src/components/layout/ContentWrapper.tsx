import { cn } from "@/lib/utils";
import { MAX_WIDTH_MAP } from "@/lib/layout/constants";
import type { LayoutConfig } from "@/lib/layout/types";

import { Breadcrumbs } from "./Breadcrumbs";

interface ContentWrapperProps {
  layoutConfig?: LayoutConfig;
  children: React.ReactNode;
  showBreadcrumbs?: boolean;
}

/**
 * Wrapper around the Outlet that provides max-width, padding, and responsive breakpoints.
 */
export function ContentWrapper({
  layoutConfig,
  children,
  showBreadcrumbs = true,
}: ContentWrapperProps) {
  const maxWidth = layoutConfig?.contentMaxWidth ?? "lg";

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

      <main id="main-content" role="main">
        {children}
      </main>
    </div>
  );
}
