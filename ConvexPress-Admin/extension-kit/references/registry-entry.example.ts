/**
 * REFERENCE — Plugin registry entry (Layer 5)
 *
 * This file is NOT a standalone file you write. It shows the DIFF you
 * need to apply to apps/web/src/lib/plugins/registry.ts when adding
 * a new extension.
 *
 * Real path:
 *   apps/web/src/lib/plugins/registry.ts (you MODIFY in place — never replace)
 *
 * What this reference demonstrates:
 *   1. Adding "events" to AdminPluginId union (string literal)
 *   2. Adding eventsEnabled to PluginSettingsValues interface
 *   3. Pushing the new AdminPluginDefinition onto ADMIN_PLUGINS
 *   4. Adding eventsEnabled to DEFAULT_PLUGIN_SETTINGS
 *   5. Optional PLUGIN_PARENT entry if this extension depends on another
 *
 * Substitute "events" / "Events" / "Calendar" with your extension's
 * id / title / icon.
 */

// ─── Diff 1: AdminPluginId union ─────────────────────────────────────────────
// Locate the existing union and add your extension's id as a new
// string literal.

export type AdminPluginId =
	| "commerce"
	| "commerceDigital"
	| "commerceReviews"
	| "commerceWishlists"
	| "commerceBundles"
	| "commerceReturns"
	| "commerceSubscriptions"
	| "membership"
	| "knowledgeBase"
	| "tickets"
	| "customFields"
	| "recipes"
	| "gallery"
	| "events";          // ← NEW

// ─── Diff 2: PluginSettingsValues interface ──────────────────────────────────
// Add `<id>Enabled: boolean` alongside the existing keys.

export interface PluginSettingsValues {
	commerceEnabled: boolean;
	commerceDigitalEnabled: boolean;
	// ... rest of existing keys ...
	eventsEnabled: boolean;  // ← NEW
}

// ─── Diff 3: ADMIN_PLUGINS array — push the new entry ────────────────────────
// Append to the existing array. Don't reformat existing entries.

// (Sketched — the real array has all existing entries above this one)
const EXAMPLE_NEW_ENTRY = {
	id: "events" as const,
	title: "Events",
	description:
		"Time-based event content with start/end and venue support.",
	// icon: Calendar,  // Import from lucide-react at the top of the file
	settingsKey: "eventsEnabled" as const,

	// navSectionIds MUST match the id of the nav section in nav-config.ts
	// that you'll add in Layer 6. String equality is enforced.
	navSectionIds: ["events"],

	// Admin URL prefixes the gating helpers check. Whatever URL your
	// admin routes live at, list it here. The gating wraps every
	// admin route under these prefixes.
	adminAccessPrefixes: ["/events"],

	// Public URL prefixes. Set only if the extension exposes Website
	// routes (e.g., /events for the public archive). Use [] if not.
	routePrefixes: ["/events"],
};

// ─── Diff 4: DEFAULT_PLUGIN_SETTINGS ─────────────────────────────────────────
// Add the default-enabled state. Most extensions default to false.

export const DEFAULT_PLUGIN_SETTINGS: PluginSettingsValues = {
	commerceEnabled: false,
	commerceDigitalEnabled: false,
	// ... rest of existing defaults ...
	eventsEnabled: false,  // ← NEW
};

// ─── Diff 5: PLUGIN_PARENT (optional) ────────────────────────────────────────
// If your extension depends on another being enabled (e.g., the way
// commerceReviews depends on commerce), add an entry here.

export const PLUGIN_PARENT: Partial<Record<AdminPluginId, AdminPluginId>> = {
	commerceDigital: "commerce",
	commerceReviews: "commerce",
	commerceWishlists: "commerce",
	commerceBundles: "commerce",
	commerceReturns: "commerce",
	commerceSubscriptions: "commerce",
	// events: undefined — no parent, omit the line.
};

/**
 * ─── Nav config entry (Layer 6) ──────────────────────────────────────────────
 *
 * Separately, in apps/web/src/lib/admin-shell/nav-config.ts, add:
 *
 *   import { Calendar } from "lucide-react";
 *
 *   // Inside ADMIN_NAV_SECTIONS:
 *   {
 *     id: "events",                              // MUST match navSectionIds[0]
 *     label: "Events",
 *     to: "/events",
 *     icon: Calendar,
 *     capability: "event.view_unpublished",      // highest cap among children
 *     pluginId: "events",                        // MANDATORY for auto-hide
 *     children: [
 *       { id: "events-all", label: "All Events", to: "/events", exact: true },
 *       { id: "events-new", label: "Add New", to: "/events/new", isAddNew: true },
 *       { id: "events-settings", label: "Settings", to: "/events/settings" },
 *     ],
 *   },
 *
 * After both diffs land:
 *   1. bun --filter web check-types  (must exit 0)
 *   2. Browse to /plugins, confirm "Events" toggle exists
 *   3. Toggle off, confirm nav section disappears
 *   4. Toggle on, confirm nav appears + /events route loads
 *   5. Surface the new capabilities in the generation report so the
 *      Role & Capability expert adds them to the central registry
 */
