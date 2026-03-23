/**
 * DefaultTemplate - Standard page layout with right sidebar
 *
 * The default template for pages. Shows the page content in a
 * two-column layout with a sidebar on the right for child pages,
 * navigation, or widget areas.
 */

import { cn } from "@/lib/utils";
import { PageContent } from "@/components/blog/PageContent";
import { PageBreadcrumbs } from "@/components/pages/PageBreadcrumbs";
import { PageChildrenList } from "@/components/pages/PageChildrenList";
import type { PageDetail } from "@/lib/blog/types";

interface DefaultTemplateProps {
  page: PageDetail;
  className?: string;
}

export function DefaultTemplate({ page, className }: DefaultTemplateProps) {
  return (
    <div
      data-slot="template-default"
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

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        {/* Main content */}
        <main>
          <PageContent page={page} />
        </main>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Child pages in sidebar */}
          {page.children && page.children.length > 0 && (
            <PageChildrenList children={page.children} />
          )}
        </aside>
      </div>
    </div>
  );
}
