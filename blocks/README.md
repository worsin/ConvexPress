# Schema-first block foundation

`blocks/<namespace>/<name>/block.json` is the canonical contract location. This is the staged Phase 1 foundation from `specs/handoffs/HANDOFF-ASTRA-BLOCKS-2026-09-05.md`. Existing runtime registries, renderers, backend modules and saved block trees are not switched by these commands.

From the monorepo root, after installing the existing Admin workspace dependencies:

```sh
bun run sync:blocks
bun run test:blocks
bun run check:blocks
bun run check:blocks --tracker
# Explicit offline evidence, without a live MagicTables read:
bun run check:blocks --tracker-file ConvexPress-Admin/output/blocks-tracker/inventory-verified-2026-09-05.json
```

Root tooling resolves the Admin workspace's pinned Zod compiler. It creates no second dependency installation or workspace lockfile. `check:blocks` also runs the existing runtime catalog/schema drift checks in their correct working directory.

## Source and discovery

Every contract uses the same closed schema. `scripts/blocks/schema.mjs` validates allowed keys and field types, duplicate IDs, bounds, typed defaults, examples, preview fields, resolver attribute bindings, and nesting/work budgets. Generated `block-spec.schema.json` provides structural editor assistance; the compiler's semantic checks are also required.

Discovery scans these conventions without block-name registries:

- `blocks/<namespace>/<name>/block.json` (core or portable Library).
- `extensions/<plugin>/blocks/<name>/block.json`, `plugins/<plugin>/blocks/<name>/block.json`, and the current Admin backend extensions root.
- `packs/<pack>/blocks/<name>/block.json` and the current Website template packs root.

Plugin and pack block names must match their owning folder namespace. Duplicate names or pack IDs, inconsistent ownership, and symlinks fail. Existing renderer-only pack folders are not treated as definitions. All paths in artifacts are relative to this root. Pack discovery feeds coverage and the future internal BlockDemo; no list of blocks is frozen in code.

The full intended inventory is the **Standalone** MagicTables Blocks table from handoff §6a. The checked-in spec subset is not the complete inventory. Live tracker mode checks exact base/table IDs, required field identities, complete bounded pagination, duplicate rows, names and spec paths. An explicitly supplied snapshot is labeled as a snapshot. Planned rows without specs remain valid. A `Verified` row additionally requires its spec, a nonempty test file in its block folder, and a PNG screenshot under every discovered pack at `ConvexPress-Admin/output/playwright/blocks/<pack>/<namespace>/<name>.png`. This existence gate does not itself execute visual acceptance or certify test results.

## Field storage contracts

All object shapes reject unknown keys. Optional fields remain absent unless a default is declared; defaults apply only to missing values. `nullable: true` explicitly admits null. Required fields without defaults must be supplied. No coercion is performed.

| Type | Stored value / constraints |
|---|---|
| text | String; optional explicit min/max length; omitted limits preserve the source contract |
| number | Finite number; optional integer and min/max |
| boolean | Boolean |
| select | One string or number from a homogeneous, unique `options` array; numeric values stay numeric |
| richtext | TipTap `doc` containing paragraphs and text/hardBreak nodes; bold/italic/strike/underline/code/link inline marks; bounded text and nodes |
| link | `{label, href, newTab?}` or explicit `storage: "href"` string. HTTP(S), relative, anchor, email or telephone only; control characters, backslashes, malformed/active schemes rejected. `allowEmpty` preserves an unset href |
| media | `{id, alt?, focalPoint?: {x, y}}`; normalized focal coordinates 0–1. Explicit `storage: "id"` preserves a flat ID string; `allowEmpty` preserves its unset sentinel |
| icon | Bounded lowercase icon identifier, no markup |
| color-role | `primary`, `accent`, or `muted` |
| date | A real `YYYY-MM-DD` date or UTC ISO date-time |
| reference | Portable ID string plus required spec `of`: product/post/page/category/course/event/tag/user. `storage: "slug"` identifies slug references; `allowEmpty` preserves unset values. Tags require target-taxonomy resolution; users require a reviewed target-author mapping, never customer identity copying |
| menu / form | Nonempty portable ID string |
| object | Closed nested field object |
| repeater | Array of closed nested field objects (`fields`) or scalar values (`item`), with optional explicit min/max. Scalar item has an editor ID but stores the value directly; exactly one representation is required |

The prose-only rich-text contract does not authorize lossy migration of legacy structural TipTap nodes. Those need the separate content-model migration. ID fields describe references; tenant ownership and target record existence remain backend responsibilities. A resolver declaration names data needs and binds declared attributes; it does not authorize or execute a resolver. The allow-listed server resolver registry is a later integration boundary.

## Generated activation contract

All outputs are staged in `blocks/.generated/`. Generation is deterministic, validates examples first, and writes individual files atomically with the hash manifest last. Check mode detects field changes, output edits, missing files, and unexpected stale output. No application source is mutated.

| Artifact | Consumer contract |
|---|---|
| schemas.ts | `blockSchemas[name]` and `validateBlockAttrs(name, input)`; unknown names fail closed; parsing applies constraints/defaults |
| types.ts | `BlockName`, `AttrsByName[Name]`, `InputAttrsByName[Name]` |
| convex.ts | `blockAttrsValidators[name]` for structural argument validators; **also call its re-exported `validateBlockAttrs` before saving** for bounds, safe links, dates and defaults, which Convex validators cannot express |
| catalog.json | Every discovered spec's fields, normalized examples, role/category, AI hints, data declaration and source provenance |
| editors.json | Closed field descriptors, preview, supports and inserter metadata for the future generic editor; no new editor UI is mounted |
| metadata.ts / dependencies.json | Pure `dependencyDescriptors` keyed by exact name; see below |
| coverage.json | Discovered blocks, categories, normalized examples and packs for BlockDemo/matrix generation; missing renderer is null and treatments remain `not-verified` |
| manifest.json | Canonical spec and artifact hashes; no timestamps or machine paths |
| migrations.json | Per-name versioned transformation descriptors; never permission to run a migration without its preflight and render acceptance |

Dependency descriptor:

```ts
{
  version: number,
  fields: Array<{
    path: string[], // ["cards", "*", "details", "image"] — "*" visits a repeater item
    type: "media" | "reference" | "menu" | "form",
    of?: "product" | "post" | "page" | "category" | "course" | "event" | "tag" | "user",
    valuePath: string[], // ["id"] for structured media; [] for direct IDs
    storage?: "id" | "slug", // slugs require lookup policy, not ID substitution
    allowEmpty?: boolean // an empty sentinel is not a dependency
  }>,
  data: null | { resolver: string, args: Record<string, unknown> },
  supportsChildren: boolean,
  source: string,
  provenance: { kind: "core" | "library" | "plugin" | "pack", owner?: string }
}
```

Before activation, migrate the remaining inventory, wire generated modules into the existing shared catalog and both apps, switch server writes to generated shape **and** semantic validation, consume reference metadata in promotion, and preserve enabled-plugin/disabled-block policy. Copy/import `field-runtime.mjs` and its declaration alongside schemas; runtime artifacts contain no Node APIs. Backend codegen and packaged payloads must include the activated outputs. Preview, rendering, resolver execution, `children`, and article migration remain separate work. Do not remove old contracts until compatibility and saved-data preflight pass.

## Representative block

`events/upcoming` retains its existing name, version 1, five attributes and defaults. Its local contract regression compares generated parsing with both current application schemas. It contains no copied event IDs or invented event records. The declared `events.upcoming` resolver is staged metadata; current event rendering/query behavior is untouched. Its Library renderer and screenshot matrix are pending, so it is not marked Verified.

## Existing inventory migration checkpoint

The current inventory is 38 core plus 16 discovered portable/local definitions. All 54 now have canonical specs: 44 declare an explicit v1-to-v2 migration and 10 retain v1. `blocks/.migration/existing-contracts.json` accounts for every definition with source hash, tracker row ID, transformation metadata and Website schema/default differences. It is a migration report, never a runtime registry or executable fallback. The full intended tracker still contains 136 blocks.

The one-time extractor `scripts/blocks/migrate-existing.ts --write-representable` writes only missing compatible specs. The explicit `--write-staged` mode updates owned canonical specs with versioned transformations for understood legacy contracts. Unknown refinements still block; known URL refinements become safe href contracts rather than arbitrary URL acceptance. Media IDs and scalar arrays preserve their storage shape. Table-header `columns` remain content; numeric grid column settings become pack-treatment requirements. Invalid empty copy defaults become explicit nullable absence while real text retains minimum-length validation. This is a version change, not relaxed v1 validation.

`scripts/blocks/staged-migration.mjs` is tool-only pure migration preparation; it writes nothing. `migrateLegacyBlock` takes the original block, new spec, current legacy/Website schemas, exact source/target environment, optional active pack and trusted treatment/reference resolvers. It materializes the **actual old Website defaults** before transformations and returns `{block, revision: {original, sourceScope}, legacyRender: {name, version, attrs}, activation: "requires-render-acceptance"}`. Preserve both revision and legacy render projection until new rendering is accepted. Unsafe/oversized/unknown data fails before lookup hooks; no truncation occurs. Nested legacy trees require their separate migration. Cross-environment use is refused; this is not promotion.

Thirteen blocks remove design attrs only after a treatment resolver confirms the exact old values, active pack and environment, and supplies a verified named style. This includes per-item side/size, columns, orientation, spacing, fonts and visual variants; semantic alert variants remain content. A generic "verified" flag from an untrusted client is not authority: the future server integration must obtain this evidence from accepted pack treatment records. Nonempty user references require reviewed author mappings bound to the exact source value and target; customer, guessed/email, wrong-target and unreviewed mappings fail. Nonempty tag references require the intended target tags taxonomy and storage form. Empty sentinels remain empty.

`bun run check:blocks-migration` remains a **currently failing activation gate**, now for 44 pending renderer/treatment acceptances and 36 Website schema differences (7 default differences), not absent specs. The staged converters/tests give a concrete normalization path, but actual stored-content preflight, revision persistence and renderer comparison remain necessary. Runtime registries, saved records, rendering and registered Convex modules are unchanged.

### Planned inventory checkpoint (September 5)

The complete verified inventory now has 136 canonical specifications: 54 migrated
existing definitions and 82 newly authored planned definitions. Schema presence
is not renderer, resolver, plugin or production readiness. The generated coverage
file discovers renderer source and always leaves pack treatment acceptance
unverified until the separate rendering/evidence gate. Tracker update suggestions
for the new contracts are in `.migration/planned-contracts.json`; tooling does not
write to MagicTables.

New structural containers store children through the shared tree contract; they
have no width-in-pixels, ratio, gap, breakpoint, visual column count or motion-speed
attrs. Media references are intentionally unresolved in draft examples. Business
prices remain editorial labels. Per-viewer commerce, membership and learning data
must come from authorized request context, never a viewer ID/token in attrs.

Optional `requires: { plugins, capabilities }` declares runtime prerequisites and
is copied into catalog, dependency metadata and coverage. Capabilities form a
closed vocabulary: `html.sanitize`, `embed.sandbox`, `embed.approvedScript`,
`feed.approvedProvider`, `map.approvedProvider`, `viewer.authorization`,
`form.submission`, `tree.children`, `locale.routing`, and
`reference.targetResolution`. Consumers must fail when a required adapter or
contract is unavailable. A renderer file does not satisfy these contracts by
itself. HTML is still untrusted text until sanitized; HTTPS iframe URLs still need
an approved host and sandbox; script embeds accept only a fixed provider and
resource identifier, never arbitrary executable configuration.

Reference targets now also include `bundle`, `membershipPlan`, `recipe`, `album`,
`syncedBlock`, `mailingList`, `poll`, and `instructor`. These are truthful semantic
identities, not assertions that a same-named table exists. Promotion/resolution
must use an explicit target-owned adapter, refuse missing adapters, and preserve
the reviewed author/customer identity boundary.

The compiler also emits closed cross-field `constraints` for matrix row widths,
unique row keys, ordered values, non-overlapping intervals and mutually exclusive
sources. Constraints may live on a specification or an object/repeater row;
references must point to compatible declared fields. Text formats `timezone`,
`anchor`, and `resource-id` are validated. Optional link `protocols` narrows the
existing safe protocol set. For example, business phone links allow only `tel`,
email links only `mailto`, and iframe URLs only HTTPS. These checks run in the
same generated Zod validators used to validate examples; Convex shape validators
still require subsequent `validateBlockAttrs` for semantic checks.

### Inline content refinement

The unactivated v2 `core/paragraph.body` and `core/rich-text.body` fields now store
`RichTextDoc`. `core/heading.text` and `core/list.items[].text` store the same doc
with `inline: true`, limiting it to at most one paragraph. This is one canonical
storage vocabulary, not a parallel editor model. The generated helper exports
precise `RichTextDoc`, `RichTextInline`, and `RichTextMark` types and is also
consumed directly by the Website SDK primitive contract.

Migration `text-to-richtext` has four closed modes: `plain-prose`,
`markdown-prose`, `plain-inline`, and `markdown-inline`. The converter follows the
actual old Website behavior: paragraph/list support only its original bold,
italic and HTTP(S) Markdown token grammar; rich-text/heading strings remain
literal. Prose splits/trims blank-line paragraphs as the old renderer did. The
revision and legacy render projection retain the exact original strings. The
converter does not interpret arbitrary HTML or a larger Markdown dialect.

Canonical rich text preserves bold, italic, strike, underline, code, safe links,
and hard breaks. Structural headings, nested lists, images, tables, alignment
attrs and other editor nodes cannot be silently stuffed into a prose doc; the
separate stored-document/tree migration must map each supported node to canonical
blocks or fail with a path. Plain-text fixture acceptance is not full article
migration acceptance. New rendering must prove semantic marks and preserve inline
heading/list markup without nested paragraph tags before activation.
