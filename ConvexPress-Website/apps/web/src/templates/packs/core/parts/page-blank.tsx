import { PublicCanonicalBody } from "@/templates/sdk/block-public/PublicCanonicalBody";
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

import type { PageDetail } from "@/lib/blog/types";

interface BlankTemplateProps {
  page: PageDetail;
}

export function BlankTemplate({ page }: BlankTemplateProps) {
  return (
    <div data-slot="template-blank">
        <PublicCanonicalBody documentId={page._id} />
    </div>
  );
}
