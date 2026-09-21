# Promote a custom block into the SDK

Promotion distributes an exact reviewed custom definition as a Library block. It
does not rewrite existing pages, copy a website database, or authorize data access.
The native Custom blocks editor supports reviewed export, download, installation
readback and confirmation. The Studio Services acceptance case exercised the real
editor, CLI installation, isolated site backend, connected Website preview and
preservation of an existing pinned page. That static example does not substitute
for data, media, child-slot or deployment acceptance of another promoted block.

1. Review the saved definition and its template treatments. Register the intended
   canonical name in the Standalone ConvexPress MagicTables Blocks table before
   creating its source folder. Choose a Library name such as `blocks/studio-services`.
2. In Custom blocks, select the saved version, enter the Library block name and
   choose **Prepare SDK export**, then **Download SDK package**. Keep that exact
   reviewed package through installation. The corresponding API is
   `blockDefinitions/promotion:exportPackage`, with the definition ID, exact
   version, current expected generation, reviewed digest and target name. Export
   requires current promote/compose/read capabilities and definition ownership or
   administrator access in the current website and environment. Save the returned
   `packageJson` as a UTF-8 file, without an enclosing response envelope.
3. Run from the repository root:

   ```sh
   bun run promote:block --file reviewed-promotion.json
   bun run promote:block --file reviewed-promotion.json --write
   bun run sync:blocks
   bun run check:blocks
   ```

   The first command only shows the file plan. The write creates
   `blocks/<namespace>/<name>/block.json`, `render.tsx`, `promotion.json`, a contract
   test and a build receipt. It never overwrites an existing folder. An interrupted
   operation retains its pending marker and partial source for inspection; do not
   remove that evidence or retry blindly. Required template treatments must have
   their packs installed in the destination repository.
4. Run the generated contract test, SDK renderer regressions, type checks and the
   block's full desktop/mobile BlockDemo examples under each installed template.
   Verify real data, media, child slots, anchors and interactions where relevant;
   retain screenshots. Generated test files are a starting point, not visual proof.
5. Build and deploy the matching Website and site backend through the normal
   deployment workflow. Verify the canonical block on the actual site before
   retiring new runtime placements. Backend-generated installation metadata does
   not by itself prove the matching Website build is live.
6. Approve the exact runtime version if needed, then re-export using its current
   generation. In the editor, **Check installation status** must report the exact
   reviewed block installed. Verify the Website and existing content, check the
   verification box, then choose **Confirm SDK promotion**. If confirmation is
   uncertain, use **Check installation status** to read the result; do not repeat
   the write. The API is `blockDefinitions/promotion:confirm`, with reviewed inputs
   plus `expectedPackageDigest`. This additionally requires update/publish authority,
   an active exact-version approval and matching deployed installation metadata.
   A changed generation, source, package or target is refused. An identical confirmed
   operation is idempotent; an uncertain response is resolved by readback, not a new
   operation with guessed generation.

The package retains the original name/version/digest for provenance and introduces
canonical version one under the target name. It excludes site/author/deployment
identity. Nonempty site-owned reference defaults and examples—including hidden
nested defaults and references disguised as plain text resolver arguments—must be
removed by an intentional reviewed definition edit before exporting. The CLI never
silently replaces identifiers. Authored instances can select authorized destination
resources after installation. Resolver bindings and all pack treatments are retained.

`definePromotedBlock` uses the same primitive renderer, authorized media projection,
resolver grants, child slots, anchor checks and page expansion budget as runtime
compositions. Discovered promotion metadata binds the exact spec, package and emitted
renderer source. Editing either source while retaining that provenance fails
discovery. Future canonical development must deliberately remove or replace the
provenance and follow normal version/migration review, rather than forging an old
review digest.

Confirmation marks only the custom definition head as promoted. Immutable versions
and their approvals remain available to pinned pages and revisions. Approval
revocation remains effective after promotion. Existing pages are not automatically
migrated to the new canonical name; such a migration requires its own reviewed plan.
