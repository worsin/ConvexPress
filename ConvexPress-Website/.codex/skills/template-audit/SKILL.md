---
name: template-audit
description: Audit a ConvexPress template pack for SDK contracts, coverage and loaded-state behavior.
---

# template-audit

Read `template-kit/README.md` and `template-kit/CONTRACT.md`, then the target pack DESIGN.md and Core view models.

Run static contract, type and SSR checks. Inspect every declared surface and shared part. Use authorized staging fixture routes to verify loaded, empty, error and restricted states; distinguish unverified browser coverage.

Use SDK data and token classes. Site content stays in the CMS; route loaders, backend calls and access checks remain outside pack styling. Preserve block composition and per-pack header/footer/menu settings. Never imply deployment or browser acceptance from static checks alone. Respect the current session authorization for external writes and browser operations.
