# Codex Workspace Mirror

This directory mirrors the Claude project-operating system into Codex-friendly files without removing the original `.claude/` assets.

## Structure

- `docs/`: expert knowledge documents mirrored from `.claude/docs/`
- `agents/experts/`: Codex agent prompt files mirrored from `.claude/commands/experts/`
- `KITS-ROADMAP.md`: skill-kit roadmap mirrored from `.claude/KITS-ROADMAP.md`

### Per-repo skill kits (Codex mirrors of `.claude/skills/`)

Skill kits are scoped to one repo and live alongside that repo's
`AGENTS.md`:

- `../ConvexPress-Website/.codex/skills/design-*/SKILL.md` — 15 design skills
  (homepage, archives, single post/page/product, header/footer, brand
  discovery, etc.). Mirrors `../ConvexPress-Website/.claude/skills/`.
- `../ConvexPress-Admin/.codex/skills/extension-*/SKILL.md` — 3 extension
  skills (build, add-feature, audit). Mirrors
  `../ConvexPress-Admin/.claude/skills/`.

Skills are *description-matched*: each `SKILL.md` frontmatter carries
`name` and `description` fields. When the user's request matches a
description, load the corresponding `SKILL.md` in full and follow it.

Per-repo `AGENTS.md` files (`../ConvexPress-Website/AGENTS.md`,
`../ConvexPress-Admin/AGENTS.md`) index the local skills and pin the
hard rules.

## How To Use

1. Identify the system, UI domain, or skill being invoked.
2. For domain work: read the corresponding file in `agents/experts/`
   and the matching knowledge document in `docs/`.
3. For skill work (design or extension): read the matching
   `SKILL.md` under the appropriate repo's `.codex/skills/`.
4. Verify against the current implementation, because some docs lag the codebase.

## Important Architectural Facts

- `ConvexPress-Admin/` is the Convex owner.
- `ConvexPress-Website/` is a Convex consumer.
- The repo is now a combined workspace even though some app READMEs still describe a two-repository setup.

## Known Mirror Gaps

The current codebase contains domains not fully represented in the original expert registry, including:

- `kb`
- `tickets`
- `support`
- `themes`
- `airtableSync`

Those gaps are implementation/documentation drift, not missing code.
