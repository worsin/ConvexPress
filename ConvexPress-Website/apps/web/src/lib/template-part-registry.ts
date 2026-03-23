/**
 * Template Part Registry
 *
 * Static import map that maps template part slug strings to React components.
 * Template parts are reusable layout sections: headers, footers, sidebars.
 *
 * Usage:
 *   const HeaderComponent = templatePartRegistry["header-default"];
 *   if (HeaderComponent) return <HeaderComponent {...props} />;
 */

import type { ComponentType } from "react";

import { DefaultHeader } from "@/template-parts/DefaultHeader";
import { MinimalHeader } from "@/template-parts/MinimalHeader";
import { CenteredHeader } from "@/template-parts/CenteredHeader";
import { DefaultFooter } from "@/template-parts/DefaultFooter";
import { MinimalFooter } from "@/template-parts/MinimalFooter";
import { ColumnsFooter } from "@/template-parts/ColumnsFooter";
import { DefaultSidebar } from "@/template-parts/DefaultSidebar";

/**
 * Template part component type.
 * Uses `any` because parts have varying props.
 * This is intentional - the registry stores heterogeneous components.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TemplatePartComponent = ComponentType<any>;

export const templatePartRegistry: Record<string, TemplatePartComponent> = {
  "header-default": DefaultHeader,
  "header-minimal": MinimalHeader,
  "header-centered": CenteredHeader,
  "footer-default": DefaultFooter,
  "footer-minimal": MinimalFooter,
  "footer-columns": ColumnsFooter,
  "sidebar-default": DefaultSidebar,
};

/**
 * Resolve a template part component by its slug.
 * Returns null if the slug is not found in the registry.
 */
export function resolveTemplatePart(slug: string): TemplatePartComponent | null {
  return templatePartRegistry[slug] ?? null;
}
