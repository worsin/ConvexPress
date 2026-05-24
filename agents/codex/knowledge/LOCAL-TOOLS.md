# Local Tools

This workspace runs on a machine with several useful CLIs already installed and, in some cases, authenticated.

## First Rule

Before assuming a service is unavailable, check whether a local CLI already exists and can do the job directly.

Default preference order:

1. Native local CLI
2. Project-native runtime/library workflow
3. MCP
4. Web/manual fallback

Do not use MCP by reflex if the local CLI is cleaner, faster, or easier to script.

Use this pattern:

1. `command -v <tool>`
2. `<tool> --help` or another auth-safe probe
3. A minimal real command if the task depends on actual access

## Confirmed Local CLIs

- `airtable` at `/opt/homebrew/bin/airtable`
- `desktop-commander` at `/opt/homebrew/bin/desktop-commander`
- `gh` at `/opt/homebrew/bin/gh`
- `docker` at `/usr/local/bin/docker`
- `supabase` at `/opt/homebrew/bin/supabase`
- `kubectl` at `/usr/local/bin/kubectl`
- `bun` at `/opt/homebrew/bin/bun`
- `bunx` at `/opt/homebrew/bin/bunx`
- `node` at `/opt/homebrew/bin/node`
- `npm` at `/opt/homebrew/bin/npm`
- `npx` at `/opt/homebrew/bin/npx`
- `pnpm` at `/opt/homebrew/bin/pnpm`
- `psql` at `/opt/homebrew/bin/psql`
- `sqlite3` at `/usr/bin/sqlite3`
- `code` at `/opt/homebrew/bin/code`
- `jq` at `/usr/bin/jq`
- `rg` on `PATH`
- `ctx7` at `/opt/homebrew/bin/ctx7`
- `playwright-cli` at `/opt/homebrew/bin/playwright-cli`
- `typescript-language-server` at `/opt/homebrew/bin/typescript-language-server`
- `ast-grep` at `/opt/homebrew/bin/ast-grep`
- `sg` at `/opt/homebrew/bin/sg`
- Rust toolchain CLIs on `PATH`, including `cargo`, `rustc`, `rustfmt`, `cargo-clippy`, `rust-analyzer`

## Airtable

The Airtable CLI is installed and functional.

Validated facts:

- `airtable --version` returns `1.0.0`
- `airtable bases list` succeeds in this environment

Behavior expectation:

- If the user refers to Airtable, an Airtable base, or an Airtable link, treat Airtable CLI access as available by default.
- Prefer local CLI usage before claiming Airtable access is missing.
- Only switch to MCP or browser-based flows if the CLI cannot perform the needed action.

## Desktop Commander

Desktop Commander is installed globally as the CLI package:

- package: `@wonderwhy-er/desktop-commander`
- installed version: `0.2.38`

Behavior expectation:

- Treat Desktop Commander as both an installed local CLI and an available Codex MCP target.
- Do not claim it is missing without checking the binary first.

## GitHub CLI

The GitHub CLI is installed and authenticated with two `github.com` accounts:

- `worsin`
- `CaseDevix`

Behavior expectation:

- If the user provides a GitHub URL, derive the intended owner from the URL.
- Before account-sensitive `gh` actions, check the active account with `gh auth status`.
- Switch explicitly when needed:
  - `gh auth switch --hostname github.com --user worsin`
  - `gh auth switch --hostname github.com --user CaseDevix`
- Do not assume the active account is correct when the URL owner says otherwise.

## Global Codex MCP Servers

Configured globally in `~/.codex/config.toml`:

- `desktop-commander`
- `chrome-devtools`
- `playwright`
- `context7`

## CLI vs MCP Guidance

Prefer CLI over MCP for:

- Airtable -> `airtable`
- GitHub -> `gh`
- Context7 -> `ctx7`
- Terminal-driven Playwright flows -> `playwright-cli`
- TypeScript compiler/LSP tasks -> `tsc`, `typescript-language-server`
- Rust analysis/lint/format tasks -> `rust-analyzer`, `cargo`, `cargo-clippy`, `rustfmt`
- Structural code search and rewrite -> `ast-grep`, `sg`

Prefer MCP over CLI when the MCP form is the real product surface or offers better structured interaction:

- Chrome DevTools
- Desktop Commander as an agent tool surface
