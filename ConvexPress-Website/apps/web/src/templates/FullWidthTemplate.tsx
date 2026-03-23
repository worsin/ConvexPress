/**
 * FullWidthTemplate - Full-width layout without sidebar
 *
 * Renders the page content at full width with no sidebar.
 * Good for content-heavy pages where maximum reading width is desired.
 */

import { cn } from "@/lib/utils";
import { PageContent } from "@/components/blog/PageContent";
import { PageBreadcrumbs } from "@/components/pages/PageBreadcrumbs";
import { PageChildrenList } from "@/components/pages/PageChildrenList";
import type { PageDetail } from "@/lib/blog/types";

interface FullWidthTemplateProps {
  page: PageDetail;
  className?: string;
}

export function FullWidthTemplate({ page, className }: FullWidthTemplateProps) {
  return (
    <div
      data-slot="template-full-width"
      className={cn("mx-auto max-w-3xl px-4", className)}
    >
      {/* Breadcrumbs */}
      {page.breadcrumbs && page.breadcrumbs.length > 1 && (
        <PageBreadcrumbs
          breadcrumbs={page.breadcrumbs}
          currentTitle={page.title}
          className="mb-6"
        />
      )}

      {/* Full-width content */}
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
