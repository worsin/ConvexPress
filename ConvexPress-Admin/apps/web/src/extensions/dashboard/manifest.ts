/**
 * Customer Dashboard — admin manifest (v2 Layer 4)
 *
 * The scanner at apps/web/src/lib/plugins/registry.ts globs this file and
 * appends it to ADMIN_PLUGINS. No registration step.
 *
 * The plugin flag `dashboardEnabled` (default true) lives in the "plugins"
 * settings section; the backend registry, menu queries, and website shell
 * all read the same flag.
 */

import { LayoutPanelLeft } from "lucide-react";
import type { AdminPluginDefinition } from "@/lib/plugins/registry";

const manifest: AdminPluginDefinition = {
  id: "dashboard",
  title: "Customer Dashboard",
  description:
    "The member area on the website: a widget home page, dashboard pages from every enabled plugin, and menu-driven navigation with badges and visibility rules.",
  icon: LayoutPanelLeft,
  settingsKey: "dashboardEnabled",
  navSectionIds: ["customer-dashboard"],
  adminAccessPrefixes: ["/customer-dashboard"],
  routePrefixes: ["/dashboard"],
  defaultEnabled: true,
};

export default manifest;
