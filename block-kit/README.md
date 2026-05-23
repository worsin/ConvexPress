# ConvexPress Block Kit

The block kit is the working contract for adding Gutenberg-style blocks to ConvexPress. Blocks are TypeScript-first content modules with a shared schema, an admin editor, a public renderer, and Convex-safe serialized data.

## Required Pieces

- A stable block name, usually `namespace/block-name`.
- A Zod attrs schema with defaults.
- An admin editor that edits only `attrs` and calls `onChange`.
- A website renderer that treats `attrs` as untrusted until validated.
- A migration function when a block version changes.
- A registry entry in both apps when the block should render publicly.

## Current Core Blocks

- `core/hero`
- `core/rich-text`
- `core/feature-grid`
- `core/cta-band`
- `core/media-text`
- `core/testimonials`
- `core/pricing-cards`
- `core/faq`

## Rules

- Never store React component state as content. Store JSON-safe attrs only.
- Do not hardcode brand colors. Use existing design tokens.
- Keep block attrs portable between admin and website.
- Add versioned migrations instead of changing persisted data shape silently.
- Use Convex block mutations for live persistence.

