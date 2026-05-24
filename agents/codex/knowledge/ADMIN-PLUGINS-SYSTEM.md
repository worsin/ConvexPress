# Admin Plugins System

The admin plugin system is a lightweight feature-module switchboard, not a marketplace.

## Intent

- Installed code may exist locally in the product bundle.
- The Plugins screen controls whether that functionality is exposed in the admin.
- Disabling a plugin hides its navigation and blocks its admin routes.

## First Plugins

- `knowledgeBase`
  - routes: `/kb`
  - nav section: `kb`
- `tickets`
  - routes: `/tickets`, `/support`
  - nav section: `tickets`

## Current Architecture

1. Registry
   - `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
   - Defines plugin IDs, labels, route prefixes, and the settings key used for enablement.

2. Persistence
   - Plugin state is stored in the shared settings system under section `plugins`.
   - Backend defaults/validators/schema are extended rather than creating a separate table.

3. Navigation
   - Sidebar visibility is filtered by both capability and plugin state.
   - KB and Tickets are hidden when disabled.

4. Route gating
   - Layout routes use `PluginGuard` so disabled plugins are not reachable by URL.

5. Management UI
   - `/plugins` is the lightweight plugin management screen.
   - It enables/disables installed modules rather than downloading packages.

## Adding A New Plugin

1. Build the feature normally in its own route/domain area.
2. Add a new entry to `registry.ts`.
3. Add a new boolean field to the `plugins` settings section defaults.
4. Mark any related top-level nav section with `pluginId`.
5. Wrap the plugin route layout in `PluginGuard`.
6. If the feature has orphan routes outside its main route tree, guard those too.

## Deliberate Non-Goals For This Version

- Remote plugin marketplace
- ZIP upload/install flow
- Arbitrary code download at runtime
- Full dependency graph resolution

That can be added later if needed, but the current system is designed to support customer-facing enable/disable cleanly first.
