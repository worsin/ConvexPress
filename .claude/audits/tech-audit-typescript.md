# TypeScript Audit -- KB, Tickets, and Support Bridge Systems

**Date:** 2026-04-02
**Auditor:** TypeScript Technology Expert Agent
**Scope:** All `.ts` backend files in `convex/kb/`, `convex/tickets/`, `convex/support/`, `convex/schema/kb.ts`, `convex/schema/tickets.ts`, `convex/schema/support.ts`; all `.tsx` admin frontend files in `kb/`, `tickets/`, `support/` routes and `components/kb/`; all `.tsx` website frontend files in `help/`, `support/` routes and `components/support/`.

---

## Summary

| Category | Count |
|----------|-------|
| `as any` casts | 36 |
| `as unknown as X` patterns | 4 |
| `@ts-expect-error` suppressions | 7 |
| `Record<string, any>` in mutations | 7 |
| Untyped function parameters | 4 |
| Untyped `ctx` parameters in helpers | 2 |
| Missing type narrowing after `.get()` | 3 |
| Variable shadowing | 2 |
| Operator precedence bug | 1 |
| **Total findings** | **66** |

**Severity distribution:** 12 HIGH, 32 MEDIUM, 22 LOW

---

## Finding 1 -- `(author as any).displayName` pattern repeated 14 times (HIGH)

**Files:**
- `ConvexPress-Admin/packages/backend/convex/kb/queries.ts` -- lines 64-65, 115-116, 160-161, 217-218, 264-265, 391
- `ConvexPress-Admin/packages/backend/convex/kb/comments.ts` -- lines 51-52

**Issue:** The user document returned by `ctx.db.get(authorId)` has a schema-defined type, but `displayName` and `avatarUrl` are accessed via `(author as any)` because the user schema type does not expose those fields visibly from the KB module's perspective.

**Why it matters:** This hides real type errors. If `displayName` is renamed to `name` in the users schema, these 14 call sites silently break at runtime with `undefined` instead of failing at compile time.

**Recommended fix:** Create a shared `enrichUser` helper that accepts the raw user document and returns a typed `{ _id, displayName, avatarUrl, email }` object. The helper should use proper property access from the schema-generated type, or define a utility type:
```ts
type UserBrief = {
  _id: Id<"users">;
  displayName: string;
  avatarUrl?: string;
  email: string;
};
```

---

## Finding 2 -- `Record<string, any>` used for partial updates in 7 mutations (MEDIUM)

**Files:**
- `convex/kb/mutations.ts` -- lines 178, 293
- `convex/kb/tags.ts` -- line 89
- `convex/kb/categories.ts` -- line 165
- `convex/kb/templates.ts` -- line 112
- `convex/kb/collections.ts` -- line 171
- `convex/kb/workflows.ts` -- line 129

**Issue:** Partial update objects are typed as `Record<string, any>` and then passed to `ctx.db.patch()`. This defeats the type safety that Convex provides for schema-backed patches.

**Why it matters:** Assigning a wrong-typed value (e.g., `updates.title = 42`) compiles without error. Convex will reject it at runtime, but you lose the compile-time safety net.

**Recommended fix:** Use `Partial<Doc<"table_name">>` instead of `Record<string, any>`. For tables with optional fields that need to be explicitly set to `undefined`, extend with `{ [K in keyof Doc<"table">]?: Doc<"table">[K] | undefined }`.

---

## Finding 3 -- `extractTextFromNode(node: any)` untyped parameter (MEDIUM)

**File:** `ConvexPress-Admin/packages/backend/convex/kb/helpers/utils.ts` -- line 274

**Issue:** The recursive TipTap JSON walker function takes `any` for its node parameter and accesses `.type`, `.text`, and `.content` without type narrowing.

**Recommended fix:** Define a discriminated union type for TipTap JSON nodes:
```ts
interface TipTapTextNode { type: "text"; text: string; }
interface TipTapBlockNode { type: string; content?: TipTapNode[]; }
type TipTapNode = TipTapTextNode | TipTapBlockNode;
```

---

## Finding 4 -- `(chunk: any)` in RAG search scoring (MEDIUM)

**File:** `ConvexPress-Admin/packages/backend/convex/kb/rag.ts` -- line 315

**Issue:** `allChunks.map((chunk: any) => ...)` casts away the type returned by `ctx.runQuery(internal.kb.internals.getAllRagChunks)`. The query return type should already be `Doc<"kb_ragChunks">[]`, making the `any` annotation unnecessary and harmful.

**Recommended fix:** Remove `any` annotation and use `chunk.articleId`, `chunk.embedding`, etc. directly. If the return type from `runQuery` inside an action is too loose, use a type assertion to the known return type once at the call site instead of on every element.

---

## Finding 5 -- Untyped `ctx` parameter in helper functions (MEDIUM)

**Files:**
- `ConvexPress-Admin/packages/backend/convex/kb/meilisearch.ts` -- lines 28-30
- `ConvexPress-Admin/packages/backend/convex/kb/rag.ts` -- lines 66-68

**Issue:** Both `resolveMeilisearchConfig` and `resolveRagConfig` define `ctx` with a manually typed inline interface `{ runQuery: (query: any, args?: any) => Promise<any> }`. This uses `any` three times per definition (6 total), bypassing type checking on the query functions passed in.

**Recommended fix:** Use Convex's `ActionCtx` type from `_generated/server`:
```ts
import type { ActionCtx } from "../_generated/server";
async function resolveMeilisearchConfig(ctx: ActionCtx): Promise<...> { ... }
```

---

## Finding 6 -- Variable shadowing: `article` re-declared inside feedback mutation (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/kb/feedback.ts` -- lines 62, 90-91

**Issue:** In `submitHelpful`, the outer `article` (line 29) is fetched, validated, and then `article` is re-declared as `const article = await ctx.db.get(args.articleId)` on line 62 (inside the `if (existing)` block) and again on line 90. The outer `article` variable is already guaranteed non-null at this point, so the re-fetch is redundant and shadows the outer binding.

**Same issue** in `submitRating` at lines 155 and 185.

**Recommended fix:** Remove the re-fetches and use the outer `article` variable directly. If the data might have changed mid-transaction (it cannot in a single Convex mutation), guard with a null check on the already-fetched value.

---

## Finding 7 -- `as unknown as string` for Convex ID navigation (MEDIUM)

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/new.tsx` -- line 57

**Issue:** `articleId as unknown as string` double-casts a Convex `Id<"kb_articles">` to `string` for TanStack Router navigation params. Convex IDs are already strings at runtime, so a simple `String(articleId)` or template literal would be type-safe.

**Recommended fix:** Replace `articleId as unknown as string` with `String(articleId)`.

---

## Finding 8 -- `as unknown as G/F/S` triple-cast for settings types (MEDIUM)

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/settings.tsx` -- lines 66-68

**Issue:** The settings object returned by `getKbSettings` has its sections cast through `as unknown as G/F/S` where G, F, S are locally-defined type aliases. This suggests the Convex return type does not match expectations.

**Root cause:** The `getKbSettings` query returns sections typed as `typeof KB_GENERAL_DEFAULTS`, etc. (which are `as const`-narrowed). The local G/F/S types use optional fields. The mismatch forces the double-cast.

**Recommended fix:** Export the setting section types from the backend validators or settings module and import them on the frontend. This eliminates the need for local type aliases and double-casts.

---

## Finding 9 -- 7 `@ts-expect-error` suppressions in website help routes (HIGH)

**Files:**
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/index.tsx` -- lines 33, 37
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx` -- lines 26, 31
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx` -- line 48
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/collections/$slug.tsx` -- line 26
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx` -- line 132

**Issue:** All suppressions cite "Convex query type mismatch with useSuspenseQuery". This indicates the website app's Convex type generation is out of sync with the admin app's backend, or the `useSuspenseQuery` wrapper has a generic mismatch.

**Why it matters:** `@ts-expect-error` hides ALL errors on the following line, not just the specific mismatch. If the query name or args change, the error is silently suppressed. These are the most dangerous suppressions in the codebase.

**Recommended fix:**
1. Regenerate Convex types in the website app (`npx convex dev --typecheck=disable` from admin, then sync types).
2. If the mismatch is with TanStack's `useSuspenseQuery`, create a typed wrapper function that bridges the Convex `FunctionReference` type to the `useSuspenseQuery` signature.

---

## Finding 10 -- 22 `as any` casts in website frontend (HIGH)

**Files:**
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/index.tsx` -- lines 79, 81, 110, 114 (4 casts)
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx` -- lines 33, 53, 54 (3 casts)
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx` -- lines 26, 27, 63, 64 (4 casts)
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/collections/$slug.tsx` -- lines 44, 45 (2 casts)
- `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx` -- lines 151, 168, 277, 281 (4 casts)
- `ConvexPress-Website/apps/web/src/components/support/views/TicketFormView.tsx` -- line 61 (1 cast)
- `ConvexPress-Website/apps/web/src/components/support/views/TicketDetailView.tsx` -- lines 23, 38 (2 casts)
- `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx` -- line 60 (1 cast)
- `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/index.tsx` -- lines 50, 96 (2 casts)

**Issue breakdown:**

- **`(categories as any[]).map(...)`, `(featured as any[]).map(...)`** -- Query return types are unknown, so arrays are cast to `any[]` before mapping. This destroys element-level type safety.
- **`category: category as any`** -- The ticket category string value from a form is cast to `any` to satisfy the Convex validator union type. Proper approach: define a shared type for the category union and validate the string before passing.
- **`ticketId: ticketId as any`** -- Convex `Id<"ticket_tickets">` is cast to `any` for a query argument. This suggests a type import issue.
- **`(ctx as any).search.q`** -- Accessing TanStack Router search params via `any` cast instead of using the route's typed search schema.
- **`const art = article as any`** -- Complete escape hatch; all subsequent property accesses are unchecked.

**Recommended fix:** Fix the root cause (Convex type generation sync) for the help routes. For ticket components, import the correct `Id` type or use the typed mutation/query args.

---

## Finding 11 -- `model: string | undefined` parameter in `generateAiAnswer` (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/support/deflection.ts` -- line 305

**Issue:** The `model` parameter accepts `string | undefined`, and the fallback (`model ?? "gpt-3.5-turbo"`) handles it correctly. However, the caller at line 155 passes `supportAiSettings.aiModel` which is typed as `string | null`. The `null` case passes through `??` correctly at runtime but technically `null` is not assignable to `string | undefined` without consideration.

**Recommended fix:** Change parameter type to `model: string | null | undefined` or use `?? undefined` at the call site.

---

## Finding 12 -- `searchKbConvex` casts Convex ID to string (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/support/internals.ts` -- line 101

**Issue:** `id: article._id as string` casts `Id<"kb_articles">` to `string`. Convex IDs are branded string types; a direct `as string` weakens the type. The `SourceArticle` interface uses `id: string`, which loses the branded type information.

**Recommended fix:** Either keep `SourceArticle.id` as `string` (acceptable since support system maintains schema independence) or use `String(article._id)` for explicit, documented conversion.

---

## Finding 13 -- `defaultPriority` settings property accessed without type narrowing (MEDIUM)

**File:** `ConvexPress-Admin/packages/backend/convex/tickets/mutations.ts` -- lines 157-160

**Issue:**
```ts
const prioritySetting = await ctx.db.query("settings")...unique();
if (prioritySetting?.values?.defaultPriority) {
  defaultPriority = prioritySetting.values.defaultPriority;
}
```
The `settings.values` field is typed as `v.any()` in the schema (an untyped JSON blob). Accessing `.defaultPriority` on it bypasses type checking entirely. There is no validation that the value is actually one of `"low" | "medium" | "high"`.

**Recommended fix:** Validate the value before assignment:
```ts
const raw = prioritySetting?.values?.defaultPriority;
if (raw === "low" || raw === "medium" || raw === "high") {
  defaultPriority = raw;
}
```

---

## Finding 14 -- Ticket `senderName` resolution has incorrect operator precedence (HIGH -- logic bug)

**File:** `ConvexPress-Admin/packages/backend/convex/tickets/messages.ts` -- lines 295-298

**Issue:**
```ts
const senderName =
  user.displayName || user.firstName
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : user.email;
```
Due to operator precedence, this evaluates as `(user.displayName || user.firstName) ? ... : ...`. If `user.displayName` is a non-empty string, the ternary is `true`, and the result is `[user.firstName, user.lastName].join(" ")` rather than `user.displayName`. The intent was likely:
```ts
user.displayName || (user.firstName ? [...].join(" ") : user.email)
```

**Severity:** HIGH -- This is a logic bug, not just a type issue. The `displayName` is ignored in favor of the joined first/last name whenever `displayName` is truthy.

---

## Finding 15 -- `SUPPORT_AI_DEFAULTS.aiProvider` uses `null as "openai" | "anthropic" | null` (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/support/settings.ts` -- line 51

**Issue:** `null as "openai" | "anthropic" | null` is a type assertion on a literal. While technically valid, it is unusual. The `as const` assertion on the parent object narrows `null` to the `null` literal type already, making the explicit cast redundant.

**Recommended fix:** Use a type annotation on the defaults object instead of per-field casts:
```ts
export const SUPPORT_AI_DEFAULTS: {
  aiProvider: "openai" | "anthropic" | null;
  aiApiKey: string;
  // ...
} = { ... };
```

---

## Finding 16 -- `getSupportAiSettings` returns `null as string | null` casts (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/support/internals.ts` -- lines 196-206

**Issue:** The fallback object uses `null as string | null` for multiple fields. These casts exist to satisfy the return type inference but are noisy. A single return type annotation on the function would eliminate all of them.

**Recommended fix:** Add an explicit return type to the handler or define an interface:
```ts
interface SupportAiSettings {
  aiProvider: string | null;
  aiApiKey: string | null;
  aiModel: string | null;
  meilisearchEnabled: boolean;
  meilisearchUrl: string | null;
  meilisearchApiKey: string | null;
  ragEnabled: boolean;
}
```

---

## Finding 17 -- Inconsistent validator import pattern in workflows (LOW)

**File:** `ConvexPress-Admin/packages/backend/convex/kb/workflows.ts` -- line 27

**Issue:** `import { v } from "convex/values"` is imported for the inline `get` query args on line 46, while the `ConvexError` import comes from the same module on line 16. Other KB files centralize all validators in `./validators.ts`. The inline `v.id("kb_workflows")` arg definition should be moved to a `getWorkflowArgs` export in validators.ts for consistency.

---

## Finding 18 -- `(data as any)?.results` and `(data as any)?.total` in search route (MEDIUM)

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx` -- lines 63-64

**Issue:** The Convex query return value is cast to `any` before accessing `.results` and `.total`. The `search` query in `kb/search.ts` returns `{ results: [...], total: number }`, a well-typed object. The `any` cast is a consequence of Finding 9 (type generation mismatch).

---

## Clean Code Highlights

The following patterns are well-done and should be preserved:

1. **Schema validators are centralized** in `schema/*.ts` and re-exported through `validators.ts`. This is excellent for maintainability.
2. **Ticket system has zero `as any` casts** in backend code. This is the gold standard for the other systems to follow.
3. **Support Bridge maintains schema independence** by using `string` IDs instead of `Id<"kb_articles">` -- a deliberate architectural choice, well-documented in schema comments.
4. **Rate limiting and session management** in the ticket system are cleanly typed with no type escapes.
5. **Convex `internalMutation` / `internalQuery`** usage correctly separates Node.js actions from Convex runtime functions (see rag.ts / meilisearch.ts split).

---

## Priority Remediation Plan

### Phase 1 -- High Impact (fix first)

| # | Finding | Files | Effort |
|---|---------|-------|--------|
| 1 | `(author as any).displayName` x14 | kb/queries.ts, kb/comments.ts | Create `enrichUser` helper |
| 9 | 7x `@ts-expect-error` suppressions | Website help routes | Regenerate Convex types for website |
| 10 | 22x `as any` in website frontend | Website help/support routes | Flows from Finding 9 |
| 14 | Operator precedence bug in senderName | tickets/messages.ts | 1-line fix |

### Phase 2 -- Medium Impact

| # | Finding | Files | Effort |
|---|---------|-------|--------|
| 2 | `Record<string, any>` in mutations x7 | kb/*.ts | Switch to `Partial<Doc<"table">>` |
| 5 | Untyped `ctx` in action helpers x2 | kb/meilisearch.ts, kb/rag.ts | Import `ActionCtx` |
| 4 | `(chunk: any)` in RAG scoring | kb/rag.ts | Remove annotation |
| 3 | `extractTextFromNode(node: any)` | kb/helpers/utils.ts | Define TipTap node type |
| 7 | `as unknown as string` for ID | kb/new.tsx | Use `String()` |
| 8 | `as unknown as G/F/S` settings | kb/settings.tsx | Export types from backend |
| 13 | Untyped settings value access | tickets/mutations.ts | Add runtime validation |

### Phase 3 -- Low Impact

| # | Finding | Files | Effort |
|---|---------|-------|--------|
| 6 | Variable shadowing in feedback | kb/feedback.ts | Remove re-fetches |
| 11 | `model: string \| undefined` | support/deflection.ts | Widen parameter type |
| 12 | ID cast in searchKbConvex | support/internals.ts | Use `String()` |
| 15 | Redundant `null as` cast | support/settings.ts | Type annotation on object |
| 16 | `null as string \| null` x6 | support/internals.ts | Define return interface |
| 17 | Inconsistent import pattern | kb/workflows.ts | Cosmetic |

---

## Metrics

| System | Backend `as any` | Backend `Record<string, any>` | Frontend `as any` | Frontend `@ts-expect-error` | Severity |
|--------|-----------------|-------------------------------|--------------------|-----------------------------|----------|
| KB | 16 | 7 | 3 | 0 | MEDIUM |
| Tickets | 0 | 0 | 2 | 0 | LOW |
| Support | 0 | 0 | 17 | 7 | HIGH |
| **Total** | **16** | **7** | **22** | **7** | -- |

The ticket system backend is the cleanest. The KB backend has the most `as any` casts (all from the same `author.displayName` pattern). The website frontend has the most type escapes, primarily caused by Convex type generation being out of sync with the admin backend.
