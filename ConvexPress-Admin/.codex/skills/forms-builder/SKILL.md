---
name: forms-builder
description: Use when the user asks to create, edit, audit, debug, or extend ConvexPress Forms, the form builder, fields, multi-step forms, conditional logic, calculations, order forms, Stripe/payment actions, confirmations, notifications, entries, exports, spam protection, or form rendering.
---

# forms-builder

Use this for the official Forms extension. It is a Gravity Forms-style system
with builder, renderer, entries, notifications, confirmations, merge tags,
logic, calculations, and commerce/order actions.

## Read First

- `ConvexPress-Admin/AGENTS.md`
- `specs/ConvexPress/systems/form-builder-system/PRD.md`
- `specs/ConvexPress/systems/form-field-engine/PRD.md`
- `specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`
- `specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`
- `specs/ConvexPress/systems/form-production-readiness/RUNBOOK.md`

## System Map

- Frontend extension: `apps/web/src/extensions/forms/`
- Admin routes: `apps/web/src/routes/_authenticated/_admin/forms/**`
- Backend extension: `packages/backend/convex/extensions/forms/`
- Schema: `packages/backend/convex/extensions/forms/schema.ts`
- Pricing/calculation engine: `packages/backend/convex/extensions/forms/calc/`
- Commerce/order payment actions:
  - `packages/backend/convex/extensions/forms/commerce.ts`
  - `packages/backend/convex/extensions/forms/orderPayments.ts`
  - `packages/backend/convex/extensions/forms/orderPaymentActions.ts`
- Purchase ledger bridge: `packages/backend/convex/purchases/internals.ts`
- Public routes:
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/forms.$slug.tsx`
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/forms.$slug.resume.$token.tsx`

## Workflow

1. Classify the task: builder UI, field engine, renderer, entries, logic,
   notifications, confirmations, merge tags, calculations, commerce, exports, or
   spam/security.
2. Read the tests for that subsystem first. The Forms extension has broad
   backend coverage; preserve those contracts.
3. Keep form definitions and field values normalized through builder/core APIs;
   do not patch entry values ad hoc from UI code.
4. For multi-step/conversational forms, verify step metadata, progress save,
   resume token behavior, validation at step boundaries, and mobile layout.
5. For order forms, use field option prices, calculation rows, order summaries,
   Stripe/payment intent flows, and Purchase Core sync. Do not create a separate
   orphan order table.
6. For notifications/confirmations, validate merge tags and recipient safety.
7. For public rendering changes, update Website route behavior and use
   `website-forms-experience`.

## Verification

From `ConvexPress-Admin/`:

```bash
bun test packages/backend/convex/extensions/forms/__tests__/*.test.ts packages/backend/convex/extensions/forms/calc/__tests__/*.test.ts
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

For payment changes, also smoke test Stripe config boundaries, return URL
sanitization, webhook/provider assumptions, and Purchase Core ledger rows.

## Report

Report the form subsystem touched, data/schema compatibility, pricing/payment
effects, notification effects, public-renderer effects, and exact verification.
