# Official extensions (Convex backend)

This folder holds the **backend** side of official, maintainer-shipped
extensions — committed to the upstream repo and shipped with every
ConvexPress release.

Each official extension is a folder:

```
extensions/<id>/
├── schema.ts        # exports `tables` (Convex table definitions)
├── queries.ts       # public queries → api.extensions.<id>.queries.*
├── mutations.ts     # write operations → api.extensions.<id>.mutations.*
└── internals.ts     # optional system-to-system functions
```

The **frontend** half of the same extension lives at
`apps/web/src/extensions/<id>/`.

The schema codegen script
(`packages/backend/scripts/generate-extension-index.mjs`) globs every
`schema.ts` in here and in `../extensions.local/` and writes
`packages/backend/convex/schema/_extensionsIndex.generated.ts`, which
the main `schema.ts` hub imports. Convex's runtime function discovery
picks up `queries.ts` / `mutations.ts` automatically — no codegen
needed for those.

For locally-installed extensions that should never be uploaded back to
the upstream repo, see [`../extensions.local/`](../extensions.local/).

## Search maintenance

An extension that exports `searchSource` also declares its `maintenance` contract:
`version`, bounded `page(ctx, cursor)`, `sync(ctx, id)` and `exists(ctx, id)`.
The extension owns its source table and ID checks. A maintenance page returns at
most one source ID, its continuation cursor and `isDone`; writes use the same
indexing helper as ordinary authoring. Existence checks concern stored source
identity, independent of publication or plugin enablement. Public search still
uses the current access-aware reader.

The full reindex workflow scans each installed source separately, persists its
progress and counts every supported content type. Advance the maintenance
version when changing cursor semantics. An unfinished job detects changed
installed source contracts and requires an explicit restart. Orphan cleanup
never guesses an extension table from a URL or assumes that all event IDs belong
to the reference Events plugin. Upgrade existing installed search sources before
deploying this required interface; the generated registry typechecks each source.
