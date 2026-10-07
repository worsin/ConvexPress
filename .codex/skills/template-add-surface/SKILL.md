---
name: template-add-surface
description: Use when implementing or restyling an existing ConvexPress SDK surface in a template pack, or adding a new surface contract needed by a route.
---

Locate both ConvexPress applications. Read
`ConvexPress-Website/template-kit/CONTRACT.md`, the target pack's `DESIGN.md`,
`apps/web/src/templates/sdk/catalog.ts` and the corresponding Core surface.
Choose the actual catalog ID and exported view-model type before editing.

For an existing surface, create or update
`apps/web/src/templates/packs/<pack>/surfaces/<surface-id>.tsx` with a default
component accepting `SurfaceProps<ActualDataType>`. Preserve the complete data,
variant and pack identity. Compose SDK primitives and pack-owned parts using
tokens; keep canonical body rendering, route-owned data/actions, loading,
empty and restricted states. Use a meaningful section/article/div inside the
route's existing main landmark. Do not copy sample business data into the pack.

Declare the surface in `template.json`; finite variants belong under that
surface ID. A new Customizer field needs a default, supported type, consuming
surface metadata and a real `useTemplateSettings().get(...)` consumer. Add
`data-customize="module.field"` to its meaningful selection target. Read the
existing schema before using dotted nested field IDs.

If the requested surface is absent from the catalog, first establish its
route-owned view model and Core fallback, then add the catalog entry and route
`Surface` caller. A manifest entry alone cannot create a working route. Do not
move authorization, loaders or mutations into a pack to make it self-contained.

Run `bun run sync:templates` in Website `apps/web` and inspect both the pack
manifest and generated Admin mirror. Run `template-audit` on the affected
surface and compare the authored content before/after; the template changes
presentation, not stored text or resource identity. Check desktop/mobile,
narrow nesting, keyboard and relevant state variants in the actual Website.

For a disposable exercise, use the paired directory layout described by
`template-build` and copied sync/check scripts. Report declared coverage,
fallbacks, rendered behavior and remaining acceptance separately. A wrapper
that delegates to Core is valid reuse, but is not evidence of a newly designed
composition or a completed new surface contract.
