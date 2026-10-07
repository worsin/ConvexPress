# Template contract · SDK 1

## Files and resolution

`packs/<slug>/template.json` declares id/name/version/sdk, surfaces, variants, modules, defaults, presets and menu-location roles. Each `surfaces/<surface-id>.tsx` default-exports `({data,variant,packId}: SurfaceProps<ViewModel>)`. Resolve in this order: per-surface override, active pack, Core, route fallback. An omitted surface is a deliberate Core fallback; a listed missing file is an error.

A pack may share its own `parts/`. Changes to another pack or shared platform components are a separate scope. Core data types can be imported as types. Do not invent fields or replace protected data with sample values.

## Data and authoring boundaries

- No direct `convex/react`, generated API, provider SDK or Radix imports in surfaces or parts. Read SDK hooks/contexts or passed view models. Writes arrive as SDK actions/callbacks.
- Preserve empty/loading/error/password/membership states, semantic headings, keyboard access, focus visibility, image alt text and reduced-motion behavior. A template must not circumvent a route or data gate.
- Marketing routes and dashboard shells own the single `main` landmark and `main-content` skip-link target. Content surfaces, page layouts, blog layouts and lesson bodies render inside that landmark; use `div`, `article` or a named `section`, including for polymorphic containers. Standalone signup surfaces own their own landmark because they do not use either shell.
- Page composition blocks and rich text remain authored data. Render the existing block renderer; do not flatten or discard stored content. Header/footer/menu settings come from active-pack Customize modules.
- Business names, claims, locations, prices, schedules, photographs, navigation and call-to-action copy belong in site data. Palette, type choices and structural defaults belong in the pack manifest. Generic UI labels such as Search and Continue are template interface copy.
- Use theme-token classes. Color literals live in manifest presets/defaults, never JSX. Optional brand-bound fields use `null` to inherit. Each custom field has a unique id, supported type, default and valid consuming surfaces.

## Drafts and context

`useTemplateSettings().get(module,field)` reads nested dotted fields and reports usage. `Surface` registers the current surface. Stamp a meaningful element with `data-customize="module.field"` for selection. Draft snapshots replace saved override groups before defaults merge; do not layer old saved values beneath a reset.

## Typography scale

The Website and internal BlockDemo compile imported CSS through `apps/web/type-scale.mjs` after Tailwind. Customize selects a finite factor: compact `0.94`, comfortable `1`, spacious `1.06`. Explicit font sizes (including responsive `clamp()` and the size in `font` shorthands) consume that factor. Root font metrics, widths, padding and gaps remain unchanged. Body starts at `1rem` so inherited text participates.

Use imported CSS or Tailwind for scalable typography. `em`, `%` and other font-relative sizes inherit the scaled parent and are left alone; do not multiply them again. Size custom properties should resolve to absolute, viewport/container or `rem` lengths. Mixed parent-relative expressions and ambiguous whole-font/weight variables are preserved; if needed, express the size separately with a `font-size` declaration. Runtime inline/style-element CSS bypasses the build transform and must consume the scale explicitly for absolute sizes. Keep `html`/`:root` sizing separate from text rules; never change root sizing to implement this control.

## Verification layers

Static contract checks recursively inspect surfaces and parts, manifest/field declarations, duplicate ids and SDK compatibility. Typechecking establishes compile-time contracts. Offline SSR renders loading-home fixtures through Vite's actual module graph. Supplied fixture routes plus browser screenshots prove loaded surfaces; auth/member/payment workflows require their own authorized staging acceptance. None of these layers alone means production acceptance.

Screenshot case shape: `[ { "id": "home", "path": "/", "surfaces": ["home","chrome.header","chrome.footer"] } ]`. Use actual record slugs for products, articles and events. Supply `--storage-state` only from an authorized throwaway browser account. Output includes case screenshots and per-surface crops plus an evidence index and a browsable `gallery.html`.
