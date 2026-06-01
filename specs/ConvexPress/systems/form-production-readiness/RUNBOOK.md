# Forms Extension Production Readiness Runbook

> Scope: ConvexPress Forms extension only. Admin owns schema/functions; Website renders public forms against the Admin-owned Convex deployment.

## Paid-Tester Readiness Gate

Run this gate before inviting paid testers:

```bash
cd ConvexPress-Admin/packages/backend && bun test convex/extensions/forms
cd ConvexPress-Admin/apps/web && bun run check-types && bun run build
cd ConvexPress-Website/apps/web && bun test src/extensions/forms/FormWizard.test.ts src/extensions/forms/security.test.ts src/lib/forms/formLogic.test.ts && bun run check-types && bun run build
cd ConvexPress-Admin/packages/backend && bun run codegen:extensions
```

Browser smoke requires authenticated admin smoke credentials and a published public form fixture:

```bash
cd ConvexPress-Admin/apps/web && bun run test:smoke --grep forms
cd ConvexPress-Website/apps/web && FORMS_SMOKE_SLUG=<published-form-slug> FORMS_SMOKE_MULTI_STEP_SLUG=<multi-step-form-slug> FORMS_SMOKE_STEP_ONE_LABEL="First Name" bun run test:smoke --grep Forms
```

## Required Fixture

Maintain one deterministic "Forms Paid Tester Fixture" form in the target Convex deployment:

- Status: `published`.
- Fields: required text field labelled `First Name`, `page_break`, required email field, one optional select field, and one calculation/pricing field if Stripe sandbox is configured.
- Confirmations: default message confirmation.
- Notifications: admin email notification enabled and a site notification enabled.
- Actions: one disabled webhook action and one sandbox webhook action when a request-bin endpoint is available.
- Security: honeypot enabled, rate limit enabled, CAPTCHA disabled unless the provider secret is configured.

## Environment Checklist

Forms can be shown to paid testers only when these are explicitly reviewed:

- Admin app: `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, and admin smoke credentials for browser tests.
- Website app: `VITE_CONVEX_URL`, public site URL settings, Clerk publishable key if login-required forms are tested.
- CAPTCHA: `FORMS_TURNSTILE_SECRET_KEY`, `FORMS_HCAPTCHA_SECRET_KEY`, or `FORMS_RECAPTCHA_SECRET_KEY` only when the matching provider is enabled.
- Email: provider credentials and sender/domain verification for notification delivery.
- Stripe: publishable key, secret key, webhook signing secret, and sandbox webhook delivery when testing paid form actions.
- Webhooks/providers: sandbox endpoints for webhook, lead capture, and email marketing action tests.

## Operator Checks

Use the Admin form analytics page as the first operational dashboard:

- `Operational health` should show no failed actions, no blocked submit spike, and no stale drafts after the daily sweep.
- Failed action runs should be reviewed from the per-form Actions page.
- Public funnel writes should increase during public smoke but should not spike beyond expected tester volume.
- Stale drafts may appear during save-and-continue testing, then should be counted by the abandonment sweep.

## Manual Paid-Tester Script

Before external testers:

- Create and publish a fresh form with at least two steps.
- Submit it anonymously from Website and confirm the entry appears in Admin.
- Start a draft, leave the page, resume by token, and finish the submission.
- Trigger a required-field error on step two and verify the wizard returns to the offending step.
- Export entries to CSV and open it in a spreadsheet to verify column shape and formula-injection neutralization.
- Trigger one sandbox action success and one sandbox action failure; confirm run history and notifications.
- Review analytics: viewed, started, completed, and operational health all update.

## Rollback

Forms changes are additive. If tester traffic exposes a regression:

- Disable the `forms` plugin from Admin plugin settings to hide Admin and public plugin surfaces.
- Unpublish affected forms to make public `/forms/:slug` routes return not found.
- Disable risky form actions first; entries and draft rows are retained.
- Keep the retention crons running unless the failure is in a retention mutation itself.
