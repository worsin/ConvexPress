# Low Audit Backlog

Source: `audits/codex-backlog/system-audit-gaps.md`
Generated: 2026-06-04
Severity mapping: `P3 - Low`

This file consolidates all low-priority audit results into two execution lanes:

- Agent-doable: work that can be designed, implemented, tested, documented, and smoke-tested without a human decision or external account action.
- Needs human: product policy, credentials, legal/compliance, production-account setup, or final operator acceptance.

## Summary

- Systems: 1
- Most urgent technical theme: documentation and feed-regression coverage.
- Most urgent human theme: production feed validation on a real deployed domain.

## Systems

| System | Status | Agent-doable work | Needs human |
| --- | --- | --- | --- |
| RSS/Feed System | 95%, In Development | Backfill PRD, add XML builder/escaper/date formatter tests, endpoint integration tests, confirm rate-limit strategy, validate generated sample feeds. | Run/approve external feed-validator checks against the production domain and decide CDN vs in-code rate limiting. |

## Agent-First Execution Order

1. Backfill `specs/ConvexPress/systems/rss-feed-system/PRD.md`.
2. Add unit tests for `escapeXml`, `escapeCdata`, date formatting, RSS channel building, and Atom feed building.
3. Add route-level integration tests for feed endpoints, empty-feed behavior, and 404 behavior.

## Human Gates

1. Production-domain feed validation with an external validator.
2. Final decision on whether feed rate limiting lives in CDN/proxy configuration or application code.
