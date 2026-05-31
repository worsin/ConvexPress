/**
 * ConvexPress Forms — admin nav section (v2 Layer 4)
 *
 * The scanner at apps/web/src/lib/admin-shell/nav-config.ts globs every
 * nav.ts under apps/web/src/extensions(.local)/<id>/ and appends the
 * default export to ADMIN_NAV_SECTIONS. No registration step.
 *
 * `id` matches the manifest's navSectionIds[0] ("forms"); `pluginId` matches
 * the manifest's id ("forms") so the section auto-hides when the extension is
 * disabled.
 */

import { FileText } from "lucide-react";
import type { Capability } from "@backend/convex/types/capabilities";
import type { AdminNavSection } from "@/lib/admin-shell/types";

/**
 * Cast a `form.*` capability string to `Capability`. Mirrors the backend
 * helper in convex/extensions/forms/mutations.ts — the 7 form capabilities are
 * SURFACED by this extension but REGISTERED by the Role/Capability expert, so
 * they aren't in the closed `Capability` union yet. Once they're registered
 * these casts become no-ops and can be dropped.
 */
const formCap = (cap: string): Capability => cap as Capability;

/**
 * Form Analytics & Export System surfaces two per-form capabilities:
 *   - `form.view_analytics`  — gates /forms/$formId/analytics (per-form route).
 *   - `form.export_entries`  — gates the CSV export button on that page.
 * Because analytics is PER-FORM ($formId), it is NOT a static top-level nav
 * link; the entry point is an in-page link from the form's edit view (see
 * routes/.../forms/$formId/edit.tsx). We reference the caps here so they are
 * discoverable to the nav/cap layer without adding a dead static link.
 */
const ANALYTICS_CAPS = [
  formCap("form.view_analytics"),
  formCap("form.export_entries"),
] as const;
void ANALYTICS_CAPS;

const navSection: AdminNavSection = {
  id: "forms",
  label: "Forms",
  to: "/forms",
  icon: FileText,
  pluginId: "forms",
  capability: formCap("form.view"),
  children: [
    {
      id: "forms-all",
      label: "All Forms",
      to: "/forms",
      exact: true,
    },
    {
      id: "forms-new",
      label: "Add New",
      to: "/forms/new",
      isAddNew: true,
      capability: formCap("form.create"),
    },
    {
      id: "forms-settings",
      label: "Settings",
      to: "/forms/settings",
      capability: formCap("form.manage_security"),
    },
  ],
};

export default navSection;
