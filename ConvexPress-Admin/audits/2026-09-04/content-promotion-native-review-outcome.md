# Native authored-content review checkpoint

Implemented in the isolated hardening worktree. No browser/native operations, live API calls, deployment, commit, or push were performed by this agent. Root owns rendered acceptance and deployment.

## Surface and behavior

Sites → website now includes a collapsed Content promotion panel. It uses the already loaded website environments/connections, lets the operator choose connected staging and production links, and requires distinct ready/compatible instances with matching schemas. Opening the panel adds one batched permission subscription covering read, promote and administer on each instance plus production operation permission. The broker remains authoritative.

Named source pickers cover pages, posts, menus, media, events, products, categories, courses and active membership plans. Only explicit Load content/Load more actions fetch source lists; page/post/product and media/event pickers paginate. Existing menu/category/course/plan APIs have their own fixed collection bounds. Operational user/grant/order lists are never called. The picker projects only IDs, titles and authored status/slug, retains selected IDs across content types, caps the total explicit selection at 100, and optionally includes presentation. Export-discovered dependencies appear in the receipt. Unsupported source models still fail through the existing adapter guards.

Source loads exchange the existing signed administrator session with promotion capabilities, validate its website/instance/origin/role/capabilities/expiry, and use a short-lived in-memory ConvexHttpClient. Canonical HTTPS Convex cloud origins are required, redirects are rejected, source reads time out after 15 seconds, client logging is disabled and auth is cleared on both success and rejection. No bearer is persisted. A single busy guard prevents overlapping picker/preview requests.

Preview calls the existing control-plane broker with the exact selection and empty media/dependency bindings. The same pair and selection reuse an idempotency key on retry. Start new review deliberately resets that key. This UI does not upload media, guess bindings, apply changes, or replace a database.

The receipt view shows source/target identities, readiness/blockers, media prerequisites, expiry and incoming validated authored values. Expanded records lead with readable title/slug/path/status/excerpt fields and safe structured article text, emphasis, lists, quotations and code. Exact JSON and technical field names are secondary under Raw authored data. Blocks, embeds, links and unsupported formatting are marked as requiring website preview; no embedded media is fetched. It never renders authored HTML. Expiry updates locally without additional subscriptions. Only the receipt ID is kept in localStorage, keyed to operator and website; Open saved review performs an explicit authorized read and checks the connection pair again. The entire subtree remounts when operator or website changes, and generation guards discard stale pair results. Error boundaries isolate this panel from Sites. Lifecycle copy points to the new Sites preview and preserves restore/snapshot guards.

## Strict broker return contracts

Every registered broker function now declares returns: begin has a finite typed target/receipt result; finish and failReview return null explicitly; get and preview use one finite review-result validator. `canApply` is a literal false. Known authored kinds use a finite enum.

Public authored entries now use `{ key, kind, sourceRevision, dataJson }`. The private manifest is still unchanged and is revalidated with the canonical strict manifest/kind schemas before serialization. Stored manifest/review size bounds are checked on reads. No arbitrary Convex-value or `v.any` return validator was added. The UI bounds and parses dataJson with the same canonical authored-kind schema; malformed, non-allowlisted or old data-shaped entries show an explicit invalid state without displaying unchecked values. This uses a direct workspace source import of the existing site-contract schema; no package install, schema duplication or dependency lock changes were needed.

This is a new public DTO shape; root must deploy the control-plane functions before accepting the updated native surface. Existing stored review receipts need no data migration. Historical live result artifacts that contain `data` accurately represent the earlier DTO.

## Verification

- Integrated offline suite: **51 tests / 237 assertions / 8 files**, all pass. `/tmp/promotion-review-integrated-tests-complete.log`.
- Focused UI tests cover combined selection limit/removal, projection privacy/deduplication, scoped receipt keys, escaped values, explicit media blockers/no apply button, stale-ready expiry invalid authored payload refusal, safe article marks/list structure and refusal to fetch/render embedded images or executable links.
- Session tests prove wrong audience/role/capability/expiry/origin never receives the bearer and both successful/failed reads clear auth.
- Broker tests invoke the real handlers and additionally exercise Convex runtime return validation, including rejection of `canApply: true`, unexpected raw data, and a corrupted non-allowlisted persisted manifest. Existing secret-echo, identity, request-retry, media, permission and transport regressions remain green.
- Control-plane types: `/tmp/promotion-review-cp-types-final.log`, process 23860, exit 0.
- Admin web types: `/tmp/promotion-review-admin-types-polish.log`, process 57726, exit 0.
- Offline CP API bindings: **104 modules / 2 components**, generated and checked. Global `git diff --check` passes.
- No site backend or Website compact contract changes are required by this slice.

## Root acceptance sequence

1. Deploy updated CP functions, then use the current native renderer source/build.
2. Sites → Aster House website → Preview staging content. Verify the single ready staging and production pair is identified correctly.
3. Load Pages and choose Materials and care. Create preview: expect the reviewed receipt, one incoming record and no apply control. Expand it and verify title/content values; inspect receipt identity and expiry.
4. Retry unchanged selection: expect the same receipt. Open saved review, then reopen Sites: receipt ID persists and the authorized read returns the same current result.
5. Create a new review for the member notebook page: expect explicit target-plugin/media blockers with included plan/benefit/restriction/media records. No production mutation should occur.
6. Verify keyboard access to selectors/checkboxes/details and loading/error copy. Switch operator or website during a pending load: prior authored data must disappear and never repopulate the new scope.

Rendered/native proof remains root-owned. This checkpoint is not full promotion completion: verified media transport, manual dependency mapping UI, before-values, apply/rollback orchestration, receipt retention, large-graph pagination/jobs, full inactive plan browsing and the remaining unsupported adapters are still outside this slice. Existing catalog list APIs scan within their historical limits; the UI does not claim complete enumeration beyond those bounds.
