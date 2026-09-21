# SDK primitives foundation — accepted handoff §§3.3–3.4

Implemented only under `ConvexPress-Website/apps/web/src/templates/sdk/primitives/`. Current pack surfaces, registry/codegen, dependency locks, provider state, and live pages were not changed. No commit, deployment, browser, or native process was run by this agent.

All **25** names in the handoff's literal vocabulary are implemented: Section, Container, Stack, Grid, Columns, Split, Card, Heading, Eyebrow, Text, RichText, Image, Video, Icon, Button, Link, Badge, Divider, Stat, Quote, List, Accordion, Tabs, Marquee, Slot.

- `contracts.ts`: strict Zod source, inferred closed TS props, JSON Schema `primitivePropDefinitions`, and authoritative runtime `validatePrimitiveProps`. Unknown CSS/DOM/event fields, unsafe protocols, oversized aggregate payloads, invalid responsive counts, and duplicate tab/disclosure IDs fail. Primitive alignment may use end; instance layout alignment remains start/center per handoff. Generator owner was sent this exact importable vocabulary; it has no React runtime dependency.
- `index.tsx`: validated public primitives, selected-pack-only resolver/provider, explicit baseline exports, slots, and `BlockRenderProps<Attrs, Data>`. Missing overrides use the SDK baseline. No pack inherits another pack. Self-wrapping or mutually recursive overrides terminate at the baseline for an already-active primitive name.
- `base.tsx` / `primitives.css`: semantic, token-based baseline using the fixed handoff layout variables. Responsive columns/splits, deliberate display typography, bounded image view models, native controlled video, safe CTA links, caption support, stat/quote/list treatment, native disclosures, accessible keyboard tabs, and user-controlled marquee.
- Motion: no new library or lock changes. Website has no dedicated motion package; CSS transform/opacity supports the bounded foundation. Reveals are opt-in; marquee starts paused; reduced-motion rules disable animation and duplicates. No permanent will-change or animated layout/filter/gradient properties. Source verified against [web.dev's rendering guidance](https://web.dev/articles/animations-guide) and [MDN's reduced-motion behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).

Evidence:

- Initial missing-implementation regression: `/tmp/primitives-red.log`.
- Final tests: `/tmp/primitives-final-verified-tests2.log`: **9 passed, 84 Bun assertions**, plus isolated jsdom/node assertions. Every named primitive renders; hydration does not replace markup; tab controls support arrows/Home/End and keep one selected visible panel; disclosures expose native summaries; marquee toggles play/pause; CSS includes reduced-motion and compositor-property safeguards; resolver does not leak another pack or recurse.
- Website typecheck and lint: `/tmp/primitives-final-verified-types2.log`, `/tmp/primitives-final-verified-lint2.log`, exit 0.
- Scoped diff check passed. These are new, isolated source files.

Remaining integration is explicit: discover compatible pack parts in the future block registry, generate/validate compositions using this vocabulary, route resolved page data into Library renderers, and migrate all existing block treatments. Existing Journal/Depot parts accept broad DOM props and were intentionally not auto-registered.

RichText currently accepts paragraphs and inline marks; unsupported legacy TipTap structures fail rather than lose content. Lossless full content migration remains a separate required adapter. Accordion/Tabs body values are plain text in this bounded contract; richer nested compositions require an explicit declared slot/schema extension. The JSON Schema representation cannot express unique IDs across object entries or the aggregate byte cap, so compositions must use the exported authoritative validator as well.

**Visual acceptance remains pending:** parent-owned BlockDemo desktop/mobile screenshots under each pack, actual native reduced-motion and screen-reader checks, and measured frame timing. Static/DOM proof does not establish gorgeous rendered design or stutter-free GPU behavior. No existing page was visually changed by this foundation.
