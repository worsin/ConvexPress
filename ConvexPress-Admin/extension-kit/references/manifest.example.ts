/**
 * REFERENCE — Extension manifest (v2 Layer 4)
 *
 * Real path:
 *   Official:  apps/web/src/extensions/<id>/manifest.ts
 *   Local:     apps/web/src/extensions.local/<id>/manifest.ts
 *
 * What this reference demonstrates:
 *   1. The default export shape — AdminPluginDefinition
 *   2. settingsKey naming convention (<id>Enabled)
 *   3. navSectionIds must match the nav.ts section id (if nav.ts exists)
 *   4. adminAccessPrefixes / routePrefixes structure
 *   5. defaultEnabled optionally controls fresh-install state
 *
 * The scanner at apps/web/src/lib/plugins/registry.ts globs every
 * manifest.ts at this path and appends them to ADMIN_PLUGINS. No
 * registration step required — Vite's import.meta.glob handles it
 * at build time.
 */

import { Calendar } from "lucide-react";
import type { AdminPluginDefinition } from "@/lib/plugins/registry";

const manifest: AdminPluginDefinition = {
	// Unique camelCase id. Match the folder name and any references.
	id: "events",

	// Display on the /plugins toggle page.
	title: "Events",
	description:
		"Time-based event content with start/end and venue support.",
	icon: Calendar,

	// Plugin-settings key. Convention: `<id>Enabled`.
	settingsKey: "eventsEnabled",

	// Sidebar section ids that this extension controls.
	// MUST match the id of the corresponding AdminNavSection in nav.ts
	// (if you ship one). String equality is enforced for auto-hide.
	navSectionIds: ["events"],

	// Admin URL prefixes gated by this extension. The PluginGuard +
	// requirePluginEnabled helpers check these.
	adminAccessPrefixes: ["/events"],

	// Public Website URL prefixes (or [] if no public surface). The
	// Website-side design-kit picks up these prefixes when generating
	// templates for the extension.
	routePrefixes: ["/events"],

	// Whether the extension is enabled by default on a fresh install.
	// Defaults to false if omitted.
	defaultEnabled: false,
};

export default manifest;
