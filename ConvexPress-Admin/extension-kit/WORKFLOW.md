# Build and verify a source-installed extension

Use the current Events implementation and [README.md](README.md) as the starting
contract. The generator creates backend, Admin, Website and customer Dashboard
contributions together. Older manual examples describe individual layers; they
do not replace this installation workflow.

## 1. Choose the domain and identity

Establish the requested records, public fields, authoring actions and customer
access rules. Use a unique lowercase slug such as `community-events`. Public
IDs and routes keep the hyphen; backend modules use `community_events`, and the
settings key is `communityEventsEnabled`. Keep those identities consistent in
all consumers. Read the existing installation before extending one.

The generator creates source under `extensions/`. Scanners also support
`extensions.local/`, but the generator has no local-distribution flag. Do not
promise a local-only install by moving two folders: backend, Admin, Website,
routes, catalogs and imports must remain coordinated. A ZIP installer is not
part of this workflow.

## 2. Inspect and generate

Install the existing Admin and Website dependencies first. From
`ConvexPress-Admin`:

```sh
bun run create:extension community-events --title "Community Events" --dry-run
bun run create:extension community-events --title "Community Events"
```

Review the dry-run file list before writing. Existing extension paths or catalog
IDs are refused. The write copies the complete Events reference, adds public and
Dashboard surfaces to the catalogs, then regenerates indexes, template mirrors,
installed route trees and source-derived API declarations. It never deploys.
If generation fails, inspect the partial output and repair that step; rerunning
the scaffold over existing files is not a recovery mechanism.

Read `extension-kit/generated/community-events.md` for the generated identities.
The extension starts disabled. The source reference is an event-publishing
feature, not a finished implementation of every possible requested domain.

## 3. Adapt the owned implementation

| Concern | Source to adapt |
| --- | --- |
| Records, validators, lifecycle, authorization and tests | `packages/backend/convex/extensions/community_events/` |
| Native Admin manifest, navigation and editor | `apps/web/src/extensions/community-events/` and its canonical Admin routes |
| Public DTOs, parts and manifest | `ConvexPress-Website/apps/web/src/extensions/community-events/` |
| Public and customer routes | Website marketing routes, Dashboard page and route contributions |
| Presentation | Generated Core surfaces and intentional pack-owned overrides |

Website paths above are relative to the repository root; backend and Admin paths
are relative to `ConvexPress-Admin`. Keep private fields out of public DTOs.
Preserve plugin gates in handlers as well as routes, registered operator
capabilities, customer authority, optimistic editing and soft archive behavior.
The reference uses existing `manage_options` for operator edits. If the domain
needs a new capability, register and verify it through the existing permission
system before claiming usable access.

Public actions such as RSVP use their own customer/anonymous authority and abuse
controls; they do not become operator mutations. Preserve extension-owned RSVP
tables and providers. Search declarations must match only their own tables and
recheck enablement and public visibility when returning records.

Use scanner-owned declarations instead of hand-editing the central plugin union,
navigation list or generated indexes. Catalog additions and canonical route files
are real source inputs. Keep the generated Website and Dashboard integration.

## 4. Verify source and regenerate affected consumers

From `ConvexPress-Admin`:

```sh
bun test ./packages/backend/convex/extensions/community_events/__tests__
bunx tsc --noEmit -p packages/backend/convex/tsconfig.json
```

From `ConvexPress-Admin/apps/web`, run `bun run check-types` and `bun run build`.
From `ConvexPress-Website/apps/web`, run `bun run check-types`, `bun run build`,
`bun run lint` and `bun run check:templates`. Include focused tests for the new
domain behavior; copied event tests alone do not prove the adaptation.

After declaration changes, regenerate affected indexes with the existing Admin
`packages/backend/scripts/generate-extension-index.mjs` and Website
`scripts/sync-extension-manifests.mjs`. After catalog or pack changes, run Website
`bun run sync:templates`. Refresh source-derived API declarations from repository
root with `node scripts/admin/generate-site-contracts.mjs`; verify with the same
command plus `--check`. Regenerate canonical routes through each application's
existing router tooling/build. A stale API type is a failed source check, not an
expected condition to ignore until deployment.

## 5. Install and exercise the actual application

Use the site's normal source deployment workflow with matching backend, Admin
and Website artifacts. Preserve its installed extensions and data; scaffolding
does not install a feature into a running site. Use the existing authorized
deployment scope and disposable content for acceptance.

1. In native Admin, select the intended website and environment, open
   **Extensions**, and enable the generated feature.
2. Create and edit a draft in its native editor. Confirm it is absent from the
   public listing and detail route before publication.
3. Publish, inspect the real Website listing/detail, and check its customer
   Dashboard contribution with a normal customer session.
4. Exercise a stale edit, cancellation and archive using owned records. Verify
   public state follows the domain's rules without exposing private fields.
5. Disable the extension. Verify native navigation, direct Admin/public/customer
   routes and backend calls enforce the disabled state. Re-enable it and verify
   the same records remain intact.

Record actual results separately from source checks. Provider-dependent actions
need their own live proof; enabling a plugin does not prove an external service.

## 6. Finish and report

Report source paths/identities, generated changes, domain behavior, permission
and migration changes, exact checks, installed artifacts and live results. For a
disposable SDK trial, preserve a recoverable source/evidence archive and remove
only its owned scaffold, sessions, records and runtimes. For a requested
deliverable, retain the implementation and user content.

Use `extension-add-feature` for changes to an existing installation and
`extension-audit` for a read-only assessment. An audit checks for stale generated
output without running write-mode codegen in the user's checkout.
