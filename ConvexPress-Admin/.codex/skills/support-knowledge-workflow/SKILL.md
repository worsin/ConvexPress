---
name: support-knowledge-workflow
description: Use when the user asks to build, audit, debug, or improve ConvexPress support, tickets, ticket lifecycle, canned responses, support settings, support analytics, knowledge base articles, KB categories, collections, tags, templates, workflows, help center search, or support deflection.
---

# support-knowledge-workflow

Use this for the support stack: KB/help center content, ticketing, support
analytics, canned responses, workflows, and deflection.

## System Map

- KB admin routes: `apps/web/src/routes/_authenticated/_admin/kb/**`
- Support admin routes: `apps/web/src/routes/_authenticated/_admin/support/**`
- Ticket admin routes: `apps/web/src/routes/_authenticated/_admin/tickets/**`
- Backend domains: `packages/backend/convex/kb`, `tickets`, `support`, related
  notification/event helpers.
- Website consumers:
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/help/**`
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/support/**`

## Workflow

1. Identify subsystem: KB article/category/collection/tag/template/workflow,
   ticket list/detail, canned responses, support settings, analytics, or public
   help/support route.
2. Preserve article publication state, category/collection slugs, search index
   coverage, and public visibility rules.
3. For tickets, preserve lifecycle status, requester identity, assignment,
   messages, private/internal notes, notifications, and audit events.
4. Do not expose private ticket data on public support routes.
5. For support deflection, keep KB search and ticket submission connected but
   optional.
6. If public help/support changes, also use `website-help-support-experience`.

## Verification

Run backend typecheck and focused tests where present. Smoke admin KB/tickets and
public help/support routes when touched.

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

## Report

List support/KB objects touched, public/private visibility, notification effects,
and verification.
