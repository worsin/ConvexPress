# Role assignment identity boundary repair

Source work only. Root live evidence: `output/aster-house/canonical-preview/operator-customer-auth-boundary.json` recorded a Clerk customer shown as Editor after assignment while `users.checkAdminAccess` and draft reads correctly denied operator access. Root restored Subscriber. No live writes, provider calls or deployments were performed by this slice.

## Implemented source

The shared pure policy in `packages/backend/lib/auth/roleAssignment.ts` matches the existing effective-role resolver: customer roles are compatible with website identities; internal/system roles require an explicit local or management authSource. Neither legacy internalRole/isInternal, a Clerk ID, nor a stored password establishes that source. Missing legacy authSource remains conservative. Permission resolution and management authority are unchanged.

- `roles/mutations.assign` and legacy `users.updateUserRole` reject incompatible assignments before user, roleChanges or event writes. The legacy endpoint also rejects inactive roles and derives event role/internal flags from the actual stored role instead of caller flags. Existing self/last-local-admin checks remain.
- `profiles/mutations.updateUser` applies eligibility and role.assign authority before any profile/audit mutation. Existing self/admin protections and both avatar attachment wrapper calls remain. Metadata-only edits do not reclassify identity.
- `profiles/mutations.bulkChangeRole` preflights all unique targets before writes. Self, missing and unchanged users remain skipped; incompatible targets receive per-user errors. Remaining eligible users keep partial-success semantics; administrator accounting retains at least one administrator across the whole batch. Unexpected write/event failures now abort the transaction instead of committing an incomplete per-user update.
- `profiles/mutations.createUser` is a customer creation flow: it schedules Clerk provisioning with setAuthSourceToClerk. Its explicit/default role must therefore be active and customer-compatible before any user insert or scheduled provisioning. It does not create an operator by temporarily using authSource local.
- `registration/mutations.inviteUser`, `bulkInvite`, `resendInvitation`, and explicit `acceptInvitation` require a real active customer role. Existing supported slug syntax remains; allowed slugs are shared with the form. Old incompatible invitations cannot be resent or explicitly accepted. Notifications and email behavior are unchanged.
- Native edit RoleSelector receives the actual profile authSource. It renders only eligible roles and an associated explanation. A prior incompatible assignment is a disabled unavailable-current-role placeholder, never silently shown as a valid option or automatically replaced.
- BulkChangeRoleDialog receives each selected row's current source and offers their common eligible scope. Unknown/off-page source is conservative. InviteUserForm uses the same actual role-backed customer selector, keyed by slug and constrained to supported invitation slugs. New role creation/type permissions are unchanged.

## Verification and limitations

The initial real-handler matrix reproduced five failures (two endpoints × Clerk/unresolved legacy internal assignment, plus inactive legacy assignment). Expanded profile/bulk/manual-create tests reproduced three more. Invitation creation/bulk/resend/explicit acceptance also reproduced the incompatible intent. Mounted DOM regression reproduced the Editor option presented to a Clerk account before the fix.

Latest combined checkpoint before final return-validator typing: 47 tests / 308 Bun assertions passed across assignment handlers, first-admin protections, registration security and isolated real RoleSelector/InviteUserForm/BulkChangeRoleDialog rendering. Local/management assignments, Clerk customer assignment with actual current-user lookup and continued null Admin access, unchanged rejected rows/audit/events, normalized legacy event flags, mixed bulk partial success/dedup/self/last-admin behavior, and inactive roles are covered. DOM uses mocked query rows/mutations with actual components; no browser/native acceptance claimed.

Exact returns validators were added to touched registered handlers. Finite RegisteredMutation/ObjectType boundaries replace inference cycles for four legacy exports; only compiler-proved unused suppressions were removed. Final types/check totals are appended below when complete. API arguments and serialized return shapes remain compatible; no new registered API or schema is added.

**Historical automatic signup repaired after root review:** the shared `backend/lib/auth/invitationRole.ts` validates the promised active customer role before newly invited signup writes. Both public Clerk provisioning entry points, webhook `auth.clerkSync.upsertClerkUser`, and older `registration.internals.handleExternalAuthUserCreated` use it. Historical incompatible or unavailable roles now produce an actionable error asking for revocation and a new customer invitation; they are not silently downgraded. Existing already-linked account lookup/continuity remains intact. Four actual handler regressions reproduced the old behavior then pass with unchanged invitation, absent new user and zero events. A valid customer invitation still provisions under closed registration.

## Final source gate

- 56 focused tests / 350 Bun assertions / 5 files pass, including automatic signup and prior first-admin regressions. Logs: `/tmp/role-final-tests.log`.
- Backend TypeScript and Admin TypeScript pass: `/tmp/role-final-backend-types.log`, `/tmp/role-final-admin-types.log`.
- Scoped lint: 12 new/modified helper/test/UI files, zero warnings/errors. Global `git diff --check` passes. New source formatted; legacy backend files retain their surrounding formatting with narrow changed hunks.
- No schema, permission resolver, auth classification, media policy, provider calls or deployed state changed. Additive return validators preserve existing serialized result shapes; finite annotations remove inference recursion without new suppressions.
- Native/live acceptance remains root-owned and pending. Expected checks: an existing Clerk customer shows only active customer roles with explanation; forbidden prior role is displayed as unavailable; local/managed operator options remain; mixed bulk selection excludes internal roles; Users → New shows customer invitations only. Direct incompatible mutation requests must fail even if an old client submits them.

## Root acceptance update

Root deployment and live acceptance: control plane and both site backends deployed successfully. Native Aster Editor edit and invitation forms offered active customer roles only. The actual roles.assign endpoint rejected an Editor role for that Clerk customer with ROLE_IDENTITY_INCOMPATIBLE; Subscriber role and updatedAt stayed unchanged. No new invitation was submitted. Evidence: output/aster-house/role-identity/native-options.json with screenshots. Broader alternate-path coverage remains the source handler suite, not a claim that every path was invoked live.
