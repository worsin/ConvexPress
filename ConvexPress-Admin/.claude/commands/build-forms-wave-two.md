# Build Forms — Wave Two (MVP-Plus, solo)

Wave One delivered code that compiles and typechecks green across both apps
(15/15 systems). It was NEVER executed. Wave Two makes every system actually
run and gets it bug-hunted, using ONLY what can be done without the user.

## GOAL MET WHEN (all solo-achievable — none of these needs the user)

1. **It runs.** Every system has ≥1 passing in-memory runtime test that
   *executes* its real surface (backend → `convex-test`; FE-only logic →
   unit/component test) covering a happy path AND ≥1 failure path. Paste the
   test counts.
2. **It's been attacked.** An adversarial review ran per system; every
   HIGH/CRITICAL finding is fixed or explicitly deferred with a stated reason
   (public `submit`/`resume` get the hardest look). Paste the review summary.
3. **It's wired.** `extension:audit` is clean: scanner discovery, manifest,
   nav, routes, action-registry registrations, default seeds, event constants,
   cron sweeps all present. The builder-canvas shell ships with the default
   (reuse `FieldGroupBuilder`). Paste the audit result.
4. **Gate green.** In `packages/backend`: `bun run codegen:extensions` exit 0.
   In `ConvexPress-Admin`: `bun --filter web check-types` exit 0. In
   `ConvexPress-Website`: `bun --filter web check-types` exit 0. Full forms
   test suite passes. Paste each final output.
5. **Honest re-score.** Each system re-scored ≥80% (Renderer ≥80, Commerce
   ≥65 are the capped exceptions) with the basis stated. The ONLY remaining
   gap is the genuinely user-gated live layer (Playwright E2E, Stripe sandbox,
   deploy, capability registration, `registerListeners.run`).

Stop ONLY when all five are demonstrably met, or genuinely blocked on
something only the user can provide. By construction, 1–5 do not need the user.

## TRACKS

- **A — Make the backend run.** Stand up `convex-test` (CHECK it is already
  installed first; if not, pin a version ≥30 days old per the quarantine —
  verify publish date). Integration-test the real mutations/queries in-memory.
- **B — Unit-test every pure-logic gap** with no coverage today.
- **C — Adversarial review-and-fix per system** (two-pass: find → refute →
  fix confirmed → re-verify). Hardest look at the public endpoints.
- **D — Close every additive wiring gap I'm permitted to.** NOT capabilities
  registration (Role expert), NOT `registerListeners.run` (deploy-time), NOT
  the Stripe webhook (subscription system) — those stay flagged.

## HARD CONSTRAINTS (unchanged from Wave One)

- No background/parallel `bunx`/`npx`. Run codegen/check-types/tests in the
  FOREGROUND, one at a time. (`bun test` is fine — it is in-process.)
- Never weaken typecheck. TS2589 are LSP false-positives; codegen tsc is
  authoritative. Never `--typecheck=disable`.
- NEVER remove functionality to make something pass.
- Additive-only: never edit `schema.ts` (extend via the extension schema),
  `registry.ts`, `nav-config.ts`, or the Role/Capability registry.
- No `@radix-ui` (use `@base-ui/react`); no hardcoded color literals;
  full-page nav (no modal content editors).
- 30-day dependency quarantine: no version <30 days old; pin exact; verify
  publish dates before adding anything.
- Website never deploys Convex.

## PER-BATCH LOOP

For each system (dependency order — pure logic first, integration last):
1. Read its code + PLAN.md. 2. Write/expand tests (Track A/B). 3. Run them
foreground; fix until green. 4. Adversarial review (Track C); fix confirmed.
5. Gate (codegen:extensions + both check-types + tests). 6. Re-score, log to
Airtable. Then next system. Surface a short evidence report per batch.

## MVP-PLUS BAR (per system)

code + passing unit tests + passing in-memory runtime execution of the happy
path + ≥1 failure-path test + adversarial review clean (no unaddressed
HIGH/CRITICAL) + wiring confirmed. ~80–90% solo; the final live layer is the
user's.
