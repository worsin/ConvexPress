---
name: design-search
description: Design or restyle ConvexPress template pack surfaces for search using the template SDK.
---

# design-search

This skill targets the active or explicitly requested pack, not the public route files. Read `template-kit/README.md`, `template-kit/CONTRACT.md`, `design-kit/BRAND.md` and the pack DESIGN.md.

1. Identify the requested pack and surface: search. Read the actual Core data types and existing pack implementation.
2. Use the session-authorized brand brief and current site data. If live data access is unavailable, keep content-driven placeholders/loading states and report the acceptance gap; do not invent business claims.
3. Edit `apps/web/src/templates/packs/<pack-id>/surfaces/<surface-id>.tsx` and pack-owned parts. Preserve the route loader, SEO, mutations, password/member checks and the complete SDK view model.
4. Expose variations through declared Customize modules, defaults/presets, variants and field surface metadata. Header/footer/menu controls remain per pack. Page-specific interactions that need new data belong in an extension or block before the pack renders them.
5. Run sync:templates, check:templates, check:templates:ssr, types and lint. Capture authorized staging screenshots and verify the affected loaded/empty/error/restricted states. Record what was implemented, tested and observed.

No direct backend/provider calls in pack surfaces or parts. Do not replace route files for a visual redesign. Site deployment remains owned by ConvexPress-Admin and follows the session authorization.
