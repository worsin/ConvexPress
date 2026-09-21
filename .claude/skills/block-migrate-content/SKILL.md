---
name: block-migrate-content
description: Inspect and migrate ConvexPress legacy authoring content into canonical blocks with source preservation, exact revision checks and rendered recovery proof.
---

Read `block-kit/CONTRACT.md`, `WORKFLOW.md` and
`references/content-migration.md` from the repository root. Identify the exact
website/environment, current document version, visible legacy source and target
pack. Schema migration stays in that same isolated environment; moving content
between sites/environments uses the separate content-promotion workflow.

Capture the original document and revision before conversion. Keep private content
and credentials out of source and public evidence. Preserve legacy renderer
defaults, metadata, marks, media/reference identity, nested order and treatment
semantics. Do not infer the visible source from whichever field is nonempty.

Use the read-only preflight CLI for captured records. A candidate explicitly
requires rendering acceptance and cannot authorize a database write. Resolve
every conversion issue; never replace an unsupported block or structured article
with empty content or hidden fallback text. The pure converter and the deployed
write API have different coverage; consult the reference before mutation.

For a supported editable draft, review `canonicalDocuments:prepareMigration` and
its actual Website preview. Commit with `canonicalDocuments:migrate` using that
review's source revision, authoring digest, candidate digest and presentation
revision. Changed source, template or authority requires a fresh review. Published
documents must follow the authorized draft/publication workflow; never silently
unpublish them to make a migration API accept them.

Read back the receipt, canonical document and retained original revision. Verify
native save/reopen, public rendering and recovery in an authorized disposable
site before broad migration. If a mutation acknowledgement is uncertain, inspect
current revision/digest/history before deciding whether any retry is needed.

Do not remove legacy fields, schemas or renderers until all affected documents
have migration and recovery evidence. Report unsupported source types as concrete
implementation gaps; the presence of a converter or this skill does not close
legacy-retirement requirements.
