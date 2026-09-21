# Schema-driven editor foundation — September 5

The staged `SchemaBlockForm` consumes generated `editor-metadata.ts` and canonical
Zod validators for all discovered blocks. It is not mounted in the legacy outline
or connected to live storage. No block-specific editor registry was added.

The generator emits typed field metadata plus `validateBlockField(name, path,
value)` by traversing the existing generated Zod schema using its public shape,
element and unwrap interfaces. This avoids a second handwritten field validator.
The Admin's existing pinned Zod dependency is mapped narrowly in its TypeScript
configuration; no root dependencies, package locks or provider configuration were
changed.

| Field contract | Staged control |
| --- | --- |
| text, icon, date | Labeled text/textarea input; canonical bounds/format validation |
| number | Numeric input retaining an empty invalid draft; integer/range checks on save |
| boolean, select, color-role | Checkbox or finite select; numeric select options remain numbers |
| link | Structured label/destination/new-tab controls, or existing flat href storage |
| object, repeater | Recursive fields, explicit row add/remove/move, bounds and cross-field errors |
| richtext | Structured paragraph/text-segment/mark/link/hard-break editing without HTML or Markdown conversion |
| media, reference, menu, form | Required target-scoped picker adapter; no freeform resource ID entry |

Structured media preserves resource identity and exposes alt text/focal point
values. Richtext imports the generated canonical doc/mark vocabulary. Editing
text retains existing marks and link targets; an invalid URL being typed stays
editable while save is blocked. Malformed stored structures and unknown attrs are
retained for review, not stripped. Explicit unset/default, null and empty-string
states remain distinct.

The form's outer identity is `{websiteKey, instanceKey, blockId, name, version}`.
Changing the selected block or environment remounts the draft and aborts pending
picker requests. Saved revision/content changes preserve the draft and show an
explicit reload action. Picker results must match block identity, exact scope,
revision and field path, then pass the canonical field validator. Late or foreign
results cannot become the current selection. Commit passes normalized attrs,
block identity, exact target scope and expected revision to the caller. That
caller must still enforce server authorization, plugin/add policy, optimistic
concurrency and durable revisions; this UI does not replace those boundaries.

Meaningful tests cover real DOM input events, empty numeric drafts, richtext mark
retention and unsafe URLs, stale/foreign picker completion, revision conflicts,
nested repeater editing/reordering and numeric select types. Three pure model
tests cover immutable paths, unknown-data retention, invalid values and reference
binding. The DOM cases run in an isolated process because React DOM caches input
feature detection and existing Admin tests import it before constructing a DOM;
isolation prevents test order from changing event semantics. The suite also passes
alongside the existing navigation DOM test. Canonical validators are bundled from
actual generated source with the pinned workspace Zod, never mocked.

The root block suite passes 47 tests; the DOM wrapper additionally executes four
actual handler cases. Isolated editor TypeScript passes. Full Admin TypeScript at
this checkpoint reports only root-owned PromotionReviewView `.data` versus
`dataJson` mismatches, reported to root; no editor-source errors remain. Generated
output refresh is held during root's 34-renderer browser matrix and must run when
that gate finishes.

Remaining activation work: connect reviewed picker adapters and authoritative
commit/migration flows, mount the generic form in the unified outline, provide
inline WYSIWYG selection UX over the same RichTextDoc, then verify the actual
native editor and selected Website preview. This foundation does not mark any
block or the schema-first phase production-complete.
