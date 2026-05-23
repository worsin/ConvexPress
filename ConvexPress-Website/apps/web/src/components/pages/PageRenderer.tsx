/**
 * PageRenderer - Template dispatcher for pages
 *
 * Selects the correct template component based on the page's
 * `template` (or `pageTemplate`) field and renders it.
 *
 * Template mapping:
 *   "default"       -> DefaultTemplate (two-column with right sidebar)
 *   "full-width"    -> FullWidthTemplate (single column, max-w-3xl)
 *   "sidebar-left"  -> SidebarLeftTemplate (two-column with left sidebar)
 *   "sidebar-right" -> DefaultTemplate (alias, same as default)
 *   "landing"       -> LandingTemplate (clean, no nav elements)
 *   "blank"         -> BlankTemplate (raw content, no wrappers)
 *
 * Falls back to DefaultTemplate if the template field is missing
 * or unrecognized.
 */

import type { PageDetail } from "@/lib/blog/types";
import { DefaultTemplate } from "@/templates/DefaultTemplate";
import { FullWidthTemplate } from "@/templates/FullWidthTemplate";
import { SidebarLeftTemplate } from "@/templates/SidebarLeftTemplate";
import { LandingTemplate } from "@/templates/LandingTemplate";
import { BlankTemplate } from "@/templates/BlankTemplate";
import { NoSidebarPageTemplate } from "@/templates/NoSidebarPageTemplate";

interface PageRendererProps {
  page: PageDetail;
  className?: string;
}

export function PageRenderer({ page, className }: PageRendererProps) {
  const template = page.template ?? "default";

  switch (template) {
    case "full-width":
      return <FullWidthTemplate page={page} className={className} />;

    case "sidebar-left":
      return <SidebarLeftTemplate page={page} className={className} />;

    case "sidebar-right":
      // sidebar-right is the same layout as default (right sidebar)
      return <DefaultTemplate page={page} className={className} />;

    case "no-sidebar":
      return <NoSidebarPageTemplate page={page} className={className} />;

    case "landing":
      return <LandingTemplate page={page} className={className} />;

    case "blank":
      return <BlankTemplate page={page} />;

    case "default":
    default:
      return <DefaultTemplate page={page} className={className} />;
  }
}
