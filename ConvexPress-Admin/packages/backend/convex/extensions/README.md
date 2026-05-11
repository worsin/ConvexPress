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
