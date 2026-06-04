---
name: website-forms-experience
description: Use when the user asks to render, embed, debug, design, or improve public ConvexPress Forms: hosted form pages, multi-step/conversational forms, save-and-continue, confirmations, form payment/order UX, validation, spam states, or form submission flow on the Website.
---

# website-forms-experience

Use this for public forms. Admin owns form definitions, entries, payments, and
builder behavior; Website renders and submits.

## System Map

- Hosted forms:
  - `apps/web/src/routes/_marketing/forms.$slug.tsx`
  - `apps/web/src/routes/_marketing/forms.$slug.resume.$token.tsx`
- Admin/backend owner:
  - `../ConvexPress-Admin/apps/web/src/extensions/forms/`
  - `../ConvexPress-Admin/packages/backend/convex/extensions/forms/`
- Purchase bridge:
  - `../ConvexPress-Admin/packages/backend/convex/purchases/`

## Workflow

1. Identify form mode: single-page, multi-step, conversational, save/resume,
   payment/order, or confirmation.
2. Read the public route and backend form query/mutation/action it calls.
3. Preserve field visibility, conditional logic, validation, calculation totals,
   order summary, payment intent handling, submission idempotency, and spam
   guard behavior.
4. For order forms, show line items/totals clearly and sync paid submissions
   through Purchase Core.
5. For save/resume, protect tokens and verify expired/invalid token states.
6. Do not duplicate form business logic in Website components; use backend
   form APIs.

## Verification

Run Website typecheck/build and Forms backend tests if contracts changed:

```bash
bun run check-types
bun run build
```

Browser-smoke a hosted form, a validation error, a successful confirmation, and
payment/resume paths when touched.

## Report

List form modes affected, public routes changed, backend APIs touched,
payment/order effects, and verification.
