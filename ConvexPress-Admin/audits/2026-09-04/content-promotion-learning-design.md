# Course and membership authored promotion design

The next adapter uses the existing model: courses, curriculum nodes (topic/lesson/section heading), prerequisite junctions, membership plans and their display benefits. Course/page/product/block restrictions refer to remapped plans and resources. Source user grants, enrollments, learner progress/completions, certificates issued, payment records, provider bindings, AI jobs and lesson edit history never enter manifests.

Courses support open/free/members/closed access and authored lesson content, progression, drip and media. Paid/recurring/external course delivery and certificates require separate adapters and fail explicitly. Course labels use existing normalized string labels, not invented taxonomy IDs. All curriculum and prerequisite collections are included; deletion or moving existing nodes between parents/courses is refused to preserve stable learner references. Counters are derived from the reviewed tree. Members courses require a reviewed gate with resolvable active plans.

Plan titles/slugs/status/grant mode/priority and benefit display fields are authored. Existing target subscription codes, role/capability bindings and benefit metadata remain untouched. New plans must be manual and have no invented billing linkage; existing paid-mode plans must match the reviewed grant mode. Source plans with role/capability bindings or benefit metadata require an explicit binding adapter instead of silently dropping their meaning. Changes are reviewed and target fingerprints protect concurrent operational edits.

The 100-record/500KB atomic bound, target/operator identity, plugin and authoring permissions, no-hook writes, idempotence and guarded update-only rollback remain. No live or deployment calls are part of this task.
