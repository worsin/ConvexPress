# Partial settings updates preserve saved data

Confirmed data loss in both `settings/mutations:updateSection` and `importAll`: new values were assembled from defaults plus incoming fields, omitting existing persisted values. A partial save could reset unrelated settings and clear saved credentials. The stale `updateSection` comment called its input complete, but its own usage example sends only `siteTitle`; current UI callers also submit partial sections. Examples include `pages/blocks.tsx` (only disabled block names), `settings/search.tsx` (only Meilisearch host/key), and `settings/ai.tsx` (selected provider fields).

Both mutations now merge defaults, stored values, then incoming fields. This is a top-level field patch: an explicitly supplied nested object or array replaces that field, preserving intentional resets. Existing read-time default behavior is unchanged. Settings imports likewise update only fields present in selected section objects.

Only explicitly supplied secrets undergo sentinel handling or encryption. Omitted encrypted values remain exactly unchanged instead of being cleared or encrypted again. The existing sentinel preserves a secret; an explicit empty string clears it; explicit default-value payloads reset those fields. Import compatibility for encoded secret values remains unchanged.

A related defect silently discarded secret-only rotations because change detection compared two masked `__set__` values. Change detection now compares stored values internally, then masks every old/new value before emitting events. A rotation is saved and audited as a field change with both values masked; no plaintext or ciphertext is included in the event payload. A sentinel-only update remains a no-op.

Actual-handler regressions reproduced both failures before the fix. Tests cover partial update/import, custom fields, unrelated payment configuration, stored ciphertext preservation, plaintext decryption correctness, secret-only rotation, masked event values, sentinel no-op, explicit clear, and reset-to-default payloads. Full settings suite: 24 tests passed, 117 assertions, including appearance migration and reset behavior.

Live follow-up found the general section validator required `siteTitle` before merge. Both update/import now validate the complete merged candidate, using sentinels only for retained stored secrets while validating supplied values as entered. Actual-handler tests reproduce `{dateFormat:"Y-m-d"}` against saved general settings and verify title, tagline and URL preservation; explicitly empty title is still rejected without changes. This corrects the gap in the original payment-section-only regression coverage.

Final combined settings/bootstrap/notification suite: 37 tests passed, 316 assertions. Backend TypeScript and scoped whitespace checks pass. No live database, provider, browser, deployment, or email calls were made.
