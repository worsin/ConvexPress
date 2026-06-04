---
name: website-help-support-experience
description: Use when the user asks to build, audit, debug, redesign, or improve public help center, KB article/category/collection pages, help search, support landing pages, ticket submission, customer ticket list/detail, or support deflection on the ConvexPress Website.
---

# website-help-support-experience

Use this for public support and help-center routes.

## System Map

- Help routes: `apps/web/src/routes/_marketing/help/**`
- Support routes: `apps/web/src/routes/_marketing/support/**`
- Backend owner: `../ConvexPress-Admin/packages/backend/convex/kb`,
  `support`, `tickets`.
- Admin skill: use `support-knowledge-workflow` for backend/admin changes.

## Workflow

1. Identify route type: help index, KB article, category, collection, search,
   support form, ticket list, or ticket detail.
2. Read the route and backend query/mutation contract.
3. Preserve public/private boundaries: public KB articles can be indexed;
   tickets must be scoped to the requester/authenticated user.
4. For ticket submission, verify validation, attachments if present, spam/rate
   limits, confirmation states, and notification effects.
5. For help search/deflection, verify empty states, result links, and suggested
   article behavior.
6. Keep support UX useful without exposing internal admin notes.

## Verification

Run Website checks and smoke help/search/support/ticket routes touched:

```bash
bun run check-types
bun run build
```

## Report

List routes, visibility/data-scope checks, ticket/notification effects, and
verification.
