# Authored example sites

These four fictional sites supply editable canonical content for the Core, Journal, Depot and Aster House packs. They are site data, not hardcoded template surfaces. There are currently 21 authored page/article recipes. Each recipe declares navigation, a homepage key and the resources still needed for its complete experience.

A recipe is not an accepted website. Its acceptance flags deliberately remain false. The document authoring command below creates drafts only. It does not activate a pack, overwrite menus, configure a homepage, publish content, send mail or create purchases.

## Author drafts on a separate staging site

Use a distinct site database for each example. First provision that site's staging instance through the existing Admin platform workflow, activate the matching installed pack, and establish an authorized session. Do not substitute another customer's database because it is available. A paired live instance must retain its own database.

Save a secret-free target file with `origin`, `websiteKey`, `instanceKey`, and `environmentKind: "staging"`. Read these from the actual registered instance. Store its access token alone in a private regular file with permissions 0600, outside the repository.

Run from the repository root:

```sh
bun scripts/sites/author-cli.ts \
  --recipe examples/sites/core.json \
  --target /absolute/private-work/studio-target.json \
  --token-file /absolute/private-work/studio-access-token \
  --journal /absolute/work/studio-authoring.json \
  --apply
```

Use the same receipt journal for the same recipe and target on subsequent runs. Its fingerprint prevents silently switching a run to another recipe or site. The command verifies the registered identity and active pack, checks every proposed slug, and creates content through `canonicalDocuments.create`, `updateMetadata`, and `save`. Exact canonical readback follows each stage. Existing documents are never adopted based on matching names. Existing owned documents must retain their expected revision, body, title, status and slug. A successful rerun makes no content writes.

Every mutation intent is persisted before sending it. If a response is lost, the pending operation remains unconfirmed and automatic replay is refused. Inspect the same operation's authoritative outcome and reconcile its receipt before continuing; do not delete the receipt to try again. An interrupted CLI lock records its process ID. Verify that process is terminal before manually removing a stale lock. Do not remove a live owner's lock.

The token belongs to the caller's session. The command neither refreshes nor revokes it. Use a disposable session for acceptance and revoke it through the normal logout workflow afterward.

## Remaining site stages

| Pack | Authored routes | Next resource work |
| --- | --- | --- |
| Core / Fieldwork Studio | Home, approach, Northline project, studio, writing note | Owned project photography and configured inquiry submission |
| Journal / Slow Current | Home, about, reading path, three original articles | Editorial photography, masthead and author profile |
| Depot / Common Supply | Home, story, care, delivery/returns, buying note | Real synthetic product records, owned product media, stock/variants and test checkout/order verification |
| Aster House | Home, house, surroundings, visit information, journal note | Owned hospitality imagery, real demonstration Events records and configured inquiry submission |

After resources are authored, configure actual menus/header/footer/homepage and pack settings with the existing revision-checked APIs. Publish reviewed canonical documents through the ordinary publication API. Exercise native editing/reopen/actual Website preview and desktop/mobile public routes. Commerce and Events links are explicit dependencies on their declared plugin routes; static link checks do not prove those plugins work. Do not mark site acceptance true until those workflows have been observed.

## Checks

```sh
cd scripts/sites
bun test author-documents.test.ts recipes.test.ts handlers.test.ts
```

These cover canonical schema validation, link destinations, all 21 documents through actual Convex handlers, unchanged original fixture content, idempotent reruns, identity/ownership conflicts, and interrupted writes. They do not substitute for live site deployment or rendered acceptance.

## Live staging checkpoint

Four dedicated, Admin-connected staging examples now serve the authored content at localhost ports 4325 (Core), 4326 (Journal), 4327 (Depot) and 4328 (Aster House). All 21 documents are published with homepage/navigation/appearance configuration. Depot has three actual products; Aster has two actual demonstration Events records. The authored resource inputs are in `resources/`; these files are not a replay-safe resource importer.

See `ConvexPress-Admin/audits/2026-09-04/example-sites-live-20261005.md` for evidence and remaining acceptance. Owned media, forms, full native/preview/responsive verification and complete commerce workflows remain open. After publication changes a document revision/status, the draft-authoring receipt correctly refuses a draft rerun; continue editing through normal canonical APIs with the current revision.

The next media/inquiry checkpoint adds four original images in `assets/` (including exact prompts and provenance), processed media bindings in `resources/media-bindings.json`, and functioning Core/Aster local inquiry definitions in `resources/inquiries.json`. Actual browser submissions and Admin entry readback passed; outbound notifications remain disabled. See `ConvexPress-Admin/audits/2026-09-04/example-site-media-inquiries-20261005.md`. Individual product imagery and final native/responsive/commerce acceptance remain unfinished.
