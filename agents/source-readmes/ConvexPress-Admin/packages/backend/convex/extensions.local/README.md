# User-installed extensions (Convex backend)

This folder holds the **backend** side of locally-installed extensions.
Nothing here is committed to the upstream repo — see the per-folder
`.gitignore`. Folder content survives `git reset --hard` updates.

Layout per extension:

```
extensions.local/<id>/
├── schema.ts        # exports `tables` (Convex table definitions)
├── queries.ts       # public queries → api.extensions.<id>.queries.*
├── mutations.ts     # write operations → api.extensions.<id>.mutations.*
└── internals.ts     # optional system-to-system functions
```

The codegen script
(`packages/backend/scripts/generate-extension-index.mjs`) globs every
`schema.ts` in here and in `../extensions/` (official) and writes
`packages/backend/convex/schema/_extensionsIndex.generated.ts`, which
`schema.ts` imports. The codegen runs automatically as a `predev` /
`predeploy` step.

The **frontend** half of the same extension lives at
`apps/web/src/extensions.local/<id>/`.
