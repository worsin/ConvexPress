# STOP. THIS IS A CONSUMER APP.

**DO NOT create Convex functions, schema, mutations, queries, or actions here.**

**DO NOT run `npx convex dev` or `npx convex deploy` from this app.**

**DO NOT create a `convex/` folder in this package.**

This is a **read-only consumer** of the ConvexPress-Admin's Convex deployment. The ConvexPress-Admin owns
the database, the schema, and all server-side functions. This app connects to it via
`VITE_CONVEX_URL` and calls functions through the `anyApi` proxy in `generated/api.js`.

## What lives here

```
generated/
  api.js        - anyApi consumer proxy (DO NOT REPLACE with real codegen)
  api.d.ts      - Type declarations for the proxy
  dataModel.d.ts - Minimal Id<T> type placeholder
```

These files exist so the ConvexPress-Website frontend can do:
```ts
import { api } from "@convexpress-website/backend/generated/api";
const posts = useQuery(api.posts.queries.listPublished, { ... });
```

That's it. That's the entire purpose of this package.

## Rules

1. **All Convex functions live in `ConvexPress-Admin/packages/backend/convex/`** — not here.
2. **All schema changes go in `ConvexPress-Admin/packages/backend/convex/schema/`** — not here.
3. **All deployments run from `ConvexPress-Admin/`** — never from ConvexPress-Website.
4. If you need a new query or mutation, add it to the ConvexPress-Admin backend and call it from here via `anyApi`.
5. If an AI agent tries to create files here, it is wrong. Stop it.
