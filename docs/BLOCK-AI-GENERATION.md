# ConvexPress Block AI Generation

AI generation uses the block catalog as its contract. The AI may only emit
registered, enabled block names and attrs that plausibly match the catalog.

Current protections:

- disabled blocks are excluded from the page-generation prompt
- disabled target block types are rejected during AI swap
- existing disabled blocks remain editable/renderable; disabling only prevents
  new insertion and AI generation
- unknown block names are discarded
- generated attrs are checked against catalog field limits, primitive types,
  enum literals, and array-vs-scalar shape
- generated page block count is capped
- singleton hero-like blocks are deduplicated
- failed AI output does not replace page content
- replacing an existing page uses a generated-block preview before applying

Future improvement:

- generate the backend AI catalog directly from block metadata so frontend and
  backend contracts cannot drift
- feed schema-validation errors back to the model for one repair attempt
- stream partial block generation as the model responds instead of inserting
  progressively after a complete JSON response
