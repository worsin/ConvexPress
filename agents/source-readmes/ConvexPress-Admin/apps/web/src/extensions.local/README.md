# User-installed extensions (Admin frontend)

This folder holds the **frontend** side of locally-installed extensions
— added by an admin operator on their own install of ConvexPress.
**Nothing in this folder is committed to the upstream repo** (see the
per-folder `.gitignore`). These extensions survive every in-app update
because `git reset --hard` does not touch gitignored content.

Layout per extension:

```
extensions.local/<id>/
├── manifest.ts   # exports default AdminPluginDefinition
└── nav.ts        # exports default AdminNavSection (optional)
```

The plugin-registry scanner at
`apps/web/src/lib/plugins/registry.ts` globs every `manifest.ts` here
along with the official ones at `../extensions/`. Both sources are
merged at build time; the running app cannot tell them apart.

**Backend** code for the same extension lives at
`packages/backend/convex/extensions.local/<id>/`. **Routes** still live
at the canonical TanStack Router path:
`apps/web/src/routes/_authenticated/_admin/<route-prefix>/`.

To create a new local extension, invoke the `extension:build` skill —
it knows the v2 contract and writes to the right paths.
