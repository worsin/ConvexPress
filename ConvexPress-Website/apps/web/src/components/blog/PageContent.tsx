import { cn } from "@/lib/utils";
import type { PageDetail } from "@/lib/blog/types";
import { BlockListRenderer } from "@/components/blocks/BlockListRenderer";
import { pageSectionsToBlocks } from "@/lib/blocks/page-sections";

import { BlockContentRenderer } from "./BlockContentRenderer";

interface PageContentProps {
  page: PageDetail;
  className?: string;
}

/**
 * Single page content renderer. Displays page title and block content.
 */
const HERO_BLOCKS = new Set([
  "core/hero",
  "core/hero-split",
  "core/hero-text-only",
  "blocks/page-banner",
]);

function opensWithHero(page: PageDetail): boolean {
  if (page.contentMode !== "blocks") return false;
  const first = page.blocks?.[0];
  return !!first && HERO_BLOCKS.has(first.name);
}

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

      {/* Title — omitted when the page opens with a hero/banner block, which carries its own headline. */}
      {!opensWithHero(page) && (
        <h1 className="text-lg font-bold leading-tight md:text-xl">{page.title}</h1>
      )}

      {/* Content */}
      {page.contentMode === "blocks" ? (
        <BlockListRenderer
          blocks={
            page.blocks && page.blocks.length > 0
              ? page.blocks
              : pageSectionsToBlocks(page.pageSections)
          }
        />
      ) : page.content ? (
        <BlockContentRenderer content={page.content} />
      ) : (
        <div className="py-8 text-center">
          <p className="text-xs text-muted-foreground">
            This page has no content yet.
          </p>
        </div>
      )}
    </article>
  );
}
