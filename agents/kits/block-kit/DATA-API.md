# Verified data surface

Source authority: `ConvexPress-Admin/packages/backend/convex/canonicalDocuments.ts` and `canonicalDocuments/service.ts`. Read current validators and exported types before calling; this list is a map, not a duplicate schema.

| Operation | Entry point | Required behavior |
|---|---|---|
| Authoring read | `canonicalDocuments.get` | Uses an authorized document and site runtime; returns canonical read state |
| Initialize | `canonicalDocuments.initialize` | Revision and source authoring digest guard; title and canonical tree |
| Save | `canonicalDocuments.save` | Exact `expectedRevision`, title and canonical tree; handle conflicts without overwriting |
| Revision list/restore | `canonicalDocuments.pageRevisions`, `.restore` | Paginated revisions; guarded restore with source checks required by current state |
| Prepare/migrate legacy | `.prepareMigration`, `.migrate` | Review candidate; bind authoring, candidate and presentation digests plus revision |
| Publish | `.setPublication` | Explicit publication intent and revision, separate from saving |
| Public render | `.getForRender` | Public access policy and authorized data projection, not the private authoring document |
| Resource pickers | `.pageOptions`, `.productOptions`, `.bundleOptions` and other exported options | Site-scoped, paginated references; no IDs guessed from another environment |

Renderer factories and host contracts live in Website `src/templates/sdk/block-renderer/model.tsx` and adjacent domain files. Public resolver result contracts live in `src/templates/sdk/block-data/portable/`; server implementations live in Admin `convex/canonicalDocuments/`. Use typed resource results and host callbacks, not backend administration credentials or direct record queries in block components.

All writes use the selected site's authenticated runtime. On uncertain acknowledgement, inspect the saved revision/receipt before retrying. Mutation authorization does not imply permission to publish, buy, send messages or change unrelated customer content.

The composition evaluator and preview renderer are documented in `references/composition-runtime.md`. They are pure runtime foundations, not registered save/compose/publish APIs; definition storage and editor/AI integration remain pending.
