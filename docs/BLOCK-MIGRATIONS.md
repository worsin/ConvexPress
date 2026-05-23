# ConvexPress Block Migrations

Blocks are versioned independently. A saved block carries its own `version`.
When a block attrs shape changes, add a migration instead of rewriting old
content.

Migration shape:

```ts
type BlockMigration = {
  name: string;
  from: number;
  to: number;
  migrate: (attrs: Record<string, unknown>) => Record<string, unknown>;
};
```

Runtime migration helpers exist in:

- `ConvexPress-Admin/apps/web/src/lib/blocks/migrations.ts`
- `ConvexPress-Admin/packages/backend/convex/blocks/migrations.ts`
- `ConvexPress-Website/apps/web/src/lib/blocks/migrations.ts`

Rules:

- New fields should usually be optional or have defaults.
- Renames require a migration from old attr name to new attr name.
- Removed fields should be ignored by renderers until migration is complete.
- Existing invalid blocks should not crash admin or public pages.
