# Airtable System Expert Parity Report

**Date:** 2026-04-22
**Base:** ConvexPress (`[redacted-airtable-base-id]`)

## Result

- Systems records: 72
- System Expert records linked to systems: 72
- Systems without experts: 0
- Systems with duplicate expert links: 0
- Deprecated legacy PRD paths remaining: 0
- PRD paths outside `specs/ConvexPress/systems/`: 0
- Referenced local PRD/expert/knowledge files missing on disk: 0

## Changes Made

- Normalized all System Expert `PRD Path` values to `specs/ConvexPress/systems/<slug>/PRD.md`.
- Updated existing linked System Expert rows away from deprecated legacy paths.
- Created missing System Expert rows for systems that had none.
- Added missing PRD scaffolds, Codex expert prompts, and knowledge companions where the repo did not yet have them.
- Added `specs/ConvexPress/SYSTEM-REGISTRY.md` as the canonical repo-side registry snapshot.

## Remaining Quality Work

The parity pass ensures every system is logged and routable for future work. Some newly created PRDs are scaffolds and should be expanded during the next system-specific audit with detailed requirements, events, routes, permissions, schema contracts, and tests.
