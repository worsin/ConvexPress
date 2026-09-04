/**
 * Customer Dashboard — admin nav section (v2 Layer 4)
 *
 * The scanner at apps/web/src/lib/admin-shell/nav-config.ts globs every
 * nav.ts under apps/web/src/extensions(.local)/<id>/ and appends the default
 * export to ADMIN_NAV_SECTIONS.
 *
 * `id` matches the manifest's navSectionIds[0] ("customer-dashboard");
 * `pluginId` matches the manifest's id ("dashboard") so the section
 * auto-hides when the extension is disabled.
 */

import { LayoutPanelLeft } from "lucide-react";
import type { AdminNavSection } from "@/lib/admin-shell/types";

const navSection: AdminNavSection = {
  id: "customer-dashboard",
  label: "Customer dashboard",
  to: "/customer-dashboard",
  icon: LayoutPanelLeft,
  pluginId: "dashboard",
  capability: "manage_options",
  children: [
    {
      id: "customer-dashboard-settings",
      label: "Settings",
      to: "/customer-dashboard",
      exact: true,
    },
    {
      id: "customer-dashboard-layouts",
      label: "Home layouts",
      to: "/customer-dashboard/layouts",
    },
    {
      id: "customer-dashboard-menus",
      label: "Menus",
      to: "/menus",
      capability: "menu.update",
    },
  ],
};

export default navSection;
