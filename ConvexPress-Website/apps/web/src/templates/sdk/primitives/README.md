# SDK primitive foundation

The 25 names from the accepted handoff are implemented here as the shared block-rendering foundation. Library renderers and installed template overrides consume this vocabulary. Committing this foundation does not establish acceptance of every consuming block, template or live data adapter.

`contracts.ts` re-exports the portable copy of the canonical backend foundation contract: strict Zod objects produce `PrimitiveData<K>` and `primitivePropDefinitions` JSON Schema. `validatePrimitiveProps` is the authoritative runtime check, including uniqueness of Accordion/Tabs item IDs. Composers must call it even after validating a JSON Schema representation. It rejects unknown fields, arbitrary DOM attributes, class names, style objects, event handlers, unsupported numeric values, and unsafe URL protocols. Layout instance alignment remains `start | center`; individual primitives also offer `end` where useful.

`index.tsx` exports every validated primitive, `PrimitiveProvider`, `createPackPartsRegistry`, `BasePrimitives`, and `BlockRenderProps<Attrs, Data>`. Library renderers receive attrs/resolved data/layout/style/children/packId and wrap section-level structure with `Section`. Data access and composition expression evaluation are separate consumers and are not part of this module.

```tsx
const parts = createPackPartsRegistry({
  journal: {
    Heading: props => <BasePrimitives.Heading {...props} size="display" />,
  },
});
<PrimitiveProvider packId="journal" registry={parts} slots={{ aside: <Text>A note</Text> }}>
  <Section layout={{ width: "wide", spacing: "spacious" }} label="Field notes">
    <Stack gap="lg">
      <Heading level={2}>From the journal</Heading>
      <Slot name="aside" />
    </Stack>
  </Section>
</PrimitiveProvider>
```

Resolution uses only the selected pack's registered override or the SDK baseline. There is no parent-pack/Core fallback. An override calling its public primitive resolves that name to the baseline while it is already active, preventing recursive overrides; other primitive overrides remain available. Prefer explicit `BasePrimitives` calls when extending the same primitive. Template parts must be registered explicitly against this contract; older surface components with broader DOM props are not automatically eligible.

Structure: Section, Container, Stack, Grid, Columns, Split, Card. Type: Heading, Eyebrow, Text, RichText. Media: Image, Video, Icon. Actions and labels: Button, Link, Badge, Divider. Content: Stat, Quote, List, Accordion, Tabs, Marquee, Slot.

- Button is a navigational CTA with a required href; mutation actions are not accepted from runtime compositions. Link and Button announce new-tab behavior.
- RichText consumes the generated canonical rich-text schema: paragraphs, text/hardBreak, and bold/italic/strike/underline/code/safe-link marks including target. `inline` renders one paragraph’s content without nesting a paragraph inside a heading or list. Unsupported legacy TipTap nodes are rejected, never silently discarded. Lossless content migration/rendering adapters remain required before integrating it with arbitrary existing articles.
- Media receives resolved public src/alt/dimensions; these are view models, not database IDs. Image is lazy by default, reserves supplied dimensions, and supports a priority opt-in. Video uses native controls, no autoplay, and optional caption tracks.
- Accordion uses native details/summary. Tabs have roving focus, arrow/Home/End navigation, stable hydration IDs, and hidden inactive panels. Tabs and Accordion body values are plain text in this bounded contract; richer compositions can extend their declared schemas and slot model later.
- Marquee contains text only, starts paused, provides play/pause, pauses on content hover, and has no interactive duplicate. Reduced motion disables its animation and hides the duplicate.

The baseline reads exactly the handoff's fixed layout variables with fallback values: `--block-gap`, `--section-py-compact`, `--section-py-default`, `--section-py-spacious`, `--section-max-contained`, `--section-max-wide`, `--stack-gap-sm`, `--stack-gap-md`, `--stack-gap-lg`, `--grid-gap`, `--card-pad`. Brand, radius, and display-font tokens use the site's existing variables. There are no arbitrary CSS props or additional public layout variables.

Template defaults and the standard Customize Layout module now feed those variables through `settingsModules.ts` and its closed `blockLayoutCss` mapper. Section spacing, content spacing, inter-block spacing and content width can vary independently. See `block-kit/references/style-and-compose.md` for the accepted choices and pack defaults.

Motion uses native CSS with opt-in Section reveal and transform/opacity transitions. No permanent `will-change`, filter animation, layout-property animation, or raster gradient is introduced. This follows the [browser rendering guidance](https://web.dev/articles/animations-guide) and [native reduced-motion preference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion). Website had no motion package; no dependency or lock was changed. Complex coordinated motion can be evaluated separately against measured browser performance.

Verification: `bun test src/templates/sdk/primitives`, `bun run check-types`, `bun run lint`. DOM tests run in an isolated jsdom process and verify hydration, focus, selected/hidden panels, disclosure markup, and motion controls; CSS checks verify reduced-motion rules and restricted animation properties. They are not a browser screenshot or GPU frame-time test. Desktop/mobile visual review, native reduced-motion behavior, screen-reader behavior and frame-time acceptance remain separate gates; these tests alone do not establish them.
