# Core

Core is the neutral, configurable ConvexPress default and the fallback for surfaces other templates do not implement. It should make authored content easy to read and provide a practical starting point for a business, publication or store.

## Composition

Use contained sections, readable text measures and clear heading levels. Start with a simple vertical stack; use responsive grids or a balanced split when the content benefits from comparison or an accompanying image. Keep a single primary action per section, with secondary actions visually quieter. Cards should group related information, with restrained outlines or muted fills rather than decorative layers.

## Theme and typography

Consume the selected theme through the SDK primitives. The Clear preset has a white canvas, dark slate text and blue primary actions. Midnight uses a dark slate canvas, light text and pale blue actions. Both palettes are customizable: never hard-code these colors into a block. Inherit the user's typography choices and use the primitive heading, body size, spacing, tone and width options to establish hierarchy.

## Content and behavior

Keep existing fields and resolver bindings as the source of text, media, prices and other live information. Do not invent photographs, product claims, links or identifiers. Use semantic headings, meaningful control labels, visible focus and mobile layouts without horizontal overflow. Essential content must be accessible without animation. Use only the SDK's supported motion treatment and respect reduced motion.

## Custom-block treatments

A treatment may rearrange the primitive composition, spacing, alignment, image proportions and visual emphasis. It must preserve the block's field schema and default composition. Use Section, Container, Stack, Grid, Columns, Split and Card to organize the existing content; bind text and other values through the supported expression language. Do not introduce CSS, class names, JavaScript, component imports or host-owned identifiers.
