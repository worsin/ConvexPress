---
name: extension-build
description: Use when creating or scaffolding a new ConvexPress extension with backend, native Admin, public Website or customer Dashboard behavior.
---

# Build a ConvexPress extension

Create one coordinated source-installed feature. Read `extension-kit/README.md`
and `extension-kit/WORKFLOW.md` from `ConvexPress-Admin`; the current Events
implementation is the executable reference. Older manual layer examples do not
replace the generator or its Website and Dashboard contributions.

## Apply the workflow

1. Establish the requested records, public fields, actions and access rules from
   the task. Ask only for missing decisions that materially affect the result.
   Choose a unique lowercase slug, for example `community-events`. Backend module
   `community_events`, public ID/routes `community-events` and settings key
   `communityEventsEnabled` are distinct generated identities.
2. With Admin and Website dependencies installed, run from `ConvexPress-Admin`:

   ```sh
   bun run create:extension community-events --title "Community Events" --dry-run
   bun run create:extension community-events --title "Community Events"
   ```

   Inspect the dry-run plan first. The generator uses `extensions/`; there is no
   local-distribution flag. It refuses existing paths and catalog IDs. It never
   deploys. Inspect partial output after failure instead of rerunning blindly.
3. Adapt the generated backend validators, handlers, tests, Admin editor,
   Website DTOs/parts/public routes, Dashboard contribution and Core surfaces to
   the domain. The starter is event publishing, not an arbitrary finished feature.
   Preserve plugin gates, public projections, optimistic edits, customer authority
   and soft archive. Operator edits use registered capabilities; register/test
   new capabilities if required. Public RSVP actions retain their own authority.
4. Let existing generators own indexes, API declarations and route trees. Catalog
   and canonical route changes are legitimate source inputs. Do not hand-edit the
   central plugin union/nav list or defer generated consumer integration to another
   agent. Follow WORKFLOW.md for regeneration after adaptation; stale API types
   must be repaired before checks pass.
5. Run the generated actual-handler tests plus domain regressions, backend strict
   types, Admin types/build and Website types/build/lint/template checks, from the
   exact directories in WORKFLOW.md. Check duplicate refusal without overwriting
   source. No source check certifies a live deployment.
6. Within authorized scope, deploy matching artifacts preserving the site's
   installed extensions/data. In native Admin enable the feature, author a draft,
   publish, inspect actual public listing/detail and customer Dashboard, exercise
   stale edit/cancel/archive, then disable/re-enable and verify denial/preservation.
   Record external prerequisites without inventing provider success.

## Deliver

Report source identities, changed behavior/permissions, exact checks, installed
artifacts and live results separately. Remove only owned disposable trial
resources after retaining recovery/evidence; keep requested implementation and
user content. Use `extension-add-feature` for an existing feature and
`extension-audit` for a read-only assessment.
