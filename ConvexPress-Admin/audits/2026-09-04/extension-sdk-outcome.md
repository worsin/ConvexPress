# HC2 extension SDK outcome — September 4, 2026

Implemented in the isolated hardening worktree. No browser, deployment, provider calls, commits or pushes were performed by this agent. Root owns live acceptance and screenshots.

## Delivered

- Website installed manifests replace the handwritten enablement switch. Sixteen platform declarations include Dashboard and Events. Manifests carry public route, surface, part, Dashboard ID and chrome contribution metadata. Canonical flags take precedence over aliases; disabled parents, missing IDs and cycles fail closed. Vite discovery and a generated tooling index cover official and local extensions.
- Backend extension plugin metadata joins the generated schema and Dashboard indexes. Defaults and plugin guards consume these declarations. Admin discovery includes extension parent dependencies. Dashboard contributes through the same declaration contract; its existing backend registry remains authoritative for Dashboard access and navigation.
- Complete Events reference: unique slug, validated schedule/time zone/registration URL, draft/published/cancelled/archived lifecycle, explicit public DTOs, guarded Admin pagination/editor, stale editor conflicts, audit events, public schedule/detail, reusable card, and Dashboard page. Core defines three new surfaces; the content agent implemented all three in Aster House (both now 89/89).
- `bun run create:extension community-events --title "Community Events"` creates isolated backend/Admin/Website/routes/surfaces/tests, updates catalogs, regenerates indexes and installed route trees, and synchronizes mirrors. Unsafe/reserved IDs, existing files and catalog collisions are rejected. Hyphenated IDs receive distinct settings, table, navigation and pagination namespaces. No deployment is part of this command.
- Updated `extension-kit/README.md` documents the source-installed workflow and its verification contract.

## Verification

- Events actual registered-handler regressions: 4 pass. Covers unauthenticated/disabled access, public projection, publication/cancellation/archive, duplicate slugs, optimistic concurrency, invalid schedules/zones/URLs.
- Scaffold regressions: 3 pass. File generation and overwrite refusal, unsafe input rejection, hyphenated namespaces. Combined Events/scaffold: 7 tests, 33 assertions (`extensions-tests.log`). The added pagination assertion failed against the first scaffold and passed after the namespace repair.
- Manifest resolver regressions: 4 pass, 7 assertions (`extensions-manifest-tests.log`). Events declaration and canonical alias precedence initially failed against the old switch; both pass now.
- Backend, Admin and Website TypeScript checks: pass (`extensions-*-typecheck.log`). Backend uses ES-target-compatible property checks; root's deployment CLI caught the original Object.hasOwn incompatibility and the repaired backend was rechecked before retry.
- Website lint, scoped Events/backend/scaffold lint, template contract/mirror checks, and `git diff --check`: pass (`extensions-website-lint.log`, `extensions-scoped-lint.log`, `extensions-template-check.log`). Route trees were generated offline without a server.
- Scaffold tests use cleaned temporary filesystem fixtures. They verify generated source and namespaces; they do not claim a second independently deployed extension.

## Root live acceptance

Enable `plugins.eventsEnabled`; create a draft at Admin `/events`, verify public `/events/<slug>` stays unavailable, publish and inspect the public schedule/detail plus Dashboard Events. Exercise stale editor reload, cancellation notice with registration disabled, and archive disappearance. Confirm disablement blocks direct public and Admin routes. Capture the reference screens and Aster House overrides. Events provides an external registration link; it does not implement paid tickets or RSVP collection.

Events API: `extensions/events/mutations:create` takes title, slug, description, startsAt, endsAt, timeZone, venue, venueAddress, registrationUrl optional. `update` adds id, expectedUpdatedAt and status. Source table is `extension_events`; platform event audit table is unchanged.
