/**
 * No Sidebar Page Template
 *
 * Renders page content without any sidebar at a comfortable reading width.
 * Unlike FullWidthTemplate which constrains to max-w-3xl, this template
 * uses the theme's configured content size and includes breadcrumbs.
 */

import { cn } from "@/lib/utils";
import { PageContent } from "@/components/blog/PageContent";
import { PageBreadcrumbs } from "@/components/pages/PageBreadcrumbs";
import { PageChildrenList } from "@/components/pages/PageChildrenList";
import type { PageDetail } from "@/lib/blog/types";

interface NoSidebarPageTemplateProps {
  page: PageDetail;
  className?: string;
}

export function NoSidebarPageTemplate({ page, className }: NoSidebarPageTemplateProps) {
  return (
    <div
      data-slot="template-no-sidebar"
      className={cn("mx-auto px-4", className)}
      style={{ maxWidth: "var(--sh-layout-content, 720px)" }}
    >
      {/* Breadcrumbs */}
      {page.breadcrumbs && page.breadcrumbs.length > 1 && (
        <PageBreadcrumbs
          breadcrumbs={page.breadcrumbs}
          currentTitle={page.title}
          className="mb-6"
        />
      )}

      {/* Main content - no sidebar */}
      <main>
        <PageContent page={page} />
      </main>

      {/* Child pages below content */}
      {page.children && page.children.length > 0 && (
        <PageChildrenList children={page.children} className="mt-8" />
      )}
    </div>
  );
}
