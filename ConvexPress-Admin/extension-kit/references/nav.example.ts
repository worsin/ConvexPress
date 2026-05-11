/**
 * REFERENCE — Extension nav section (v2 Layer 4, optional)
 *
 * Real path:
 *   Official:  apps/web/src/extensions/<id>/nav.ts
 *   Local:     apps/web/src/extensions.local/<id>/nav.ts
 *
 * Default-export an AdminNavSection if the extension should appear in
 * the admin sidebar. Omit this file entirely if the extension has no
 * sidebar presence (rare; only for "plugin-only" backends).
 *
 * The scanner at apps/web/src/lib/admin-shell/nav-config.ts globs
 * every nav.ts at this path and appends them to ADMIN_NAV_SECTIONS.
 *
 * What this reference demonstrates:
 *   1. The default export shape — AdminNavSection
 *   2. id must match the manifest's navSectionIds[0]
 *   3. pluginId is MANDATORY for auto-hide behavior
 *   4. capability gates the section based on user roles
 *   5. Standard child structure (list / Add New / settings)
 */

import { Calendar } from "lucide-react";
import type { AdminNavSection } from "@/lib/admin-shell/types";

const navSection: AdminNavSection = {
	// MUST match the manifest's navSectionIds[0]. String-equality
	// enforced by the auto-hide helper.
	id: "events",

	label: "Events",
	to: "/events",
	icon: Calendar,

	// Plugin id this section belongs to. MANDATORY for auto-hide —
	// without it, the section appears even when the extension is
	// disabled. Must match the manifest's id field exactly.
	pluginId: "events",

	// The highest required capability among the section's children. The
	// nav filter ANDs this with the user's caps — missing the cap hides
	// the section entirely from that user.
	capability: "event.view_unpublished",

	children: [
		{
			id: "events-all",
			label: "All Events",
			to: "/events",
			exact: true,
		},
		{
			id: "events-new",
			label: "Add New",
			to: "/events/new",
			isAddNew: true,
			capability: "event.create",
		},
		{
			id: "events-settings",
			label: "Settings",
			to: "/events/settings",
			capability: "event.manage_settings",
		},
	],
};

export default navSection;
