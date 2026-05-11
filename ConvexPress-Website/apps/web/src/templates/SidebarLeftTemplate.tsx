/**
 * SidebarLeftTemplate - Content with left sidebar
 *
 * Two-column layout with the sidebar on the left side.
 * Sidebar contains child page navigation and widget areas.
 */

import { cn } from "@/lib/utils";
import { PageContent } from "@/components/blog/PageContent";
import { PageBreadcrumbs } from "@/components/pages/PageBreadcrumbs";
import { PageChildrenList } from "@/components/pages/PageChildrenList";
import type { PageDetail } from "@/lib/blog/types";

interface SidebarLeftTemplateProps {
  page: PageDetail;
  className?: string;
}

export function SidebarLeftTemplate({ page, className }: SidebarLeftTemplateProps) {
  return (
    <div
      data-slot="template-sidebar-left"
      className={cn("mx-auto max-w-5xl px-4", className)}
    >
      {/* Breadcrumbs */}
      {page.breadcrumbs && page.breadcrumbs.length > 1 && (
        <PageBreadcrumbs
          breadcrumbs={page.breadcrumbs}
          currentTitle={page.title}
          className="mb-6"
        />
      )}

      {/* Two-column layout: sidebar left, content right */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
        {/* Sidebar (left) */}
        <aside className="space-y-6">
          {page.children && page.children.length > 0 && (
            <PageChildrenList children={page.children} />
          )}
        </aside>

        {/* Main content (right) */}
        <main>
          <PageContent page={page} />
        </main>
      </div>
    </div>
  );
}
