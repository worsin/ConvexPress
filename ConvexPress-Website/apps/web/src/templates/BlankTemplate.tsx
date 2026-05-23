/**
 * BlankTemplate - Completely blank canvas
 *
 * Only renders the raw content with no wrapper styling,
 * no breadcrumbs, no sidebar, no child navigation.
 * The content is rendered full-width with no max-width constraint.
 *
 * Use this for pages that need complete control over their layout
 * via the block editor content itself.
 */

import { BlockContentRenderer } from "@/components/blog/BlockContentRenderer";
import { BlockListRenderer } from "@/components/blocks/BlockListRenderer";
import { pageSectionsToBlocks } from "@/lib/blocks/page-sections";
import type { PageDetail } from "@/lib/blog/types";

interface BlankTemplateProps {
  page: PageDetail;
}

export function BlankTemplate({ page }: BlankTemplateProps) {
  return (
    <div data-slot="template-blank">
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
    </div>
  );
}
