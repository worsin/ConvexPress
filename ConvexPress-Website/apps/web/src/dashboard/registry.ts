/**
 * Module registry — discovers page and widget modules with `import.meta.glob`
 * (same mechanism as blocks). Official modules live in ./pages and ./widgets;
 * site-specific modules live in ./pages.local and ./widgets.local (gitignored
 * via the `*.local` rule, like blocks.local).
 *
 * Ids are folder names and MUST match the backend registry
 * (ConvexPress-Admin/.../extensions/dashboard/registry.ts). See contracts.ts.
 */

import type { DashboardPageModule, DashboardWidgetModule } from "./contracts";
import { scanModules, type ScannedModule } from "./registry-core";

const OFFICIAL_PAGES = import.meta.glob<{ default?: DashboardPageModule }>("./pages/*/manifest.tsx", {
  eager: true,
});
const LOCAL_PAGES = import.meta.glob<{ default?: DashboardPageModule }>("./pages.local/*/manifest.tsx", {
  eager: true,
});
const OFFICIAL_WIDGETS = import.meta.glob<{ default?: DashboardWidgetModule }>("./widgets/*/manifest.tsx", {
  eager: true,
});
const LOCAL_WIDGETS = import.meta.glob<{ default?: DashboardWidgetModule }>("./widgets.local/*/manifest.tsx", {
  eager: true,
});

const pageScan = scanModules<DashboardPageModule>(OFFICIAL_PAGES, LOCAL_PAGES);
const widgetScan = scanModules<DashboardWidgetModule>(OFFICIAL_WIDGETS, LOCAL_WIDGETS);

if (import.meta.env.DEV) {
  for (const warning of [...pageScan.warnings, ...widgetScan.warnings]) {
    console.warn(`[dashboard registry] ${warning}`);
  }
}

export const PAGE_MODULES: ReadonlyMap<string, ScannedModule<DashboardPageModule>> = pageScan.modules;
export const WIDGET_MODULES: ReadonlyMap<string, ScannedModule<DashboardWidgetModule>> = widgetScan.modules;

export function getPageModule(id: string): DashboardPageModule | undefined {
  return PAGE_MODULES.get(id)?.module;
}

export function getWidgetModule(id: string): DashboardWidgetModule | undefined {
  return WIDGET_MODULES.get(id)?.module;
}

export function listPageModuleIds(): string[] {
  return [...PAGE_MODULES.keys()];
}

export function listWidgetModuleIds(): string[] {
  return [...WIDGET_MODULES.keys()];
}
