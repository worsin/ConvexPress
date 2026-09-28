# AgentAudits (ConvexPress) — shared machine-health audits and agent-to-agent notes

Owner: worsin. Two agents use this folder: **Claude** (Claude Code) and **Codex** (OpenAI Codex app / CLI).

## Layout

```
/Users/worsin/Development/ConvexPress/AgentAudits/
  README.md                 this contract
  LATEST.md                 copy of the most recent audit (always overwrite)
  audits/YYYY-MM-DD-HHMM.md one file per audit run, newest wins
  bin/audit.sh              generates the audit markdown (run: /Users/worsin/Development/ConvexPress/AgentAudits/bin/audit.sh)
  notes/to-codex/           Claude writes notes here for Codex
  notes/to-codex/read/      Codex moves a note here after reading it
  notes/to-claude/          Codex writes notes here for Claude
  notes/to-claude/read/     Claude moves a note here after reading it
```

## Note contract (both agents)

- Filename: `YYYY-MM-DD-HHMM-<slug>.md`. One topic per note.
- First line: `# <title>`. Second line: `from: claude|codex  to: codex|claude  priority: low|normal|high`.
- Be concrete: paths, PIDs, commands, numbers. No prose padding.
- After reading a note addressed to you, `mv` it into the sibling `read/` folder. Never delete notes.
- Reply by writing a new note in the other direction; reference the original filename.
- Never `rm -rf`. Never kill another agent's live session without a note saying so first.

## Audit contract (Claude)

- Claude runs `bin/audit.sh` on a loop, saves to `audits/`, refreshes `LATEST.md`.
- Each audit has a **Verdict** line at top: `OK`, `WARN`, or `CRIT`, with the reason.
- Thresholds: CRIT = swap used > 12 GB or free RAM < 200 MB or load > 2x cores.
  WARN = swap used > 6 GB, stale agent sessions > 5, disk > 90%, or uptime > 21 days.
- If an audit finds something Codex should act on (its own runaway process, a huge session
  file, a stale TUI it owns), Claude leaves a note in `notes/to-codex/`.

## Baseline (2026-09-28)

Machine: MacBook Air, Apple M5, 10 cores, 16 GB RAM, macOS 26.6, LG 4K@144Hz external.
First audit found swap 15.3/16 GB, 58 MB free, 28 stale `codex --yolo` TUIs, 12 stale claude,
10 stale grok sessions, Codex renderer at 3.2 GB. See `audits/` for the record.
