# ConvexPress Extension Kit

Extensions are source-installed features spanning the site backend, Admin, Website and Dashboard. They are enabled in Admin's Extensions screen; disabled features are rejected by backend handlers and public route loaders and hidden from navigation. There is no ZIP-upload marketplace.

## Create an extension

From `ConvexPress-Admin`:

```sh
bun run create:extension community-events --title "Community Events" --dry-run
bun run create:extension community-events --title "Community Events"
```

The generator copies the complete Events reference into isolated namespaces, updates the surface catalogs, regenerates schema/plugin/Dashboard/Website indexes, synchronizes template mirrors, regenerates installed route trees and refreshes the typed site API declarations. It refuses existing extension files or catalog IDs. It never deploys. Run it from a checkout with both Admin and Website dependencies installed.

The starter implements event publishing: drafts, publication, cancellation, archive, date/time-zone validation, unique slugs, optimistic editing, public field projections, capability checks and plugin gates. Adapt those fields and surfaces to the new domain. The current reference also includes event categories and free RSVP registration/attendance. External registration is an optional link; ticket charging is not implemented. Generated RSVP uses extension-owned sources for snapshots, editor choices and registration. The stable `canonicalRsvp` browser API resolves the owning table from the saved block; callers cannot select another provider or function path. Live acceptance remains recorded separately from source checks. See the current acceptance ledger before treating a generated plugin as release-ready.

## Source layout

- `packages/backend/convex/extensions/<module>/`: schema, plugin metadata, queries, mutations, Dashboard contribution and actual-handler tests. `schema.ts` exports `tables`; `plugin.ts` exports ID, settings key and default enablement. Extension table names must be unique. Backend module names replace public slug hyphens with underscores (`community-events` → `community_events`), because Convex module paths do not permit hyphens. Plugin IDs and public/Admin routes retain the original slug.
- `apps/web/src/extensions/<id>/`: Admin plugin manifest, navigation, list and editor. Admin route files use the existing `PluginGuard` and capability system.
- `ConvexPress-Website/apps/web/src/extensions/<id>/`: Website manifest, typed public DTO/API boundary and reusable parts.
- Website public and Dashboard routes load data and enforce enablement. Template surfaces under `templates/packs/core/surfaces/` render passed data; custom packs can override them.

An extension may export `searchSource` from `search.ts`. The generated search index discovers that declaration. Its ID matcher must recognize only its own table, and its request-local reader must recheck plugin enablement, publication and route membership before projecting public fields. Search index rows provide identity/ranking only. Duplicate matching table ownership fails closed. Keep the index writer in the same extension so create/update transactions never call another plugin's table reader.

Official sources live under `extensions`; local sources can use `extensions.local`. Generated indexes scan both. Keep the backend, Admin and Website manifests' IDs/settings keys/defaults consistent. Add parent dependencies to each manifest when a feature requires another plugin.

## Website manifest contract

`defineExtension` returns `surfaces`, `parts`, `dashboardNav`, `chromeParts`, `settingsKey` and `routePrefixes`. Surface metadata is derived from the shared template catalog to prevent drift. The Dashboard declaration references its existing catalog surfaces and registry IDs; backend Dashboard definitions continue to own labels, paths and access policy. Events adds a Dashboard registry contribution using that same contract.

`isPublicPluginEnabled` uses installed manifests, canonical settings keys before legacy aliases, and recursive parent checks. Unknown IDs and dependency cycles fail closed. The generated static index supports tooling while Vite discovers installed manifests for builds. Retain public query guards even when the route loader is guarded.

## Verify a generated extension

```sh
bun test ./packages/backend/convex/extensions/community_events/__tests__
bunx tsc --noEmit -p packages/backend/convex/tsconfig.json
cd apps/web && bun run check-types
```

Run Website type checks, lint and `check:templates` as well. Root deployment and browser acceptance must verify enabled and disabled routes, a draft hidden publicly, publication, stale edits, cancellation, archive and the Dashboard contribution. Source checks alone do not prove deployed UI behavior.

`ARCHITECTURE.md`, `CONTRACTS.md`, `DATA-API.md` and the reference directory retain details of existing core modules. For new source-installed extensions, this layout and the current Events files are authoritative; manual edits to the core plugin union or navigation registry are unnecessary.
