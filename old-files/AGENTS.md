# ConvexPress Codex Guide

This repository contains a Codex mirror of the existing Claude expert system. The original Claude assets remain under `.claude/`. Codex-facing assets live under `.codex/`.

## Working Model

- Treat the project as one workspace containing two app monorepos:
  - `ConvexPress-Admin/`: admin app plus the owning Convex backend
  - `ConvexPress-Website/`: public website consuming the admin-owned Convex deployment
- The admin app owns the schema, Convex functions, and deployment workflow.
- The website app must not define or deploy Convex schema or functions.

## Codex Expert Mirror

- Knowledge docs: `.codex/docs/*.md`
- Expert agent prompts: `.codex/agents/experts/**/*.md`
- Kit roadmap: `.codex/KITS-ROADMAP.md`
- Per-repo skill kits for Codex:
  - `ConvexPress-Website/.codex/skills/*/SKILL.md`
  - `ConvexPress-Admin/.codex/skills/*/SKILL.md`
- Per-repo skill kits for Claude:
  - `ConvexPress-Website/.claude/skills/*/SKILL.md`
  - `ConvexPress-Admin/.claude/skills/*/SKILL.md`
- Per-repo entry guides: `ConvexPress-Website/AGENTS.md`, `ConvexPress-Admin/AGENTS.md`
- Canonical historical source remains `.claude/`

When a task clearly belongs to a specific domain, load the matching expert prompt from `.codex/agents/experts/` and the matching knowledge doc from `.codex/docs/` before making changes.

When working inside one of the two repos, also read that repo's `AGENTS.md` and consult `.codex/skills/` for the skill that matches the user's request. Skills are *description-matched* — each `SKILL.md` frontmatter `description` is the dispatch signal. Load the relevant `SKILL.md` in full before acting; the file is the contract.

Claude and Codex skills are mirrored intentionally. When adding or changing a
skill, keep the matching `.codex/skills/<name>/SKILL.md` and
`.claude/skills/<name>/SKILL.md` copies in sync for the owning app.

## Dispatch Rules

- Small isolated fixes can be handled directly.
- Domain work should follow the expert mapping in `.codex/README.md`.
- Multi-system work should be decomposed by system boundary first.
- Prefer the actual codebase over stale docs if they conflict, but note the mismatch.

## Current Project Reality

- The mirrored expert registry covers the original system set plus UI and tech experts.
- The live codebase has moved beyond that registry and now includes newer domains such as `kb`, `tickets`, `support`, `themes`, and `airtableSync`.
- Treat those newer domains as first-class implementation areas even where the mirrored expert docs are incomplete.

## Local CLI Tool Awareness

Assume the machine may already have important authenticated CLIs installed. Before claiming a tool is unavailable or asking for a different integration, check the local executable first with `command -v` and a minimal help or auth-safe probe.

Preference order:

1. Native local CLI
2. Native library/runtime tool already in the project
3. MCP server
4. Browser/web fallback

If a local CLI is available and meaningfully better for the task, prefer it over MCP.

Known working local CLIs on this machine include:

- `airtable` at `/opt/homebrew/bin/airtable`
- `desktop-commander` at `/opt/homebrew/bin/desktop-commander`
- `gh` at `/opt/homebrew/bin/gh`
- `docker` at `/usr/local/bin/docker`
- `supabase` at `/opt/homebrew/bin/supabase`
- `kubectl` at `/usr/local/bin/kubectl`
- `bun`, `bunx`, `node`, `npm`, `npx`, `pnpm`
- `psql`, `sqlite3`
- `code`, `jq`, `rg`
- `ctx7` at `/opt/homebrew/bin/ctx7`
- `playwright-cli` at `/opt/homebrew/bin/playwright-cli`
- `typescript-language-server` at `/opt/homebrew/bin/typescript-language-server`
- `ast-grep` / `sg` at `/opt/homebrew/bin/ast-grep` and `/opt/homebrew/bin/sg`
- `biome` at `/opt/homebrew/bin/biome`
- `oxlint` at `/opt/homebrew/bin/oxlint`
- Rust toolchain CLIs including `cargo`, `rustc`, `rustfmt`, `cargo-clippy`, and `rust-analyzer`
- `cargo-nextest` at `/Users/worsin/.cargo/bin/cargo-nextest`

Special rule for Airtable:

- Treat Airtable as a first-class local capability.
- If the user says "look in Airtable", "go to Airtable", references an Airtable base, or pastes an Airtable link, first consider the local `airtable` CLI before saying access is unavailable.
- Prefer direct CLI operations for listing bases, tables, records, and searches when they fit the task.
- Only fall back to MCP or web approaches if the CLI cannot do the needed operation.

Special rules for GitHub:

- Treat `gh` as a first-class local capability.
- This machine has two authenticated GitHub accounts on `github.com`: `worsin` and `CaseDevix`.
- When the user provides a GitHub URL, infer the intended owner/account from the URL path.
- Before performing account-sensitive `gh` operations, verify the active account with `gh auth status`.
- If the target owner is `CaseDevix`, switch with `gh auth switch --hostname github.com --user CaseDevix`.
- If the target owner is `worsin`, switch with `gh auth switch --hostname github.com --user worsin`.
- Do not assume the currently active account is correct when the URL owner indicates otherwise.

Special rules for Desktop Commander and browser tooling:

- `desktop-commander` is installed globally as a CLI and may also be used as an MCP server.
- Global Codex MCP entries have been configured for `desktop-commander`, `chrome-devtools`, `playwright`, and `context7`.
- Prefer CLI over MCP for:
  - `airtable` -> `airtable`
  - GitHub operations -> `gh`
  - Context7 documentation work -> `ctx7`
  - Playwright browser automation when terminal-driven flows are sufficient -> `playwright-cli`
  - TypeScript analysis, formatting, and linting -> `typescript-language-server`, `tsc`, `biome`, `oxlint`
  - Rust analysis, linting, formatting, and tests -> `rust-analyzer`, `cargo`, `cargo-clippy`, `rustfmt`, `cargo-nextest`
  - Structural code search/rewrite -> `ast-grep` / `sg`
- Keep MCP as the preferred path when the tool is inherently MCP-shaped or more ergonomic there:
  - `chrome-devtools`
  - `desktop-commander` for structured agent tool calls
- When these capabilities are relevant, prefer using the configured local/MCP tools over saying they are unavailable.

## Non-Destructive Policy

- Do not delete or rewrite `.claude/` assets as part of Codex migration.
- Extend or mirror into `.codex/` instead.
- If you need to modernize docs, create Codex-side companions or add notes rather than replacing the Claude originals.
