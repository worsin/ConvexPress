# Architecture

The root `blocks/` specification and renderer are the authored Library source. `scripts/blocks/discovery.mjs` discovers canonical Library, plugin and pack specs; `generator.mjs` emits closed types, validation, metadata, dependencies and patterns. Canonical backend foundation contracts are generated from this source and copied into Website's portable consumer graph. Admin owns backend implementation and deployment; Website never defines the database.

The actual runtime entry points are `ConvexPress-Admin/packages/backend/convex/canonicalDocuments.ts`, the canonical authoring UI, and Website `src/templates/sdk/block-renderer/`. Site/environment authorization and a revision-guarded document write surround content editing. Templates may declare owned renderers and validated treatments; otherwise SDK baseline rendering applies.

Legacy content models still exist for migration and recovery. The presence of canonical schemas does not justify deleting `content`, `contentMode`, `pageSections` or old revisions before migration, restoration and fleet acceptance pass. Runtime composed definitions and their promotion workflow remain separate unfinished requirements.
