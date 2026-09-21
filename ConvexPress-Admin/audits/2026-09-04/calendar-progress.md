# Calendar implementation checkpoint

Historical foundation checkpoint, superseded by [calendar-outcome.md](calendar-outcome.md). Calendar is now renderer/browser acceptance 94/136; 42 remain. The implementation status below records the earlier checkpoint, not the current runtime.

## Implemented foundation

- Closed arguments/results and bounded per-block month/cursor URL state. Saved category filters and authority cannot be overridden by visitor state.
- Civil month/day boundaries in an explicit IANA zone, including midnight DST jumps, 23/25-hour days, half-hour shifts, leap years and skipped dates. Half-open intervals exclude an event ending exactly at the next day's boundary.
- Month navigation preserves other blocks, page query state and anchors; resets only this calendar cursor.
- Derived interval-bucket algorithm stores one key per event. Point lookups use at most 53 disjoint index ranges and find exactly events continuing across a month boundary, without scanning unrelated history or one row per event day. 4,000 deterministic interval/point trials and exact boundary cases pass. This is not yet a persisted index or live reader.

## Reader and authoring implementation next

1. Add derived event bucket and indexes for status/category plus bucket/start and bucket/end. Recompute in native create/update, promotion apply/rollback and restore writers; never accept a caller-supplied bucket. Backfill existing records with bounded progress and refuse incomplete index reads. Preserve per-site databases.
2. Read carryovers using eventCarryoverRanges(monthStart), then starts within [monthStart,monthEnd). Carryovers share the first visible instant; within each bucket stable indexed ordering supplies a deterministic cursor. Later events are start chronological. Return an explicit continuation, never silently truncate at the block limit.
3. Bind cursors to environment, document, block/filter/month/timezone and index phase. Recheck current plugin/membership access on every request and source. Meter full source bytes and query reads.
4. Use explicit block timeZone when set; otherwise current site general.timezone. The current-month default uses that zone. URLs feed the existing page-level subscription channel without block-owned fetches.
5. Complete accessible month/agenda renderer, previous/next/today links, carryover/multiday display, paging visibility, native picker, four-pack/mobile BlockDemo and real Electron/staging acceptance.

No Calendar runtime deployment or completion claim. Full original production audit remains active.
