# Claude Handoff: ConvexPress Standalone Electron Testing

Updated: 2026-09-03

## What was tested

ConvexPress Standalone is an Electron control plane around multiple isolated ConvexPress site deployments. The current acceptance topology is:

- Organization: `Acceptance Agency Group`
- Business: `Northstar Commerce`
- Website: `Northstar Shop`
  - Live: site alpha
  - Staging: site beta
- Website: `Northstar Journal`
  - Live: site gamma

That is four databases total: one outer control-plane database plus three isolated site databases. Some earlier planning/evidence prose says "three websites" or names a Summit fixture; the current code and fleet above are authoritative.

Rendered acceptance was done only through Playwright's Electron API (`_electron.launch`). Do not replace it with Chrome, a browser MCP, or the Playwright browser CLI. The public website was also loaded inside an Electron window for desktop and mobile verification.

## Credential and identity handling

There are no real users or customer records in this acceptance fleet. Codex generated a synthetic email address, display name, high-entropy password, and one-time bootstrap claim secret for a disposable outer owner. The user did not provide an account, email address, password, or personal information.

In the Codex session, the generated email and password were retained in the tool-side secret store under these logical names:

- `playwright_email`
- `playwright_password`

Those labels describe generated test values; they are not the user's credentials. The secret-store values are not part of the repository and will not automatically be available to Claude. Do not guess that they belong to the user, and do not put replacement credentials in chat output, shell history, command-line arguments, `.env`, screenshots, traces, or source code.

The worker control plane now contains that synthetic owner. To reuse the current fleet, the ephemeral credential must be transferred to the next test process through a secure runtime-only channel. If it is unavailable, do not pretend to know it. Because the fleet contains no real data, a fresh synthetic owner can instead be generated during an explicitly authorized disposable-fleet reset and bootstrap. Do not reset the current volumes merely to recover a password without first telling the user.

The generated email and password are intentionally not included in this repository handoff. I loaded them into memory and sent a one-line JSON object to each acceptance script over standard input. The scripts read only the first stdin line. A safe interactive zsh pattern for a newly generated or securely transferred test identity is:

```zsh
read "cp_owner_email?Outer owner email: "
read -s "cp_owner_password?Outer owner password: "
printf '\n'
cp_owner_payload=$(jq -nc \
  --arg email "$cp_owner_email" \
  --arg password "$cp_owner_password" \
  '{email:$email,password:$password}')
print -r -- "$cp_owner_payload" | \
  node packages/desktop/scripts/playwright-standalone-acceptance.mjs
unset cp_owner_email cp_owner_password cp_owner_payload
```

Do not enable `set -x` while handling these values.

The initial synthetic owner was created by `scripts/standalone/bootstrap-linux-fleet.mjs`. The bootstrap first tries Better Auth email sign-in. On a new disposable control plane, it uses the control-plane admin key to reserve the one-time owner bootstrap, signs up through Better Auth with the `x-convexpress-claim-secret` header, signs in, finalizes the reservation, and seeds the MVP outer roles. The generated bootstrap claim is one-time setup material, not an ongoing login credential.

This synthetic owner login is only for the standalone outer control plane. It is not a website-customer login. Customer-isolation acceptance creates unique `@example.test` site invitations, verifies that they exist only in the selected site database, verifies that they never appear in the outer People directory, and revokes them during cleanup.

### How login works

The Electron scripts operate the real sign-in form as a human would:

1. Fill the textbox whose accessible name matches `email`.
2. Fill the control labeled `password`.
3. Click `Sign in` or `Continue`.
4. Wait for the `Organization` combobox before proceeding.
5. Select organization, business, website, and environment from visible controls.

Fixture-management helpers use the same real Better Auth boundary programmatically. They call `auth.signIn.email`, retain the returned cookie only in memory, request `/api/auth/convex/token` with the correct renderer `Origin`, and place the resulting JWT on a `ConvexHttpClient`. This does not use Convex admin authentication for normal operator operations.

Electron auth persistence is intentionally outside renderer storage through the `electronAuth` bridge. Acceptance verifies that renderer auth storage is empty and that the protected operator session survives an Electron restart.

## Linux Worker test fleet

No Convex database or Docker container should be started on this Mac. The fleet lives on the Linux worker:

```text
SSH host: worsin-worker
Address: 192.168.1.246
Directory: /home/worsin/ConvexPress-Test-Fleet
```

| Deployment | Convex origin | Site/HTTP origin | Container |
| --- | --- | --- | --- |
| Control plane | `http://192.168.1.246:4720` | `http://192.168.1.246:4721` | `convexpress-test-control-plane` |
| Alpha | `http://192.168.1.246:4820` | `http://192.168.1.246:4821` | `convexpress-test-site-alpha` |
| Beta | `http://192.168.1.246:4830` | `http://192.168.1.246:4831` | `convexpress-test-site-beta` |
| Gamma | `http://192.168.1.246:4840` | `http://192.168.1.246:4841` | `convexpress-test-site-gamma` |

Check it without mutating it:

```zsh
ssh worsin-worker 'cd /home/worsin/ConvexPress-Test-Fleet
docker compose ps
docker stats --no-stream $(docker compose ps -q)'
```

The Compose definition caps every container at 3 GiB, limits V8/Node concurrency, and rotates Docker logs. Leave the fleet running unless the user explicitly asks for it to be stopped or removed. Baloo is deliberately suspended on the worker because resuming it caused a multi-gigabyte indexing spike.

The site admin keys are stored only on the worker:

```text
/home/worsin/ConvexPress-Test-Fleet/credentials/control-plane.admin-key
/home/worsin/ConvexPress-Test-Fleet/credentials/site-alpha.admin-key
/home/worsin/ConvexPress-Test-Fleet/credentials/site-beta.admin-key
/home/worsin/ConvexPress-Test-Fleet/credentials/site-gamma.admin-key
```

Never print these files. If an acceptance script needs a key, read it over SSH into a short-lived shell variable, encode it into the stdin JSON payload with `jq`, run the script, and immediately `unset` both the key and payload. The site-manager script expects alpha as `siteAdminKey`; the RBAC script expects alpha, beta, and gamma under `siteAdminKeys`.

Do not mutate or deploy to `prod:affable-herring-441`. Local `.env.local` files may describe a different or production deployment; explicitly override the acceptance origins and never assume the current `.env.local` target is safe.

## Acceptance environment

Run from `/Users/worsin/Development/ConvexPress/ConvexPress-Admin` and provide these non-secret origins:

```zsh
export CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN=http://192.168.1.246:4720
export CONVEXPRESS_ACCEPTANCE_CONTROL_SITE_ORIGIN=http://192.168.1.246:4721
export CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN=http://192.168.1.246:4820
export CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_SITE_ORIGIN=http://192.168.1.246:4821
export CONVEXPRESS_ACCEPTANCE_SITE_BETA_ORIGIN=http://192.168.1.246:4830
export CONVEXPRESS_ACCEPTANCE_SITE_BETA_SITE_ORIGIN=http://192.168.1.246:4831
export CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_ORIGIN=http://192.168.1.246:4840
export CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_SITE_ORIGIN=http://192.168.1.246:4841
export CONVEXPRESS_ACCEPTANCE_RENDERER_ORIGIN=http://127.0.0.1:4105
```

I used a tracked SSH SOCKS process on port 17890 for Electron-to-worker traffic:

```zsh
ssh -N -D 127.0.0.1:17890 worsin-worker
export CONVEXPRESS_ACCEPTANCE_PROXY_SERVER=socks5://127.0.0.1:17890
```

Keep that SSH process attached to a known terminal/session and stop it after testing. Do not launch untracked background processes.

For development Electron acceptance, start the standalone Admin renderer on 4105 with the worker control-plane origins explicitly supplied:

```zsh
VITE_CONVEX_URL=http://192.168.1.246:4720 \
VITE_CONVEX_SITE_URL=http://192.168.1.246:4721 \
VITE_STANDALONE_CONTROL_PLANE=true \
bun --cwd apps/web run dev -- --host 127.0.0.1
```

For public-site Electron acceptance, start the Website renderer from the sibling repository on 4106, pointed at alpha:

```zsh
cd /Users/worsin/Development/ConvexPress/ConvexPress-Website
VITE_CONVEX_URL=http://192.168.1.246:4820 \
VITE_CONVEX_SITE_URL=http://192.168.1.246:4821 \
bun --cwd apps/web run dev -- --host 127.0.0.1
```

## Electron acceptance scripts

Run these from `ConvexPress-Admin`. All credential-bearing payloads go through stdin.

| Script | Stdin payload | What it proves |
| --- | --- | --- |
| `packages/desktop/scripts/playwright-standalone-acceptance.mjs` | `email`, `password` | Real Electron login, hierarchy switching, live/staging/site isolation, backup/restore/clone/promotion/rollback, handoff, restart persistence, window sizing, and renderer errors |
| `packages/desktop/scripts/playwright-site-manager-acceptance.mjs` | `email`, `password`, `siteAdminKey` | Portfolio/business/site/environment CRUD, isolated secure credential window, connection test, authority rotation/revocation, and cleanup |
| `packages/desktop/scripts/playwright-rbac-matrix-acceptance.mjs` | `email`, `password`, `siteAdminKeys.alpha/beta/gamma` | Owner, Administrator, Business Manager, Site Operator, Member, Viewer, explicit deny, forged scope rejection, and session revocation |
| `packages/desktop/scripts/playwright-website-customer-isolation-acceptance.mjs` | `email`, `password` | Three site-local customer invitation stores, no cross-site leak, no outer-operator leak, accessibility contrast, and cleanup |
| `packages/desktop/scripts/playwright-packaged-macos-acceptance.mjs` | `email`, `password` | Final packaged ARM64 `.app`, packaged auth/CORS, site selection, isolated database render, and zero renderer errors |
| `packages/desktop/scripts/playwright-public-website-electron-acceptance.mjs` | none | Public site in Electron at desktop/mobile sizes, navigation, no horizontal overflow, and zero renderer errors |

`CONVEXPRESS_ACCEPTANCE_HANDOFF_ONLY=1` makes the standalone script run the focused post-fix handoff/switch/restart path without repeating the expensive lifecycle mutations.

The optional `playwright-client-handoff-acceptance.mjs` requires a distinct secondary control-plane deployment and live/staging site keys. The four-container baseline does not currently include a persistent secondary controller, so do not run or provision that path unless the user specifically asks for a new cross-controller acceptance run.

Each script creates a unique temporary Electron profile, writes only the non-secret control-plane configuration into it, launches the exact Electron executable with `--user-data-dir`, and removes the profile in `finally`. `ELECTRON_RUN_AS_NODE` is stripped from the child environment. Owned Electron termination is graceful first and escalates only for that exact child if necessary.

## Build and non-UI verification

The final verification commands used were:

```zsh
cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin
bun test apps/web/src packages/desktop/electron packages/backend/convex \
  packages/control-plane/convex packages/site-contract/src \
  packages/runtime-clients/src packages/desktop/scripts/lib
TURBO_CONCURRENCY=1 bun run check-types
TURBO_CONCURRENCY=1 bun run build

cd packages/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false bun run package:mac

cd /Users/worsin/Development/ConvexPress/ConvexPress-Website
TURBO_CONCURRENCY=1 bun run test
TURBO_CONCURRENCY=1 bun run check-types
TURBO_CONCURRENCY=1 bun run build
```

The latest observed results were 2,143 passing Admin tests and 367 passing Website tests, with zero failures. The ARM64 package is `ConvexPress-Admin/packages/desktop/dist/ConvexPress-0.1.0-arm64.dmg`. It is an unsigned, unnotarized development build because Apple signing credentials were not available.

## Evidence and cleanup

Electron screenshots, JSON summaries, and traces are under:

```text
/Users/worsin/Development/ConvexPress/output/playwright/
```

The most concise retained proofs are:

- `electron-packaged-macos-acceptance.json`
- `electron-public-website-acceptance.json`
- `standalone-electron-acceptance.zip`
- `site-manager-electron-acceptance.zip`
- `electron-northstar-handoff.json`
- `ConvexPress-Admin/audits/2026-09-03/mvp-evidence-matrix.md`

Do not retain a trace or screenshot containing a password, deployment admin key, session token, cookie, private key, or raw connection credential. Failed traces can become very large; inspect them, then move obsolete failures to Trash rather than leaving them to consume disk/RAM indefinitely.

After every run:

1. Stop the exact Vite, Electron, SSH proxy, and tunnel processes started for that run.
2. Do not use broad commands such as `pkill node`, `killall Electron`, or Docker cleanup against unrelated projects.
3. Run the project-owned cleanliness gate:

```zsh
cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin
bun run acceptance:cleanliness
```

The expected result is:

```json
{"clean":true,"ownedProcesses":[],"totalOwnedRssKb":0,"reservedListeners":[],"localDatabasePaths":[],"staleProfilePaths":[]}
```

Also check the ports used by the local renderers, temporary deployment tunnels, and SOCKS proxy:

```zsh
for cp_port in 4105 4106 14720 14721 14820 14821 14830 14831 14840 14841 17890; do
  lsof -nP -iTCP:$cp_port -sTCP:LISTEN 2>/dev/null
done
```

No output is expected after cleanup. Leave unrelated checkouts and their processes alone. The working tree contains the MVP work and generated evidence and was intentionally not committed or pushed.
