# Canonical block contract foundation

The portable compiler validates a block specification, then creates its closed attribute schema. `schema.mjs` supplies the Admin workspace's existing pinned Zod runtime for Node/Bun tooling; `spec-runtime.mjs` and `field-runtime.mjs` accept that runtime explicitly and have no filesystem or provider dependencies.

Use `parseBlockSpec` on untrusted definitions before calling `attrsSchema`. It copies bounded plain JSON without invoking getters or `toJSON`, then validates field types, defaults, nested constraints, references and examples. `blockSpecSchema` alone checks shape; it does not replace that complete validation.

`instance-runtime.mjs` validates a whole authored document against caller-supplied, validated block descriptors. It preserves IDs, nested content and saved template intent while enforcing exact versions, page-wide unique IDs/anchors, supported policies, and limits before and after defaults. A host can supply exact authorized composed-block contracts; it cannot override installed Library contracts. Active visibility rules and locks remain refused until their corresponding policies are implemented.

`storage.mjs` derives the Convex storage envelope from that same canonical node schema. This shape validator does not authorize a write or replace complete tree validation. Authorization, media resolution, editor behavior and rendering belong to their consumers.

From the repository root, after installing the existing Admin workspace dependencies:

```sh
bun test ./scripts/blocks/schema.test.ts ./scripts/blocks/spec-contract.test.ts ./scripts/blocks/instance-contract.test.ts ./scripts/blocks/storage.test.ts
```

These independent contract tests require neither generated block catalogs nor a running backend. Catalog parity, renderer and live editor checks remain separate acceptance requirements.

The canonical Library specifications live in `blocks/<namespace>/<name>/block.json`. Their examples contain synthetic media and resource identities for documentation and local previews; they do not provision records. Validate the source specifications and each example's complete document envelope with:

```sh
bun test ./scripts/blocks/library-contract.test.ts
```

This source-contract gate is independent of generated catalogs and renderers. It does not establish that a block's declared data resolver, editor, template treatment or provider integration is accepted.
