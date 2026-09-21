# All Posts trash scope correction

Native duplication cleanup exposed a real mismatch: All count4 but five rows including the just-trashed copy. Live Trash mutation succeeded; this was list scope, not failed mutation or stale transport. Both the unfiltered and search list branches omitted the default non-trash constraint. Source now scopes All/Mine before total/pagination; explicit Trash remains available.

Four actual handler regressions initially2pass/2fail; after repair combined post suites25tests/90assertions pass. Full backend type gate currently fails with a shared generic media-hook inference cascade (TS2589); auth/commerce are resolving it. Admin types passed for the separate Duplicate UI action. No deployment of this list fix yet: root awaits a stable shared backend snapshot. Existing large-list/search collection and10k truncation remain a distinct scalability issue to replace with proper cursor/count contracts; this repair does not claim scalability.

Follow-up verification: scoped lint exits0 after explicit PostRow[] annotation and stable taxonomy row keys (17 pre-existing warnings/1 info remain); fresh final Admin tsc exits0 (/tmp/convexpress-duplicate-ui-final-types.log). Global worktree diff-check passes. Backend deep-instantiation gate remains owned by media/auth; no list deployment claimed. Original user checkout git status remains clean.


Root deployed the immutable revision/list snapshot to both clouds and verified ordinary staging API default/search exclusion with explicit Trash inclusion, followed by fixture deletion. Evidence: ConvexPress-Admin/output/backend-checkpoints/revision-list-20260905/live-acceptance.json. Existing unbounded search/list scaling concerns remain open.
