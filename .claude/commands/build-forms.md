---
description: Plan + implement the entire ConvexPress Forms extension to MVP quality, phase-gated and autonomous.
---

# GOAL: Ship the ConvexPress Forms extension to MVP quality

You are implementing the **ConvexPress Forms** extension (the first v2 scanner-discovered extension) end to end: turn every system PRD into an implementation plan, build it, and reach **MVP quality across the entire extension and every other change required to support it**.

This is a GOAL, not a single task. Drive it to completion autonomously, phase by phase. Do NOT pause for permission or ask "should I continue" — continue. The user reviews **results, not plans**: at each phase GATE, deploy + smoke-test + screenshot, report, then proceed to the next phase.

## Source of truth
- **Airtable** `ConvexPress` base (`appqpJ8QQkoKsH02O`): the `ConvexPress Forms` plugin, its 15 Systems, and their linked Routes / Actions / Events / Notifications — the relational map. (Source env key from `~/.zshrc` for the `airtable` CLI.)
- **PRDs:** `specs/ConvexPress/systems/form-*/PRD.md` — one per system (already written).
- **v2 contract:** `ConvexPress-Admin/extension-kit/` (read README → ARCHITECTURE → CONTRACTS → DATA-API → WORKFLOW once) and the `extension-build` / `extension-add-feature` skills.

## Per-system loop (in dependency order)
For each system:
1. Read its PRD + the PRDs of its Depends-On systems (context-chaining).
2. Invoke the **writing-plans** skill → write `specs/ConvexPress/systems/<slug>/PLAN.md`: granular, test-first, file-by-file steps.
3. Implement via **extension-build** (new) / **extension-add-feature** (extending), following the v2 contract exactly.
4. Verify: from `ConvexPress-Admin/packages/backend` run `bun run codegen:extensions`; from `ConvexPress-Admin` run `bun --filter web check-types` (must exit 0). Keep functional smoke green.
5. Update the Airtable System record: Status (`Designing` → `In Development` → `MVP Complete`) + Completion %.

## Phases & gates — deploy + screenshot + report at EACH gate
- **Phase 1 — working form end-to-end:** form-field-engine → form-builder-system · form-renderer-system · form-submission-system → form-entry-management-system. **GATE:** build a form in admin, render it publicly, submit it, view the entry.
- **Phase 2 — real-world forms:** form-multi-step-system · form-logic-validation-system · form-notification-system · form-confirmation-system · form-spam-security-system. **GATE.**
- **Phase 3 — power + integration:** form-actions-feeds-system · form-commerce-subscription-action · form-calculation-pricing-system. First reconcile the `AWAITING_PAYMENT` non-terminal action outcome between the Actions and Commerce PRDs. **GATE:** drive a form-powered subscription signup in the Stripe sandbox.
- **Phase 4 — polish:** form-merge-tags-prefill-system · form-analytics-export-system. **GATE.**

## Hard constraints
- **v2 additive-only:** never edit `convex/schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts`. Scanners + codegen merge the extension in.
- **Reuse, don't rebuild:** extract the `customFields` field engine into a shared package; Forms consumes it. Coordinate with the customFields conditional-logic fix (don't duplicate the bug).
- Every mutation starts with `requireCan(ctx, "form.<cap>")` and emits its event on state change. The **public submit is unauthenticated but MUST pass the Spam guard first**.
- UI: `@base-ui/react` (never Radix), Tailwind v4, **no hardcoded color literals**, full-page navigation (confirmation dialogs only).
- **Typecheck must pass — never `--typecheck=disable`.** Convex TS2589 false positives → scoped `@ts-expect-error`, not bug reports.
- Surface new capabilities for the Role expert; do not edit the role/capability registry yourself.
- Website public surfaces: hand templates to the design-kit (`design:*`) where a public page is needed.
- **Money/security paths** (commerce action, spam guard) are verified in a real sandbox run — never asserted as working.
- Never downgrade/remove functionality to fix a bug — fix the root cause. Never run `bunx`/`npx` in background or in parallel.

## MVP quality bar (whole extension + all touched code)
- No stubs/TODOs in shipped paths; every route/mutation/query wired and functional.
- All content dynamic (Convex-driven), nothing hardcoded.
- `codegen:extensions` consistent · `check-types` exits 0 · app builds.
- Each phase gate demonstrably works: Playwright smoke + screenshot of the real, deployed app.
- Deploy at each gate via the project deploy path (`bun run deploy` in `packages/backend`) so the result is live and reviewable.

## Reporting at each GATE
What shipped · deploy result · screenshots/smoke evidence · Airtable status updates · anything that genuinely needs the user (UX judgment on the builder canvas; Stripe sandbox creds). Then continue to the next phase without waiting. Save durable decisions to memory.
