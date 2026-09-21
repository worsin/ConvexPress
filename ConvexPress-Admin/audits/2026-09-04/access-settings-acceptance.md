# Access follow-ups — September 21

Three findings from the content-access acceptance are repaired: canonical visibility/password editing, incremental reindex authorization, and deletion of unrelated membership restrictions. This closes those follow-ups, not additional original audit rows or overall production acceptance.

## Changes

- Canonical page/post settings expose Public, Private and Password protected. Existing passwords are never returned by this settings endpoint or filled into the field. Blank input retains a configured password; changing away from protection clears it. Changes require the document's publishing capability, use revision/digest conflict checks, preserve the block body and do not publish a draft. Content-history restoration does not restore an old password or access policy.
- Both full and incremental reindex require `search.reindex` or `manage_options`, resolved against the active caller and current management-session scope. An inactive account, unrelated identity or revoked session cannot use retained role privileges.
- Plan deletion only modifies rules that reference the deleted plan. Unrelated empty and nonempty restrictions remain unchanged; a shared restriction retains its other plans.

## Verification

The existing generated Promotion Lab staging backend was backed up and deployed with its complete source graph preserved; only seven intended deployment files changed. Backend, Admin and Website typechecks pass. Admin production build passes. Contract/foundation freshness and whitespace checks pass. Focused lint reports zero errors and two existing test warnings.

Affected registered-handler/backend suites: **166 tests, 1,030 assertions, zero failures**. Actual editor DOM suite: **nine tests, 149 assertions, zero failures**. Backend tests include missing publishing authority, password rotation, stale writes, revision restoration, inactive/scoped/revoked search callers, and unrelated membership rules.

Actual Electron page and post controls were exercised against staging: password creation, empty-password save prevention, save/reopen, rotation, private/public transitions and cleared password input. A page layout save with a blank password retained the configured password. **17 public canonical-read checks** verified the resulting policy, original body preservation and no password returned by document settings. Additional live page/post checks reject missing passwords and stale writes, preserve published status, and confirm that switching to public clears stored protection. Settings screenshots were inspected for both document types.

Live plan deletion preserved unrelated empty/nonempty restrictions, removed the target-only restriction and kept the shared restriction's other plan. Live incremental reindex denied two anonymous requests and accepted two authorized administrator requests. Authenticated insufficient-capability, inactive-account and management-revocation cases are registered-handler tests; this checkpoint does not claim a new live customer-login matrix.

The native embedded Website preview was not running during this focused settings check; no preview/rendered-Website acceptance is inferred. Public read-policy checks used the deployed canonical renderer API. Earlier rendered password-form acceptance remains documented separately.

## Preservation and evidence

All original **42 pages and two posts**, membership plans/rules and plugin settings compare exactly with preflight. Two owned documents were trashed and removed from search; the four owned rules and two plans were removed, including the target plan deleted during the test. API acceptance session logged out. Native operator sign-out and owned-process closure are recorded with the runtime receipt. Original app processes and controller origin configuration were preserved.

Evidence: `output/access-settings-20260921/{deployment-source.json,backend-tests.log,editor-tests.log,admin-build.log,lint.log,native-settings.json,policy-acceptance.json,mutation-acceptance.json,cleanup.json,native-cleanup.json,mt-verified.json}`. Private backups, credentials and passwords remain outside the repository. MagicTables receives a Notes-only evidence update; completion flags remain unchanged.
