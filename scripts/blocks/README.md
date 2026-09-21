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

## Discovery and generation

`node scripts/blocks/cli.mjs` discovers specifications in the Library and conventional plugin/template folders, then emits `blocks/.generated`. `node scripts/blocks/cli.mjs --check` compares those outputs without writing. The generator rejects duplicate identities, unsafe source/output links, invalid pack declarations and unexpected output files. It does not delete obsolete files automatically.

Generated contracts include Zod semantic validators, Convex shape validators, TypeScript types, editor field definitions, dependency paths and catalog metadata. Template manifests supply named styles, hidden blocks, owned renderers and portable starter patterns. Pattern validation rejects persisted site-owned resources, duplicate anchors/IDs and unsupported template choices. Pack design guides carry a deterministic revision so consumers can invalidate stale context.

Test the generator and parsers independently of installed pack contents with:

```sh
bun test ./scripts/blocks/generator.test.ts ./scripts/blocks/pack-design.test.mjs ./scripts/blocks/pack-presentation.test.mjs ./scripts/blocks/patterns.test.mjs
```

These tests use the Admin workspace's pinned Zod, Convex, convex-test and TypeScript dependencies. Generation does not activate a runtime registry or deploy a backend. Consumer parity (`generator-consumers.test.ts`), installed pack inventory (`pack-inventory.test.mjs`) and full generation freshness remain separate integration gates as those sources are committed.

## Canonical renderer foundation

The Library renderers, pack-owned treatments and their pure data contracts can be checked independently of deployed provider handlers and the complete demo. Run `bun scripts/blocks/test-renderer-foundation.mjs` for the existing model, content, pack ownership and legacy treatment comparison cases. It bundles against the installed Website runtime, executes the original cases, and removes its temporary bundle. The full renderer suite retains these assertions along with provider, live-state and demo integration tests.

`node scripts/blocks/backend-foundation.mjs --check` and `node scripts/blocks/portable-data.mjs --check` verify exact generated and portable source copies. Generation does not deploy registered handlers. Data contract and static-renderer success does not establish that a provider operation or authorized customer flow works end to end.
