/**
 * Template Registry
 *
 * Static import map that maps componentKey strings from the Convex database
 * to actual React components. When a template is resolved for a content
 * context, a componentKey string is returned. This registry converts that
 * key to a renderable component.
 *
 * Usage:
 *   const Component = templateRegistry[componentKey];
 *   if (Component) return <Component {...props} />;
 */

import type { ComponentType } from "react";

import { IndexTemplate } from "@/templates/IndexTemplate";
import { HomeBlogTemplate } from "@/templates/HomeBlogTemplate";
import { SinglePostTemplate } from "@/templates/SinglePostTemplate";
import { DefaultTemplate } from "@/templates/DefaultTemplate";
import { FullWidthTemplate } from "@/templates/FullWidthTemplate";
import { SidebarLeftTemplate } from "@/templates/SidebarLeftTemplate";
import { LandingTemplate } from "@/templates/LandingTemplate";
import { BlankTemplate } from "@/templates/BlankTemplate";
import { ArchiveTemplate } from "@/templates/ArchiveTemplate";
import { SearchResultsTemplate } from "@/templates/SearchResultsTemplate";
import { NotFoundTemplate } from "@/templates/NotFoundTemplate";
import { NoSidebarPageTemplate } from "@/templates/NoSidebarPageTemplate";

/**
 * Template component type.
 * Uses `any` because templates have varying required props (page, children, sidebar).
 * This is intentional - the registry stores heterogeneous components.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TemplateComponent = ComponentType<any>;

export const templateRegistry: Record<string, TemplateComponent> = {
  // Core templates (short names)
  IndexTemplate,
  HomeBlogTemplate,
  SinglePostTemplate,
  DefaultTemplate,
  FullWidthTemplate,
  SidebarLeftTemplate,
  LandingTemplate,
  BlankTemplate,
  ArchiveTemplate,
  SearchResultsTemplate,
  NotFoundTemplate,
  NoSidebarPageTemplate,

  // Aliases matching internals.ts default template componentKeys
  // These ensure the database-stored componentKey strings resolve correctly
  DefaultPageTemplate: DefaultTemplate,
  FullWidthPageTemplate: FullWidthTemplate,
  LandingPageTemplate: LandingTemplate,
};

/**
 * Resolve a template component by its componentKey.
 * Falls back to IndexTemplate if the key is not found.
 */
export function resolveTemplate(componentKey: string): TemplateComponent {
  return templateRegistry[componentKey] ?? IndexTemplate;
}
