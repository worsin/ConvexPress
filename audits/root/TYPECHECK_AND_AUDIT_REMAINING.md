# ConvexPress TypeScript And Audit Remaining Work

Date: 2026-04-20

## Verification Run

- `ConvexPress-Admin/apps/web`: `bun run build` passes.
- `ConvexPress-Admin/apps/web`: `bun run check-types` still fails, but only from backend-imported Convex files.
- `ConvexPress-Admin`: `git diff --check` passes.

## Current TypeScript Status

- Total remaining typecheck errors: 3,038.
- Web-owned errors: 0.
- Backend-imported errors: 3,038.
- Remaining error classes:
  - `TS2589`: 2,712 instances, from Convex-generated API/schema type recursion.
  - `TS7006`: 326 instances, mostly callback parameters that lost contextual typing after the Convex backend type graph hit `TS2589`.

## Remaining Work

1. Resolve the Convex backend recursive type graph.
   - The generated API imports every backend module and currently forces TypeScript into `TS2589` across validators, schema-derived types, and large Convex modules.
   - This blocks a clean full-app `tsc --noEmit` even though the web code itself is no longer producing errors.

2. Finish backend callback parameter typing.
   - 326 `TS7006` implicit parameter errors remain in backend files.
   - These should be handled with explicit domain document/result types where practical, not blanket `any` annotations.

3. Continue explicit `any` removal.
   - Current `any` matches outside generated route/API files: 2,453.
   - Some are comments or intentional generic boundaries, but real usages remain in backend modules and advanced web sections such as commerce, membership, shipping, gallery, structured editor data, and integrations.

4. Decide how to typecheck the backend directly.
   - The backend Convex folder has its own `tsconfig.json`, but the repository currently exposes backend errors primarily through the web app importing Convex generated API types.
   - A dedicated backend typecheck script would make the backend cleanup measurable without relying on the web app check.

5. Address build chunk warnings separately.
   - The web production build passes, but Vite reports large chunks for `EditorLayout` and the main `index` bundle.
   - This is not a TypeScript failure, but it remains a build-health item.

