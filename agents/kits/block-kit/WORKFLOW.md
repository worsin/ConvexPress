# Workflow

1. Add the attrs schema to both app block schema files.
2. Add or update the block name union.
3. Add the admin editor and registry entry.
4. Add the website renderer and registry entry.
5. Add migrations if the block version is greater than `1`.
6. Add a legacy adapter if an existing page-section type should become this block.
7. Run type checks in Admin, Website, and backend Convex.

## Verification

```sh
cd ConvexPress-Admin && bun run check-types
cd ../ConvexPress-Website && bun run check-types
cd ../ConvexPress-Admin/packages/backend && bunx tsc -p convex/tsconfig.json --noEmit
```

