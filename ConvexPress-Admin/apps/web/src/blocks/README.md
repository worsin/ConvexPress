# ConvexPress Official Blocks

Official, platform-shipped blocks live here. Each block is scanner-discovered
from:

```text
apps/web/src/blocks/<block-id>/manifest.tsx
```

The manifest must export an `AdminBlockDefinition` as `default` or
`definition`. Do not add official or local blocks directly to
`lib/blocks/registry.tsx`; the registry merges core blocks with discovered
manifests.

Use `apps/web/src/blocks.local/` for site-specific blocks that must survive
platform updates.
