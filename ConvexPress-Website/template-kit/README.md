# Template kit

Build a reusable visual pack; author the business in the CMS. The public route owns data, SEO, authorization and mutations. A pack receives the resulting SDK view model and controls composition.

For everyday native page authoring and Customize publication, use the repository's `block-kit/AUTHORING.md`. The steps below are for developing a new pack.

1. Read [CONTRACT.md](CONTRACT.md), the target Core surface's exported data type and the site's authorized brand brief.
2. From Website root: `bun run create:template --id my-pack --name "My pack"`. Add `--from aster-house` (or another installed pack) for a complete editable starting point. Existing packs are never overwritten. `--dry-run` prints the destination without writing.
3. Edit `apps/web/src/templates/packs/my-pack/surfaces/` and its own `parts/`. Record the design direction in `DESIGN.md`. Use manifest defaults/presets and Customize fields for variation.
4. In `apps/web`, run `bun run sync:templates`, `bun run check:templates`, `bun run check:templates:ssr`, `bun run check-types`, and `bun run lint`. The SSR command builds locally without starting a server or contacting a backend; it renders each installed home's loading fixture, Aster's authored title/media cover, selected surface hydration and compatibility studies, plus the real lazy canonical renderer with nested, reusable and runtime-composed fixtures in all four default packs. It does not certify every surface's loaded/authenticated state.
5. Activate or preview the pack on an authorized staging site. Run `node scripts/template-screenshots.mjs --base-url <site> --pack my-pack --cases <cases.json> --output <folder>` from Website root. The operator supplies real fixture routes and any authenticated storage state. Review screenshots, access gates and form/cart workflows before promotion.

References: Core demonstrates contracts; [mini-pack](references/mini-pack) is annotated; Aster House demonstrates an authored cover, portrait commerce and a complete token-driven pack. Existing `design-*` skills now target these pack surfaces.

No kit command deploys, changes provider settings or activates a template. Schema and site deployment remain owned by ConvexPress-Admin.

Repository skills: `template-build` creates a pack, `template-add-surface` extends
its SDK coverage, and `template-audit` verifies its contracts and actual consumers.
`check:templates` checks synchronization without writing; a stale Admin mirror is
a failure. Use `node ../../scripts/sync-template-packs.mjs --check` from `apps/web`
for just that boundary, then explicitly sync and review changes when repairing it.
New packs must be included explicitly in lazy resolver/loaded-state trials; the
four default packs' fixture coverage does not certify an added pack. Internal
legacy-treatment comparisons show an unavailable state for packs that have not
declared those treatments; they do not grant treatment support automatically.
