# Four example-site recipes and canonical draft authoring — October 5

Task6/E10 is now in progress. The previous goal turn made progress in f5280e25 and11736642; this batch moves into actual authored site content and its non-destructive provisioning path.

## Delivered in source

- Four fictional site recipes under examples/sites/: Core Fieldwork Studio, Journal Slow Current, Depot Common Supply and Aster House.21 distinct pages/articles, homepage keys, navigation plans, declared plugin dependencies and outstanding resource requirements. Business copy lives in authored blocks, not pack surfaces.
- scripts/sites/author-cli.ts authors drafts with the existing create/updateMetadata/save APIs. The adapter checks the actual registered staging identity and active pack, then reads canonical content and raw slug metadata through ordinary authorized queries.
- A recipe/target fingerprint, exclusive CLI lock, durable mutation intents and acknowledged IDs prevent unowned adoption and blind replay. All desired routes are checked before mutation. Each save uses expectedRevision; exact body/title/status/slug checks preserve user changes. A successful rerun makes no writes. Unconfirmed operations require authoritative reconciliation, not a fresh create.
- No destructive old seed reinstated. No direct production DB writes. The command does not change appearance, menus, plugins, publication or payment settings. Its result explicitly says documents-authored and siteComplete=false.

## Evidence

Command from scripts/sites: bun test author-documents.test.ts recipes.test.ts handlers.test.ts.
19tests/158assertions pass. Initial engine regressions failed before implementation; corrupted receipt phase regression also failed before its validation repair. Actual Convex-handler integration authors every recipe into a separate isolated fixture, verifies original rows exact and proves second runs preserve the complete posts/revisions snapshots. Those are real handler tests, not live-server acceptance.

All21 canonical trees and authored local links validate; Journal and Depot each have8 discovered validated patterns. Linked Products/Events routes are declared plugin dependencies, not evidence of configured live catalogs/calendars.

The CLI bundles successfully for Bun. Targeted TypeScript passes with the backend workspace Node typeRoots. Initial default type resolution could not find Node types from scripts/sites; corrected the check path, no dependency install.

## Still required

Provision or identify four separately owned staging instances through the existing platform workflow. Do not reuse another client's database or conflate the existing source/target pair with four separate examples. Author records with durable journals; add owned media, actual product/event data and meaningful actions, actual menus/header/footer/homepage and pack settings. Review desktop/mobile, native editing/reopen/Website preview, publish and verify with supported workflows. Recipes and fixtures are not finished sites. Metadata appearance/publication and full-site acceptance remain open, as do the other delivery tasks.

The source/target installed backend bases remain output/canonical-mode-retirement-20261005/{source,target}-source-installed.json. This batch makes no network writes or backend deployments. All original user runtimes/content are untouched. Latest observed Claude audit remains39; no new audit was present. No push;137rows remain117Verified/20In progress.
