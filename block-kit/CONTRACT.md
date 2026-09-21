# Canonical block contract

- Own content in `blocks/<namespace>/<name>/block.json`. Use stable names, closed fields, bounded inputs, useful defaults and representative examples. Read `scripts/blocks/schema.mjs` for the current vocabulary; generated JSON Schema alone cannot prove semantic constraints.
- Own the baseline renderer in the adjacent `render.tsx`, using `defineBlock` or the matching typed data-block factory and SDK primitives. Names, attrs and versions come from generated contracts. Do not add a second handwritten schema or registry entry.
- Canonical instances use `children`, `layout`, `anchor`, `visibility` and validated `treatment`/`style` where supported. Read `scripts/blocks/instance-runtime.mjs` for the exact closed envelope. Legacy `innerBlocks` is migration input, never new canonical output.
- The generic editor derives controls from fields. Dedicated editing adapters must still use generated validation and the revision-guarded canonical document service.
- Templates own presentation and token mapping. Content does not contain CSS, executable code, credentials or copied live prices. Packs do not inherit other packs. A generic SDK treatment is not evidence of a pack-owned treatment.
- Dynamic blocks declare resolvers and requirements. The backend owns authorization, site scope and allowlisted result DTOs. A declaration does not implement a resolver. Rendering rejects unknown data or missing requirements rather than inventing business data.
- Persisted version changes require explicit, tested conversion through the canonical migration path. Preserve source revisions and refuse unsupported input. A `migrations.ts` file by itself is not wired into the canonical service.
- Keep client identities and resource references site-local. Pattern content must not ship database IDs; cross-site promotion requires validated mapping and scope checks.
- Generated code is output, not an authoring surface. Use `sync:blocks:all`; review generated diffs and run `check:blocks`.
- Contract tests, renderer checks, native editor save/reload and public rendering prove different boundaries. Record each actually tested boundary. Screenshots or file existence alone do not prove full visual, interaction, accessibility or motion acceptance.
