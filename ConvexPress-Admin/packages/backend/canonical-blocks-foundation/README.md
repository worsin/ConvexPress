# Canonical block contracts and pure runtime

This directory owns the pure contracts used by canonical document planning, data projection, revisions, migrations, composed definitions and reusable content. It is source shared by editor tooling and the deployable backend. Registered site endpoints live in `convex/canonicalDocuments.ts`, `convex/blockDefinitions/` and `convex/syncedBlocks/`; their authorization and transaction behavior must be verified separately from these pure modules.

Generated Library schemas, metadata, patterns and storage shapes live in `generated/`. Root `scripts/blocks/backend-foundation.mjs` generates them from the canonical block specifications. `scripts/blocks/deployed-foundation.mjs` copies the declared dependency closure into `convex/canonicalDocuments/foundation/`, normalizes Convex module paths and verifies its manifest. Do not hand-edit generated copies or import repository-root block modules from deployed handlers.

## Trust boundaries

Stored nodes identify registered resolvers through validated block specifications; they do not select arbitrary server functions. The planner enforces canonical versions, structural limits and current server-owned plugin/capability policy. Resolver projections and media resources are closed DTOs. Scope, viewer and document bindings are structural checks: they do not replace authenticated transport or server authorization.

Storage validators describe the database shape. Authoring handlers also need full tree validation, current authority, resource validation, revision/digest checks and atomic revision writes. Display grants, definition approval and reusable-source publication are independently checked at their consuming boundaries. A client-supplied policy or a stale preview receipt must never grant access.

Migration preparation reports unsupported source semantics instead of silently dropping content. Recovery retains the original authoring fields; accepting a migrated document and recovering its prior representation are distinct operations. Tests here cover pure conversion/contracts; registered transaction tests live beside the Convex handlers.

## Reproduce the source checks

From the repository root, with the pinned Admin dependencies installed:

```sh
node scripts/blocks/backend-foundation.mjs --check
node scripts/blocks/deployed-foundation.mjs --check
```

From `ConvexPress-Admin/packages/backend`:

```sh
node scripts/generate-extension-index.mjs
node scripts/generate-local-api.mjs
bun x tsc --noEmit -p convex/tsconfig.json
bun test ./convex ./canonical-blocks-foundation ./membership-policy-foundation ./scripts
```

Local API generation uses the installed Convex generator and does not contact or deploy to a database. Deployment, actual native editing, live customer isolation, complete block/template rendering and production readiness require their own acceptance evidence. Current status is maintained in the September4 audit's current-acceptance ledger; a passing pure contract suite does not close those requirements.
