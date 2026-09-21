# Required installation records

Root observed `emails/queries:getTemplate` returning NOT_FOUND for `lms-course-enrolled` on the fresh staging database. Registering an email event listener does not create its template. The existing `emails/internals:bootstrapTemplates` was called only by email-settings or repair flows and updates metadata on existing templates.

Implemented internal `bootstrap/requiredRecords:ensure {}`. It creates only missing templates from `emails/templateDefaults.ts`: 59 built-ins, including six LMS and five shipping templates. Indexed unique slug lookup prevents duplicate creation; any existing record is preserved in full, including disabled state, custom subject/body, variables, recipient settings, default-reset content, and timestamps. Duplicate existing slugs fail rather than being silently adopted.

The same initializer creates the conventional default Uncategorized category when there are no categories at all. Post category updates expect a persisted default category, so a fresh installation needs it. If any category already exists, bootstrap preserves the operator's category choices; it does not change an existing default or repair a deliberately unset default.

The desktop initialization sequence is now identity, roles, missing required records, missing listeners, health verification, and controller enrollment. Required records are installed before listeners are registered. The mutation never touches provider credentials, delivery configuration, email queues, event records, listener records, or scheduled work. The two explicitly disabled staging LMS email listeners remain unchanged. Existing queued emails are preserved rather than processed or canceled.

Narrow initialization inventory:

| Area | Current source behavior | Installation requirement |
| --- | --- | --- |
| Email templates | Admin lookup and event handlers require stored template rows | Missing-only insert implemented |
| Default category | Post category update consults stored default term | Create on a fresh category inventory only |
| Settings | `settings/queries.ts` merges `getDefaults` with stored values; raw `get` intentionally returns a document or null | No eager rows needed |
| Email configuration | `helpers/email.ts:getEmailSettings` supplies configuration defaults; actual provider credentials/configuration remain separate | Do not configure or enable delivery during bootstrap |
| Notification preferences | `notifications/queries.ts` and event handlers use `NOTIFICATION_TYPES` defaults when user preferences are absent | No per-user seed needed |
| Form security | `extensions/forms/spam.ts:loadSecuritySettings` applies honeypot/rate-limit defaults without a singleton row | No eager seed needed |
| Form confirmations/notifications | Form creation and confirmation flows provision their own per-form defaults | No global form/content seed |
| LMS demo content, tax rules | Explicit authoring or operator-specific setup, not required generic system rows | Do not run these seeds during installation |
| Event/route/notification definition catalogs | Runtime dispatch uses event listeners and compiled registries rather than requiring imported catalog records | No broad catalog import added |

Verification: new actual-handler regressions failed with the missing module, then passed. Combined bootstrap, notification-registry and settings suite passed 11 tests / 192 assertions. An additional queue-preservation assertion passed in the final focused run (2 tests / 15 assertions). Backend and desktop TypeScript checks passed. Tests verify fresh defaults, repeated no-op, partial repair, customized/disabled template preservation, existing category choices, disabled LMS listeners, no scheduling, and unchanged pending email data.

Root can deploy and invoke `bootstrap/requiredRecords:ensure {}` on the exact intended staging database with protected credentials, then read back `lms-course-enrolled` and the other required templates. This agent made no live database, provider, browser, deployment, or email calls.
