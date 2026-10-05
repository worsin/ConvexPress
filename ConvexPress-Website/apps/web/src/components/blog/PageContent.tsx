import { PublicCanonicalBody } from "@/templates/sdk/block-public/PublicCanonicalBody";
import { cn } from "@/lib/utils";
import type { PageDetail } from "@/lib/blog/types";


interface PageContentProps {
  page: PageDetail;
  className?: string;
}

/**
 * Single page content renderer. Displays page title and block content.
 */
export function PageContent({ page, className }: PageContentProps) {
  return (
    <article
      data-slot="page-content"
      className={cn("flex flex-col gap-6", className)}
    >
      {/* Featured Image */}
      {page.featuredImageUrl && (
        <figure className="-mx-4 md:-mx-6 lg:-mx-8">
          <img
            src={page.featuredImageUrl}
            alt={page.featuredImageAlt ?? page.title}
            className="aspect-video w-full object-cover"
            loading="eager"
          />
        </figure>
      )}

      {/* Content */}
        <PublicCanonicalBody documentId={page._id} renderLayout={(body, hasHero) => <>
          {!hasHero && <h1 className="text-lg font-bold leading-tight md:text-xl">{page.title}</h1>}
          {body}
        </>} />
    </article>
  );
}
