---
name: block-style
description: Style a ConvexPress block for an installed template, using pack-owned Library treatments or reviewed runtime custom-block treatments.
---

Find the root containing `blocks/` and both ConvexPress applications. Read
`block-kit/CONTRACT.md`, `WORKFLOW.md` and `references/style-and-compose.md`.
Identify the block, installed pack, its `DESIGN.md`, existing treatment and saved
examples before choosing the implementation path.

- **Library block:** keep its persisted content contract intact. Edit the pack's
  `blocks/<namespace>/<name>.tsx` and owned stylesheet; use SDK primitives, parts
  and tokens. Declare the renderer in `template.json` under `blocks.renderers`.
  A selectable style additionally requires `supports.styles` in the root spec
  and a finite entry in the pack's `blocks.styles`. Named styles require a real
  owned renderer; never expose authored classes or arbitrary CSS as a style.
- **Runtime custom block:** use the native Custom Blocks workbench's template
  styling flow. `blockDefinitions/ai:styleForPack` returns an unsaved proposal
  tied to the exact definition/version/generation/digest and pack guide. Review
  its Website preview, then save the next immutable version through the draft
  workflow. Saving does not approve it or update existing pinned placements.
  Runtime composition may use only the closed SDK vocabulary, never CSS or code.

Keep links, fields, reference IDs, resolver contracts and existing content
semantics unchanged by styling. For a structural/content-contract change, follow
the existing block-add-feature workflow instead of hiding it in a treatment.

Run canonical synchronization and the relevant presentation/renderer checks in
the reference. Inspect desktop/mobile, long and empty content, keyboard focus,
contrast and reduced motion in the actual Website. Prove the selected style in
Electron and switch to another installed pack to check fallback and preservation.
Record the exact pack/style and evidence; a generated proposal or screenshot of
one state is not acceptance for the full block or template collection.
