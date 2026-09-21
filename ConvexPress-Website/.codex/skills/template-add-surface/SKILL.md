---
name: template-add-surface
description: Add a catalog surface implementation to an existing ConvexPress template pack.
---

# template-add-surface

Read `template-kit/README.md` and `template-kit/CONTRACT.md`, then the target pack DESIGN.md and Core view models.

Read the Core surface data type and existing route caller, add the pack surface default export without changing data loading or gates, then sync manifests and verify.

Use SDK data and token classes. Site content stays in the CMS; route loaders, backend calls and access checks remain outside pack styling. Preserve block composition and per-pack header/footer/menu settings. Never imply deployment or browser acceptance from static checks alone. Respect the current session authorization for external writes and browser operations.
