/**
 * Core · page — a page from the Pages system, laid out by its page template.
 *
 * Variants: default (right sidebar), sidebar-left, full-width, no-sidebar,
 * landing, blank. An explicit template variant wins; otherwise the page's own
 * `template` field decides (`sidebar-right` is an alias of default).
 */
import type { ComponentType } from "react";

import type { PageDetail } from "@/lib/blog/types";
import { BlankTemplate } from "@/templates/packs/core/parts/page-blank";
import { DefaultTemplate } from "@/templates/packs/core/parts/page-default";
import { FullWidthTemplate } from "@/templates/packs/core/parts/page-full-width";
import { LandingTemplate } from "@/templates/packs/core/parts/page-landing";
import { NoSidebarPageTemplate } from "@/templates/packs/core/parts/page-no-sidebar";
import { SidebarLeftTemplate } from "@/templates/packs/core/parts/page-sidebar-left";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface PageSurfaceData {
  page: PageDetail;
  className?: string;
}

type PageTemplateComponent = ComponentType<{ page: PageDetail; className?: string }>;

const PAGE_TEMPLATES: Record<string, PageTemplateComponent> = {
  default: DefaultTemplate,
  "sidebar-right": DefaultTemplate,
  "sidebar-left": SidebarLeftTemplate,
  "full-width": FullWidthTemplate,
  "no-sidebar": NoSidebarPageTemplate,
  landing: LandingTemplate,
  blank: BlankTemplate,
};

export default function CorePage({ data, variant }: SurfaceProps<PageSurfaceData>) {
  const id = variant && variant in PAGE_TEMPLATES ? variant : (data.page.template ?? "default");
  const Template = PAGE_TEMPLATES[id] ?? DefaultTemplate;
  return <Template page={data.page} className={data.className} />;
}
