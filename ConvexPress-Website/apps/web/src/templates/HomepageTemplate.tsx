import { PageContent } from "@/components/blog/PageContent";
import { PageSectionStack } from "@/components/pages/PageSectionStack";
import { cn } from "@/lib/utils";
import type { PageDetail } from "@/lib/blog/types";

interface HomepageTemplateProps {
  page: PageDetail;
  className?: string;
}

export function HomepageTemplate({ page, className }: HomepageTemplateProps) {
  return (
    <div
      data-slot="template-homepage"
      className={cn("mx-auto w-full max-w-[var(--cp-shell-max-width)] space-y-6", className)}
    >
      {page.contentMode === "blocks" && page.blocks && page.blocks.length > 0 ? (
        <main className="overflow-hidden rounded-[2.25rem] border border-[color:var(--cp-border-soft)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_55%,white_45%),var(--sh-color-surface))] px-5 py-6 shadow-[var(--cp-shadow-soft)] md:px-8 md:py-10 lg:px-12">
          <PageContent page={page} className="mx-auto max-w-[var(--cp-content-max-width)]" />
        </main>
      ) : page.pageSections && page.pageSections.length > 0 ? (
        <PageSectionStack sections={page.pageSections} />
      ) : (
        <main className="overflow-hidden rounded-[2.25rem] border border-[color:var(--cp-border-soft)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_55%,white_45%),var(--sh-color-surface))] px-5 py-6 shadow-[var(--cp-shadow-soft)] md:px-8 md:py-10 lg:px-12">
          <PageContent page={page} className="mx-auto max-w-[var(--cp-content-max-width)]" />
        </main>
      )}
    </div>
  );
}
