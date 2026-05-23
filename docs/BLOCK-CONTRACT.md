# ConvexPress Block Contract

Every scanner-discovered block folder should contain:

```text
block.json
schema.ts
Editor.tsx
migrations.ts
manifest.tsx
```

`manifest.tsx` exports an `AdminBlockDefinition` in the admin app or a
`WebsiteBlockDefinition` in the website app.

Required metadata:

- `name`
- `title`
- `description`
- `category`
- `keywords`
- `version`
- `supports`
- `defaultAttrs`
- `schema`
- `Editor` or `Renderer`
- `aiHints`
- `rendererStatus`

Naming:

- `core/<name>`: platform core blocks
- `official/<name>`: platform-shipped add-on blocks
- `local/<name>`: site-local blocks
- `extension/<extension>/<name>`: extension-provided blocks

Attrs must be content-focused, schema-validated, and migration-safe.

Disabling a block means "do not offer this block for new use." It must not
delete, hide, or block saves for existing content. Existing instances remain
renderable and editable so platform updates and admin cleanup remain safe.
