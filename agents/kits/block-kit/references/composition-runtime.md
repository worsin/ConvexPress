# Runtime composition foundation

The engine, immutable definition storage, canonical document lifecycle, public rendering and version approval are implemented in the hardening source. Saved custom blocks use exact version contracts; approved custom blocks can be discovered and inserted in the native editor. Both paths are deployed and save/reopen verified on the isolated fleet target; cloud production deployment remains open. Native definition creation, source editing and exact-version approval are implemented and verified on the isolated target. Visual composition and all15 field-type controls, AI generation and pack styling now have separate native/Website acceptance checkpoints. SDK promotion source, native export/confirmation and deployed end-to-end acceptance are verified for the static Studio Services block; resolver/media/child-slot acceptance remains open. See promotion.md.

## Authoritative implementation

Admin `packages/backend/canonical-blocks-foundation/primitiveContracts.ts` owns the same25 closed primitive schemas used by Website. `composition.ts` validates/evaluates the tree; `compositionExpressions.ts` owns the limited expression grammar and JSON ingress guard. The existing sync pipeline copies these exact files to the backend source and Website portable graph. Website `src/templates/sdk/block-renderer/composition.tsx` renders the resolved tree through public primitives, so the active pack's parts apply.

`validateComposition(unknown)` returns a copied validated definition. `resolveComposition(definition, {attrs, data}, {allowedSlots?})` returns a fully evaluated primitive tree or null for a false root condition. `CompositionView` resolves before rendering any React element. These pure functions perform no database read, authorization decision, network request or mutation. Callers must supply attrs validated against the definition and data from the authorized, scope-bound public resolver projection. Never hand the expression evaluator a private record and rely on it to remove secret fields.

## Authored JSON

A definition is `{version:1, root:{el, props?, bind?, if?, each?, as?, children?}}`. `el` is one of the25 SDK primitives; props use its exact closed schema. DOM attributes, event handlers, class names, CSS and host-owned blockId are rejected. Only Section, Container, Stack, Grid, Columns, Split and Card accept child nodes. Heading, Eyebrow and Text require a string-expression bind; other bindings map primitive property names to expression strings. A property cannot be specified in both props and bind.

Examples of expression strings:

- `attrs.title`, `data.products`, `product.title`: own-property paths; roots are attrs, data and enclosing loop aliases.
- `'Shop ' + product.title`: text concatenation of strings and finite numbers.
- `currency(product.amount, product.currency)`: integer minor units, three-letter uppercase currency; currency-specific fraction digits. Maximum absolute amount is10^12.
- `date(attrs.date)`: actual ISO date or UTC timestamp. Display timezone is UTC.
- `plural(attrs.count, 'item', 'items')`: nonnegative integer and singular/plural labels; returns the count plus the selected label.

Single- and double-quoted literals support escaped quotes/backslashes, newline and tab. Numeric, true/false and null literals are recognized. There is no property indexing syntax, arithmetic, comparison, arbitrary call, JavaScript, interpolation, eval or host/global lookup. The parser must consume the entire expression. Formatting currently uses deterministic en-US output; site-locale-aware formatting remains future integration work.

`if` is an expression that must resolve to a boolean. `each` must be an array path and have a distinct `as` alias. **The host container renders once and its children repeat for each item.** Its props and if evaluate in the parent scope; its children see the alias. This makes a Grid with each produce one grid of cards. Aliases cannot shadow attrs/data, enclosing aliases, reserved names or formatter names.

Source depth is at most8 with300 nodes. Each collection has at most100 entries; expanded output has at most300 nodes and512KiB. Separate evaluation work limits stop nested hidden loops from consuming unbounded work. JSON input is copied with bounds before parsing; cycles, getters, functions, symbols, prototype keys, sparse arrays and nonplain objects are rejected. Repeated rendered anchors and duplicate Tabs/Accordion item IDs fail. Slot names require an explicit host allowlist and a corresponding safe provider slot.

## Working example and tests

`ConvexPress-Website/apps/web/block-demo/composition-study.tsx` contains an authored product-card definition plus clearly synthetic data; it uses the existing fictional BlockDemo catalog and real detail links. Visit `http://127.0.0.1:4318/?pack=journal#runtime-composition` while the owned BlockDemo server is running. Ready, empty, unavailable-item and rejected-link fixture choices are available. No purchases or live resolver calls occur.

- `bun test ./scripts/blocks/composition.test.ts`: grammar, input, property, loop, bounds and slot behavior.
- Website renderer fixture runner: actual composition rendering under all four installed packs, content/price/link output and rejection before rendering.
- `block-demo/browser/composition.pw.ts`: desktop/mobile states, decoded images, template ownership, no overflow, keyboard detail navigation and Back.

Current storage/authorization integration must retain independent website databases, revisioned definitions and scope-bound public data. New composed names must be integrated into canonical validation, generated-editor/catalog behavior, snapshots and recovery without weakening existing unknown-name rejection.

## Versioned draft definitions

The shared `generated/spec-runtime.mjs` compiler parses the same BlockSpec used
by the Library, without Node imports or runtime code evaluation. Its interpreted
attribute schemas are regression-checked against the generated schemas for all
136 blocks and 275 examples, including invalid inputs. Specification ingress
rejects non-JSON values, getters, cycles, unsafe keys, excessive nesting and
payloads over 128KiB of UTF-8 JSON.

`composedDefinitions.ts` validates `{spec, composition, packTreatments?}`, requires
`composed/<slug>` names, checks all composition trees, and executes examples that
do not require resolver data. Canonical encoding and SHA-256 bind the exact
schema, version, composition and pack treatments. Saved definitions are limited
to 480KiB to leave room for their database envelope. Resolver-dependent examples
still require a separate authorized preview/activation review.

The backend now has source implementations of `blockDefinitions` and
`blockDefinitionVersions`, plus public draft create/save/get/history/restore
handlers used by the native Custom Blocks screen. Explicit `blocks.compose` and action-specific post capabilities and exact installation identity are checked on
every call. Other authors require an Editor-level role as well as the relevant
capability. Saves append the next explicit spec version; they never replace an
old version or change an active pointer. Restore appends a new version of the
reviewed content and can recover a damaged latest draft. History reads four
version bodies plus one lookahead per request.

The native Custom Blocks screen provides bounded author-scoped inventory, heading starter creation, validated definition-source editing, immutable history, restore and exact-version approval/revocation review. Inventory queries use a scope-and-author index for authors; Editor-level roles can review other definitions within the same installation. Creating a draft does not approve it. Native creation, edit and approval/reopen were verified on the isolated target; native custom insertion and document save/reopen were verified separately. Export/promotion, AI actions, visual composition authoring and full public interaction acceptance still require integration.

## Exact-version authoring registry

`composedRegistry.ts` now builds a bounded registry from scoped definition
snapshots. It validates each digest and name/version identity, rejects duplicate
versions and other installation scopes, and returns copies of definitions.
`snapshotFor(tree)` selects only the versions referenced by a validated tree.
Two instances can intentionally use different versions of the same composed
name; neither inherits defaults from the current definition head.

The canonical instance engine has an explicit `resolveComposedBlock(name,
version)` extension. It is consulted only for `composed/<slug>` names absent from
the installed catalog. Installed Library names keep their generated validators,
and the existing static tree validator still rejects all composed names. Extended
trees retain the same80node/eight-level/512KiB limits, closed attrs, supported
layout/children rules, and declared page-wide anchor checks. Custom treatment-axis
selections currently fail because they are not yet bound into the composition
renderer; pack-specific composition trees remain part of the definition.

The backend `loadAuthoringComposedRegistry` service reads exact versions from the
current installation after checking current authoring permissions. Owners and
administrators can use drafts; other site editors can reuse only exact approved
versions. Reuse never grants permission to edit or approve a definition.
It deduplicates repeated references and caches heads within the request, checks
stored integrity, and caps aggregate snapshots at512KiB. It accepts a canonical
tree, never a client-supplied schema or snapshot as authority.

The registry is connected to canonical document saving, revision recovery,
resource/data loading and Website rendering. The native editor uses exact scoped
definition contracts for saved custom blocks, including field validation and
resource-picker validation. Saves send authored blocks, never client definition
snapshots as authority. The server loads the immutable definitions again.
Removing the last custom block clears unused snapshots. The Custom blocks picker
lists approved-version metadata in bounded pages and retrieves one exact schema
on selection. Both endpoints check the document's current revision, edit authority
and installation; selection rechecks approval and digest. The preferred version
never replaces older placements. New schemas are merged into the local draft;
site/session changes discard outstanding responses. Native acceptance covers
insertion, field editing, save, reopen and actual Website iframe rendering.
Custom synced occurrences, duplicate/layout and
promotion paths, full presentation preflight and navigation parity remain open.

## Version approval and public interactions

`blockDefinitionApprovals` records approval separately from immutable versions.
The public `setVersionState` mutation requires current `blocks.compose` and publish/update
capabilities, definition ownership or administrator authority, the expected head
generation and the exact reviewed digest. Approving a new version never changes
existing pages; revoking one version preserves other approved versions. A head's
activeVersion is a placement preference, not public authorization.

`loadPublishedComposedRegistry` checks the current installation, immutable stored
version and active approval. Publication and scheduled execution check every
authored definition. Public reads first apply page and block access, then check
only visible versions before resolving data/media. Hidden definitions are omitted
from public snapshots. Forms, polls, RSVP and download sources recheck approval
for their custom ancestors, including already-issued download leases.

These paths have actual-schema regression coverage in
`convex/blockDefinitions/__tests__/publication.test.ts` and
`convex/canonicalDocuments/__tests__/composedDocuments.test.ts`. They still need
full native/public acceptance; saved custom field editing and save/reopen were
verified in Electron against the isolated target database on September 16.
Native definition creation and approval now have separate Electron acceptance evidence in `output/composed-authority-20260916`. The capability catalog includes compose/AI/promote. Compose guards definition management. Existing block AI actions now require blocks.ai before provider calls, recheck access before returning proposals and recheck permission/enablement atomically at writes. Structured canonical AI has one Core/OpenRouter native generation/review/preview/apply/reopen acceptance; custom creation and styling have separate Journal/OpenRouter acceptance. Promotion still needs editor and deployed end-to-end acceptance; see structured-ai.md and promotion.md. Seed defaults grant compose/AI to new Editor roles and all three to new Administrators; existing roles are preserved and require explicit capability grants. Approved page-editor reuse does not require compose. Retained revoked definitions
are readable by owners/administrators; ordinary-editor recovery after revocation
needs a saved-document authority path without allowing new revoked placements.
