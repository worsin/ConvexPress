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

Runtime custom definitions have registered draft, AI proposal, approval and SDK-promotion APIs under `convex/blockDefinitions/`. Use `references/style-and-compose.md` for the current entry points and exact review identities, `references/composition-runtime.md` for the restricted expression vocabulary, and `references/promotion.md` for reviewed SDK export. Draft creation, version approval, page insertion and publication are separate operations; a proposal does not save or approve content. Read the current validators before calling any operation, and preserve the selected website/environment and pinned definition versions.

## Author profiles

`core/author-bio` uses `content.author`. A nonempty `userId` selects one active public site profile; an empty ID preserves the authored card. `useCurrentAuthor: true` instead selects the authorized host document's current author, including inside reused content. Its default is false so existing version-2 manual/selected cards retain their behavior. The server supplies the current document identity; block attributes cannot choose another host document.

Authored name, bio and media override the chosen profile; role and links remain authored. A missing/inactive/management or route-denied profile produces an explicit unavailable state even when authored overrides exist. Public results contain only ID, display name, biography, optional public portrait and a real author archive path when the profile has a slug. Search rechecks profile availability before disclosing authored text from profile-bound cards.
