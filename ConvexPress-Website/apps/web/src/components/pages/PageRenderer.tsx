/**
 * PageRenderer - renders a page through the `page` surface.
 *
 * The template dispatch (default / full-width / sidebar-left / sidebar-right /
 * no-sidebar / landing / blank) lives in the Core pack's `page` surface
 * (`templates/packs/core/surfaces/page.tsx`); the active template pack may
 * replace it. Kept as a component so routes outside the Pages system (help,
 * support) can render a page record without knowing about surfaces.
 */

import type { PageDetail } from "@/lib/blog/types";
import CorePage from "@/templates/packs/core/surfaces/page";
import { Surface } from "@/templates/sdk/Surface";

interface PageRendererProps {
  page: PageDetail;
  className?: string;
}

export function PageRenderer({ page, className }: PageRendererProps) {
  return <Surface name="page" data={{ page, className }} fallback={CorePage} />;
}
