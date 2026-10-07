# Plugin default parity — September 29

F1 is repaired for the existing installed plugin contract. The four Website defaults for Knowledge Base, Tickets, Recipes and Gallery now match the enabled defaults already used by backend handlers, Admin and the public settings endpoint. Stored false choices remain authoritative. No site settings were changed, and no backend was deployed.

## Evidence and decision

Required workflow: pending recipe, album and support blocks must share their source plugin's availability with the actual Website. The new parity test failed before the repair: backend true versus Website false. The original audit identified four mismatches and separately noted that Custom Fields has no Website manifest; later five-mismatch summaries blurred that distinction.

The proposed direction of deriving backend behavior from Website manifests was not adopted. Registered query tests prove the normal public settings endpoint already returns true for the four absent settings and creates no settings row. Changing the backend defaults to false would change that established behavior. Aligning the Website fallback preserves it and avoids a settings migration. Custom Fields remains Admin-only with its existing true default. Runtime-specific manifests remain independently shipped, with disagreement now rejected by the normal `check:blocks` gate and standalone `check:plugin-defaults` command.

The gate covers all 16 currently installed Website manifests, settings-key identity, fallback values, explicit true/false decisions, parent dependencies, Admin platform defaults and public defaults. Canonical false wins over a conflicting legacy alias. Website gates remain closed until settings load. Legacy Website aliases retain their existing compatibility behavior; this is not a general backend alias migration.

## Verification

Evidence: `output/plugin-defaults-20260929/`.

- 17 focused tests /246 assertions across six files: runtime contract parity, registered public defaults/no writes, stored choices, support/recipe readers and public gates. The initial parity regression failed as expected.
- Website types/build, normal block freshness gate and the 16-manifest generated index pass. The index generator was run and left no source diff; it does not implement a read-only `--check` mode.
- Read-only live source comparison agrees across all 16 plugins and preserves public flags exactly. The four affected plugins are already enabled there; previously disabled commerce extensions remain disabled. This is not a live absent-settings mutation drill.
- Built source Website routes `/help/`, `/support/`, `/recipes/` and `/gallery/` render their expected headings at390px with HTTP200, no overflow and no page/console/hydration errors. The signed-out support view was visually inspected. This route smoke does not complete each block's full data/action acceptance.
- Source Website process39939 replaces owned38795 on4322. Owner native39198, Admin62672, BlockDemo65092 and SOCKS68390 remain. No API login or owned content fixture was needed.

Two unqualified backend typecheck attempts inherited the parent monorepo configuration (there is no package-root tsconfig) and exceeded the default and8GB heap limits. The corrected command explicitly targets convex/tsconfig.json and passes; its result is recorded in backend-types.log. Full native plugin-block acceptance remains next. Tracker is unchanged at79 Verified /58 In progress /137; no full-block flags were advanced by a default-policy repair.
