---
name: system-audit-airtable
description: Use when the user asks to audit ConvexPress systems against Airtable, update the Systems table, reconcile routes/actions/events/roles/email/site notifications/plugins, create gap reports, or verify Airtable parity with the current codebase and PRDs.
---

# system-audit-airtable

Use this for Airtable-backed system inventory work. Airtable is a checklist of
record, but code and PRDs are the evidence source.

## System Map

- Base commonly used for ConvexPress audits: `appqpJ8QQkoKsH02O`
- Systems table: `tblmiSawf6mIf56V8`
- Related tables commonly linked from Systems:
  - Routes
  - Actions
  - Events
  - Roles
  - Email Notifications
  - Site Notifications
  - System Experts
  - Plugins
- Local CLI: use `airtable` first.

## Workflow

1. Read the current Airtable table data before proposing edits.
2. Inventory code and PRDs:
   - backend schema/functions
   - admin and website routes
   - events/actions/notifications
   - role/capability seeds
   - plugin/extension manifests
   - specs under `specs/ConvexPress/systems/` and `specs/codex-prds/`
3. Normalize each System row:
   - `Name`
   - `Status`
   - `Audit Status`
   - `Completion`
   - `Category`
   - `Layer`
   - `Priority`
   - `Complexity`
   - `Notes`
   - `Audit Results`
   - linked fields where supported by related rows
4. Do not fabricate linked relationships. If Routes/Actions/Events rows are
   missing, either create evidence-backed related rows or state the gap.
5. After writes, read Airtable back and compute missing-field counts.

## Verification

Use read-back as the source of truth:

```bash
airtable records list --base <baseId> --table <tableId>
```

For code quality claims, run the relevant tests/typechecks and cite exact counts.

## Report

Return counts before/after, created/updated records, required-field blanks,
relationship coverage, and a fresh gap report.
