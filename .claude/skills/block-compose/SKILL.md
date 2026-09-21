---
name: block-compose
description: Create an editable ConvexPress runtime custom block from SDK primitives, preview it with authorized data, and save or approve exact versions.
---

Find the ConvexPress repository root. Read `block-kit/CONTRACT.md`, `DATA-API.md`,
`references/composition-runtime.md` and `references/style-and-compose.md`.
Choose an existing block or pattern when it already expresses the request;
use `composed/<slug>` for a new reusable runtime definition.

Confirm the selected website, isolated environment, installed template and current
compose authority through the native app. For AI creation, select actual resources
through the supplied pickers and call the normal `blockDefinitions/ai:compose`
flow. Do not invent resource IDs, media URLs, prices or resolver names. The action
returns a proposal, not saved content. Review it and use
`blockDefinitions/composeContext:createDraft` with the returned fingerprint and
exact scope/resources to commit it; this rechecks the generation context.

For manual composition, author a BlockSpec with editable fields, meaningful
defaults and executable examples, plus a version-1 primitive composition. Validate
with the shared `encodeComposedDefinition` and the real renderer. Use the native
source/visual workbench and `blockDefinitions/drafts:create` to save a reviewed
definition. A new spec starts at version 1; subsequent saves advance exactly one
version using the current expected generation. Do not bypass AI context checking
by treating an AI response as a manual draft.

Bind content through attrs and authorized public resolver projections. Validate
all examples, null/empty data, loop bounds, links, repeated anchors and any child
slots. Runtime expressions cannot evaluate JavaScript or access arbitrary record
fields. SDK limitations require an explicit implementation change, not generated
code, CSS or a private-data escape hatch.

Preview the definition on the connected Website without saving a page. Test its
generated field controls, save/reopen/history and treatment under the requested
packs. Exact-version approval is separate from saving; use the current authorized
publication flow when approval is in scope. Then insert the approved version into
a disposable page and verify native save/reopen plus actual Website rendering.
Retain existing pinned versions. SDK export belongs to block-promote.

Record proposed, saved, approved, inserted and rendered states separately. If AI
configuration is missing, finish the manual path where useful and report AI
acceptance as pending; never label fixture output as a real provider response.
