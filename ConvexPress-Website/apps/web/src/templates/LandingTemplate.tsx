/**
 * LandingTemplate - Clean layout for landing pages
 *
 * No sidebar, no breadcrumbs, no child page navigation.
 * Designed for focused landing pages where the content
 * should stand alone without navigation distractions.
 *
 * The header/footer visibility is controlled by the layout,
 * not this template. This template just renders the content
 * in a clean, centered container.
 */

import { cn } from "@/lib/utils";
import { PageContent } from "@/components/blog/PageContent";
import type { PageDetail } from "@/lib/blog/types";

interface LandingTemplateProps {
  page: PageDetail;
  className?: string;
}

export function LandingTemplate({ page, className }: LandingTemplateProps) {
  return (
    <div
      data-slot="template-landing"
      className={cn("mx-auto max-w-4xl px-4", className)}
    >
      <main>
        <PageContent page={page} />
      </main>
    </div>
  );
}
