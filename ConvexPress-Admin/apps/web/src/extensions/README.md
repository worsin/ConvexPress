# Official extensions (Admin frontend)

This folder holds the **frontend** side of official, maintainer-shipped
extensions — committed to the upstream repo and shipped with every
ConvexPress release.

Each official extension is a folder:

```
extensions/<id>/
├── manifest.ts   # exports default AdminPluginDefinition (registry entry)
└── nav.ts        # exports default AdminNavSection (optional, sidebar entry)
```

The **backend** half of the same extension lives at
`packages/backend/convex/extensions/<id>/`.

The plugin-registry scanner at
`apps/web/src/lib/plugins/registry.ts` globs every `manifest.ts` here
and merges results with the platform's hand-edited list. The nav scanner
at `apps/web/src/lib/admin-shell/nav-config.ts` does the same for
`nav.ts` files.

**Routes** for an extension still live at their canonical TanStack
Router path:
`apps/web/src/routes/_authenticated/_admin/<route-prefix>/`. They're
discovered by the router's vite plugin, not by anything in this folder.

For locally-installed extensions that should never be uploaded back to
the upstream repo, see [`../extensions.local/`](../extensions.local/).
