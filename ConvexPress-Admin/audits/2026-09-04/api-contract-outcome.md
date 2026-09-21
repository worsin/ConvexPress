# D01 typed site API contracts — outcome

Implemented in the isolated hardening worktree. No deployment, external provider call, browser session, commit, or push was performed by this agent.

## Contract boundary

Admin and Website now share generated terminal `FunctionReference` declarations for 2,001 registered functions: 1,322 public and 679 internal, with 1,872 structural DTO definitions. Existing import paths and runtime proxies remain compatible. Frontend declarations contain no `any`, `AnyApi`, `ApiFromModules`, `FilterApi`, or imports of backend implementations. Internal functions are absent from the public API tree.

The offline generator follows the actual validators and awaited returns. It checks a stable inference result before writing, supports deterministic freshness checks, and rejects unresolved registered signatures. Nine compiler fixtures run for each consumer: valid arguments/IDs/DTOs compile; invalid values, wrong table IDs, unknown argument keys, wrong or missing return fields, nonexistent endpoints, internal visibility violations, and legacy handler-any argument erasure fail.

The inventory explicitly retains **440 existing argument/result locations containing legacy untyped data** as `unknown`. This is an honest boundary requiring callers to narrow dynamic payloads; it does not claim runtime validation of every legacy `v.any` field. The product read helpers and public LMS/gallery projections now retain document types, and public membership plans have an explicit return validator.

## Behavior repaired while activating contracts

- Taxonomy archives previously returned raw published post documents, including password-protected content and editorial metadata. They now enforce discoverability before counts/pagination and return the shared safe content projection with public author and image cards.
- Public media now returns safe, refreshed `sizesMap` URLs/dimensions used by preferred-size images; storage IDs and private metadata remain excluded.
- Media picker upload uses the actual `fileName` argument. The media bulk permanent-delete control calls the matching permanent-delete mutation.
- Variant image removal accepts an explicit null clear command and removes the optional media field; product create/update payloads preserve their distinct nullable semantics.
- Forms' empty paginated responses return a string continuation cursor, as required by Convex pagination.
- Email list projections include the subject displayed by Admin, registry metadata uses the declared trigger enum, and ticket statistics supply the displayed awaiting-first-response count.
- Admin field selectors call existing taxonomy/profile endpoints with validated pagination keys. Page creation excludes trash status; workflow stages retain and submit their required type/assignee information. IDs stay branded through row state and selection; route and manual ID entry boundaries remain subject to backend ID validation.
- Admin search mouse and keyboard selection now share the real destinations, including media, courses, and products. Other Admin and Website caller repairs are recorded in the sibling D01 caller outcome.

## Verification

- Backend TypeScript: pass, no new suppression directives added.
- Admin frontend TypeScript: pass.
- Website frontend TypeScript: pass (content agent's integrated run).
- Contract freshness: pass, both emitted consumers match the source-derived declarations.
- Compiler contract fixtures: 18 pass.
- Admin guardrails: pass.
- Focused backend regressions: **824 pass, 0 fail, 4,044 assertions across 42 files** (commerce, forms, media, taxonomy, settings, email, tickets).
- Five added real-handler cases: pass, 13 assertions. Media/archive, pagination, and variant-clearing regressions were observed failing before their fixes; saved red/green logs are in this audit directory.
- `git diff --check`: pass.

These are source, compiler, and handler checks. Rendered UI and cloud acceptance remain root-agent work; this outcome makes no additional live acceptance claim.

## September 20 current verification and CI repair

Current site contracts contain2,278 registered functions and3,029 terminal DTOs with375 explicit unknown boundaries. Freshness passes for both consumers;33 positive/negative compiler cases per consumer pass, and a separate original-style any-erased declaration is rejected. Admin, Website, site backend and control plane typecheck successfully. Root workflows had never invoked check:site-contracts; a dedicated .github/workflows/site-api-contracts.yml now installs both consumers and enforces freshness, negative fixtures and backend/consumer types on relevant changes. Control-plane offline bindings were normalized after deployment codegen; handler source is unchanged. Workflow structure validated locally, but actual GitHub execution and its Node22/Bun1.3.7 clean runner remain pending integration. No remote CI success or D01 release completion is claimed. Evidence: output/api-contract-acceptance-20260920/acceptance-review.md.
