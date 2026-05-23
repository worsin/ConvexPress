# Architecture

ConvexPress blocks follow a split contract:

- Admin owns authoring and Convex mutations.
- Website owns rendering from validated, serialized block instances.
- Backend owns persistence, revision checks, and tree operations.

## Block Instance

```ts
type ConvexPressBlock<TAttrs> = {
  id: string;
  name: string;
  version: number;
  attrs: TAttrs;
  innerBlocks?: ConvexPressBlock[];
  layout?: BlockLayout;
  lock?: BlockLock;
};
```

## Persistence

Blocks live on the existing `posts` table so pages and posts share one composition model. Pages default to `contentMode: "blocks"`. Posts default to `contentMode: "article"` and can be converted to blocks.

`blocksRevision` is the optimistic concurrency guard. Every structural or attrs mutation increments it.

## Rendering

The website renders only known, valid block instances. Unknown or invalid blocks are suppressed in production and shown as diagnostics in development.

