# Canonical post and page authoring over HTTP

Use a site API key with `read:posts` and/or `write:posts` at the site's `/api/v1/posts` and `/api/v1/pages` endpoints. The key is checked against its issuing environment, expiry and revocation in the content transaction. Writes also require the owner's current create/update/publish capabilities. A key does not become a native or management session.

Create a draft with a title and either `blocks` (the versioned canonical tree) or `content` (supported TipTap JSON, HTML or plain text to convert). Sending both is an error. Unsupported source structure or authoring values are refused atomically; no partial document is kept. Page creation also accepts `parent_id`, `menu_order` and `page_template`.

```json
{"title":"A studio update","content":"<h2>New work</h2><p>Our latest collection.</p>"}
```

A successful POST returns HTTP 201 with `id`, `blocks_version: 2` and `blocks_revision: 1`. GET the returned ID to read `blocks`, `blocks_version` and `blocks_revision`, along with the document metadata. Canonical responses do not return a misleading empty legacy `content` field. Public-only readers receive the public projection; an authorized editor's key can read that editor's draft. Page responses retain parent and published-child summaries; more than 100 children requires a smaller read workflow and returns an explicit limit error.

Every PUT must include `expected_revision` from the last read or accepted write receipt. It may include a new `title`, `blocks` or convertible `content`, excerpt, slug and supported publication fields. Page metadata includes parent, order, template, visibility/password and comment status. Set `parent_id` to null to move a page to the root. Moves validate the entire bounded descendant route plan before writing.

```json
{"expected_revision":1,"title":"An updated studio note","content":"An updated first line.\n\nA line after a blank line."}
```

An accepted PUT returns `id`, `updated`, `blocks_version`, the accepted `blocks_revision` and a content `digest`. Missing/invalid revisions return 428; a stale revision returns 409 without a write. After an unknown network acknowledgement, read the current document before deciding whether to retry. A retry with the old revision cannot silently overwrite another accepted edit.

Publication states are `draft`, `publish`, `private` and `future`; `future` requires a future integer `scheduled_at` timestamp in milliseconds. Publication, access-policy changes and edits to published documents require publishing authority. The existing canonical resource, installed-template, block-action and plugin-specific authorization checks still apply; API-key possession does not bypass them or supply custom definition registries.

This replaces legacy HTTP body writes. Clients that previously PUT raw content without a revision must adopt the read/revision/write flow. Historical imports and archived source recovery remain separate deliberate workflows in the native editor.

The old Convex `posts/mutations:create` and `pages/mutations:create` functions are retired. Native/authenticated tooling creates through `canonicalDocuments.create({type, title})` and then uses the returned ID/revision for canonical Save, settings and publication. API-key integrations use the HTTP endpoints described here. Do not write legacy `contentMode`, version or revision fields directly.
