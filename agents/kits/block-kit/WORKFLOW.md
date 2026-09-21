# Build and validate a Library block

Run commands from the repository root containing `blocks/` and both applications.

1. Read the spec and actual renderer for the closest installed reference. Confirm whether the request needs a new block, a pattern of existing blocks, or a template treatment.
2. For a new Library block, run `bun run create:block namespace/name --title "Title"`. The scaffold is a working heading/message block. Replace its content contract and rendering with the requested behavior; extend its tests accordingly. For an existing block, edit its root files directly and decide migration requirements before changing persisted semantics.
3. Run `bun run sync:blocks:all`. This executes root generation, backend foundation generation, Website portable contracts, deployed backend source contracts, transport validators and legacy compatibility generation in dependency order. It does not deploy. Review its diff; a failed phase requires repair before proceeding.
4. Run `bun test ./blocks/<namespace>/<name>/contract.test.ts` for a scaffold, then the meaningful tests appropriate to the final feature. Run `bun run check:blocks` and `bun run sync:blocks:all --check`.
5. For SDK renderer changes, from `ConvexPress-Website/apps/web`, run `bun src/templates/sdk/block-renderer/run-tests.fixture.mjs` and `bunx tsc --noEmit -p tsconfig.block-demo.json`. New dynamic resolvers also need backend registered-function and isolation tests; add a declared BlockDemo adapter instead of fabricating production data.
6. Run relevant Admin/Website typechecks and lint. Confirm the actual editor can insert, edit, save and reopen the block in an authorized disposable site, then inspect its public rendering across all installed packs, narrow/wide widths, keyboard interaction and applicable loading/empty/error states. Test reduced-motion and actual animation performance for moving blocks. Preserve the user's existing native app session; Admin is Electron.
7. Update the standalone MagicTables inventory when authorized, with exact names and scoped evidence. Distinguish implemented, tested and visually accepted. Follow the existing handoff for inventory expansion and external acceptance.

When editing the kit, run `bun run sync:block-kit`, `bun run check:block-kit`, and `bun test ./scripts/blocks/create.test.ts`. Test artifacts stay in disposable directories. Do not add demonstration scaffolds to the shipped inventory merely to test the tool.
