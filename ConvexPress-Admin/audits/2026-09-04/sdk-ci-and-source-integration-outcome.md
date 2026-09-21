# SDK, CI and main source integration — September20

The application source is integrated into main. `da2b9e16` commits the remaining canonical SDK/tooling distribution and CI gates; `dd606676` preserves184 historical audit/handoff files; `b392bc37` merges all nine newer Claude commits. This is source integration, not production acceptance.

## Repairs and evidence

- All eight canonical skills and77 distribution files pass exact parity checks. Four root Codex skill directories were previously hidden by ignore rules; they are now tracked.548 thumbnail files across137 blocks/four packs pass their manifest hashes and sizes.
- Fresh-snapshot root SDK suite initially failed three cases because ignored local inventory files were required. Historical exports now live as tracked fixtures with provenance and unchanged bytes. Final135 tests/17471 assertions pass; generated contracts, runtime catalog and transport validators pass freshness checks.
- The complete Admin command passes4439 tests with zero failures:468 renderer,3430 backend,378 controller,113 desktop,35 shared contracts and15 tooling. This supersedes the prior backend run with one repaired-but-not-fully-rerun failure. Desktop main/preload TypeScript checks, Admin guardrails and503-route/136-navigation-target static smoke pass.
- Six workflows parse and their declared directories/version files exist. Cross-workspace source triggers were added. Independent dependency isolation showed Admin renderer/tooling tests pass with Website dependencies unavailable. Website's renderer integration tests intentionally import actual backend handlers and failed with Admin dependencies unavailable; Website CI now installs Admin dependencies and generates extension indexes. The earlier fully installed Website suite passed640 cases; the later focused screenshot-ID repair passed3 cases. No remote GitHub job has executed and local Bun is1.3.9, not the workflows' pinned1.3.7.
- Local provider caches and disposable test output are ignored. Sixteen generated Electron bundle paths are removed from version control; the running worktree files remain on disk. The normal dev/package scripts build native source themselves.
- Source snapshot identity, whitespace and redacted secret scans pass. The SDK source scan covers1118841 bytes with no findings; one non-error lint warning remains.184 historical documents/JSON files were separately scanned (2056470 bytes), with no secret findings.

## Claude and main reconciliation

Claude's nine commits changed only handoffs, research and historical tracker output. Two add/add document conflicts were resolved by preserving the current detailed progress tables and adding Claude's MagicTables tracking instructions. The merge did not change application source.

Main fast-forward initially refused to overwrite11 ignored files. Nine were byte-identical to the incoming files; two were older generated control-plane API bindings. Every original was moved to a recorded backup before retrying. Main and hardening then matched atb392bc37, both clean. No push occurred. Existing Electron39198, Admin69634 and BlockDemo8172 still run from the hardening worktree; they were not restarted. Backup/hash and Git receipts: output/claude-reconciliation-20260920.

## Remaining release acceptance

A05 and B08 are still the only fully accepted original audit items. Main source integration does not close full block design/interaction/live-data/motion acceptance, eight kit websites, remaining scopes/security/commerce/publishing checks, signed clean-machine installation, provider/domain launches, recovery or backup/fleet operations. Remote CI and final integrated native acceptance remain open. The goal stays active.
