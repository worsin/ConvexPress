/**
 * Core · page — a page from the Pages system, laid out by its page template.
 *
 * Variants: default (right sidebar), sidebar-left, full-width, no-sidebar,
 * landing, blank. An explicit template variant wins; otherwise the page's own
 * `template` field decides (`sidebar-right` is an alias of default).
 */
import type { ComponentType } from "react";

import type { PageDetail } from "@/lib/blog/types";
import { BlankTemplate } from "@/templates/BlankTemplate";
import { DefaultTemplate } from "@/templates/DefaultTemplate";
import { FullWidthTemplate } from "@/templates/FullWidthTemplate";
import { LandingTemplate } from "@/templates/LandingTemplate";
import { NoSidebarPageTemplate } from "@/templates/NoSidebarPageTemplate";
import { SidebarLeftTemplate } from "@/templates/SidebarLeftTemplate";
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
