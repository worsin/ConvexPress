# WordPress + WooCommerce Import Production Strategy

## North Star

Build one production-grade website import system that can ingest an Elementor-driven WordPress + WooCommerce site end-to-end, preserve source fidelity, map all source entities to ConvexPress entities, report every skipped, failed, or ambiguous mapping, and support safe reruns without corrupting local data.

This is not two sync paths bolted together. WordPress content, Elementor data, media, menus, comments, WooCommerce catalog data, WooCommerce transactional data, cleanup, reconciliation, reporting, and operator UX must operate through one job model.

## Production Guarantees

- Every source object gets a stable source-to-local mapping when it creates or updates a destination entity.
- Every write is idempotent or explicitly conflict-detected.
- Every phase is paginated, resumable, and observable.
- WordPress and WooCommerce phases share one job, one report model, one finding model, and one reconciliation model.
- Elementor metadata and WooCommerce metadata are preserved even when not fully interpreted.
- Operators get a clear final report showing imported counts, warnings, errors, relationship gaps, source capability gaps, and next actions.
- Default behavior is non-destructive.
- Credentials are encrypted and never leak into logs, reports, generated errors, or UI output.

## Execution Discipline

Claude should work one checklist item at a time.

1. Mark the current checklist item as in progress.
2. Inspect current code before editing.
3. Implement the smallest complete production slice for that item.
4. Run targeted backend and web type checks.
5. Regenerate Convex artifacts when schema/functions change.
6. Mark the checklist item complete.
7. Stop and report what changed, files touched, verification run, remaining risks, and the next checklist item.

Do not combine unrelated checklist items into one large change unless one item is technically impossible to complete without the other. If that happens, explain the coupling before implementing.

## Implementation Strategy

### 1. Reframe The System

Rename the user-facing concept from "WordPress Sync" to "Website Import" or "WordPress/WooCommerce Import".

Keep internal table and function names if a full rename creates unnecessary migration risk, but the admin UI and operator workflow should make clear this is one unified import system.

Acceptance criteria:

- Admin UI describes one unified import system.
- Phases include WordPress content, Elementor, media, menus, comments, WooCommerce catalog, WooCommerce transactions, cleanup, and reconciliation.
- No UI implies WooCommerce is a detached clone or separate add-on path.

### 2. Add A Durable Run Report Model

Create a durable import report table separate from live job state.

The report should capture:

- Job ID
- Site ID
- Start and completion timestamps
- Final status
- Detected source capabilities
- Selected import scope
- Per-phase counts
- Per-phase warnings and errors
- Reconciliation finding counts
- Total created, updated, skipped, conflicted, and failed entities
- Final operator summary

Acceptance criteria:

- Every completed, failed, or cancelled job leaves a report.
- Reports survive beyond live job progress.
- Deleting a site or job cleans related reports safely.
- UI shows the latest report and historical reports.

### 3. Add Import Configuration

Add scoped import configuration before job start.

Initial scope options:

- WordPress content
- Elementor data
- Media
- Menus
- Comments
- WooCommerce catalog
- WooCommerce customers
- WooCommerce orders
- WooCommerce coupons
- WooCommerce reviews
- Cleanup and reconciliation

Initial behavior options:

- Dry run
- Update existing mapped entities
- Preserve local edits
- Import unpublished and draft content
- Import historical orders
- Import refunds
- Import reviews
- Import coupons
- Date range filters for orders and content
- Entity limit for test runs

Acceptance criteria:

- Job stores a snapshot of selected config.
- Phase runner respects the config.
- UI prevents impossible selections based on capability detection.

### 4. Add Dry Run

Implement dry run as a real execution mode, not a fake UI flag.

Dry run should:

- Fetch source data.
- Detect capabilities.
- Calculate entity counts.
- Validate credentials and endpoints.
- Resolve potential mapping collisions.
- Produce a report.
- Avoid writing imported destination entities.

Dry run may write operational metadata such as jobs, reports, and findings.

Acceptance criteria:

- Dry run never mutates imported destination entities.
- Dry run reports what would be created, updated, skipped, or conflicted.
- Dry run can be run repeatedly without destination side effects.

### 5. Harden Source Adapter Boundaries

Create clear source clients/adapters:

- WordPress REST client
- WooCommerce REST client
- Elementor/meta client
- Menus/navigation client
- Media client

Each adapter should own:

- Pagination
- Retries
- Rate limiting and backoff
- Auth handling
- Response normalization
- Error normalization
- Endpoint capability detection

Acceptance criteria:

- Import phases do not build raw endpoint URLs ad hoc.
- WooCommerce and WordPress credentials are handled explicitly.
- All external fetches have typed normalized results and consistent error objects.

### 6. Finish Elementor Fidelity

Elementor import must preserve enough data to rebuild, transform, or render pages later.

Preserve:

- `_elementor_data`
- `_elementor_css`
- `_elementor_page_settings`
- `_elementor_template_type`
- `_wp_page_template`
- Elementor Pro metadata where available
- Unknown Elementor and WordPress post meta in a raw metadata bucket

Acceptance criteria:

- Posts and pages import Elementor data correctly.
- Missing custom meta endpoint is reported clearly.
- Elementor parse failures do not kill the whole import.
- Raw source data is preserved when transformation is incomplete.

### 7. Add Media URL Rewrite Registry

Create a media URL mapping registry that maps:

- Source media ID to local asset ID
- Source URL to local URL
- Resized and intermediate image URLs where possible

Use it to rewrite:

- Post and page content HTML
- Elementor JSON image references
- Product images
- Product variation images
- Product gallery images
- Category thumbnails
- Menu item images if present

Acceptance criteria:

- Imported content does not retain avoidable remote source URLs.
- Unresolved URLs are reported.
- Rewrites are idempotent and rerunnable.

### 8. Strengthen Idempotency

Every imported entity needs stable mapping and deterministic update behavior.

Rules:

- If a mapped source object exists locally, update or skip based on config.
- If local data changed since import, detect conflict when preservation mode is enabled.
- If a local object exists with the same slug, SKU, email, order number, coupon code, or source URL but no mapping, detect collision before creating duplicates.
- Store source hashes where practical.

Acceptance criteria:

- Running the same import twice does not duplicate products, posts, users, orders, coupons, reviews, media, or mappings.
- Collision cases are reported instead of silently creating bad data.
- Source hashes allow unchanged entities to be skipped.

### 9. Add Conflict Detection

Conflict detection should cover:

- Slugs
- SKUs
- Emails, users, and customers
- Order numbers
- Coupon codes
- Media filenames and source URLs
- Taxonomy paths
- Menu handles
- Locally modified mapped records

Acceptance criteria:

- Conflicts are visible in the run report.
- Import config controls whether to skip, update, or fail on conflict.
- Meaningful local edits are not silently overwritten.

### 10. Complete WooCommerce Product Fidelity

Expand product import beyond the baseline.

Cover:

- Simple, variable, grouped, and external products
- Variations
- Attributes
- Global attributes
- Categories and tags
- Product images and galleries
- Downloadable products
- Virtual products
- Stock and inventory
- Dimensions and weight
- Prices and sale prices
- Tax class and tax status
- Upsells and cross-sells
- Related product references
- Raw WooCommerce metadata

Acceptance criteria:

- Core product data imports into ConvexPress commerce tables where the schema supports it.
- Unsupported fields are preserved in metadata and report findings.
- Product relationships are reconciled after all products are imported.

### 11. Complete WooCommerce Order Fidelity

Expand order import to include:

- Billing and shipping addresses
- Line items
- Tax lines
- Shipping lines
- Fee lines
- Coupon lines
- Refunds
- Payment transaction IDs
- Customer linkage
- Guest customer handling
- Order notes if supported or needed
- Raw WooCommerce metadata

Acceptance criteria:

- Order totals reconcile against line items, tax, shipping, fees, discounts, and refunds.
- Guest orders are represented without corrupting real user or customer identity.
- Refund and payment relationships are validated in cleanup.

### 12. Complete Coupons, Reviews, And Customers

Coupons should cover:

- Code
- Amount and discount type
- Usage limits
- Date limits
- Product and category restrictions where supported
- Raw metadata

Reviews should cover:

- Product linkage
- Reviewer linkage
- Verified purchase detection
- Rating, content, and status
- Guest reviewer support

Customers should cover:

- User and customer mapping
- Addresses
- Order linkage
- Account metadata
- Duplicate email handling

Acceptance criteria:

- Coupons, reviews, and customers are first-class import concerns.
- Relationship gaps are reported clearly.

### 13. Repair Hierarchies And Relationships

Add post-import repair and reconciliation passes for:

- Taxonomy parent/child hierarchy
- Comment parent/child hierarchy
- Menu item hierarchy
- Product and variation parent linkage
- Order, order item, product, and customer linkage
- Refund, payment, and order linkage
- Review, product, customer, and order linkage
- Upsell and cross-sell product references

Acceptance criteria:

- Repair pass is resumable.
- Missing relationship targets become findings.
- Same-source mapping is enforced so relationships do not connect across different imported sites.

### 14. Add Deletion And Tombstone Handling

Add source tombstone support.

Modes:

- Never delete local data
- Mark missing source objects as stale
- Soft-delete mapped local data
- Hard-delete only with explicit destructive option

Acceptance criteria:

- Reruns can detect source objects that disappeared.
- Default behavior is non-destructive.
- Destructive behavior requires explicit config.

### 15. Add Retry, Backoff, And Failure Semantics

Add retry controls around external calls and internal phase operations.

Support:

- Transient HTTP retries
- Rate-limit backoff
- Checkpointing cursors after successful batches
- Fail-fast behavior for invalid credentials and schema mismatches
- Resumable retry from the last cursor

Acceptance criteria:

- A failed network request does not lose completed progress.
- Operators can rerun failed jobs.
- Errors distinguish auth, capability, source data, destination validation, and unknown failures.

### 16. Add Per-Entity Logs And Findings

Do not flood the main job error array. Use structured per-entity findings.

Finding shape:

- Job ID
- Site ID
- Phase
- Source type
- Source ID
- Destination table or entity if known
- Severity
- Code
- Message
- Metadata
- Created timestamp

Acceptance criteria:

- UI can filter and paginate findings.
- Reports summarize findings by severity and code.
- Detailed records are available for debugging.

### 17. Add Capability-Gated UX

The UI should detect capabilities before import and explain consequences.

Capabilities:

- WordPress REST reachable
- WordPress auth valid
- WooCommerce REST reachable
- WooCommerce auth valid
- Menus endpoint available
- Custom meta endpoint available
- Elementor metadata available
- Media access available

Acceptance criteria:

- UI blocks impossible import scopes.
- Missing optional capabilities degrade gracefully with warnings.
- Operator sees exactly what will and will not be imported.

### 18. Finish Credential Model

Keep WordPress application password support, but add explicit WooCommerce credential support if needed.

Support:

- WordPress application password
- WooCommerce consumer key and secret
- Optional same-credential mode if source supports it
- Encrypted storage
- Credential validation probe
- Capability-specific auth errors

Acceptance criteria:

- WooCommerce imports do not depend on accidental WordPress credential compatibility.
- Credentials are never leaked into logs, reports, or UI.
- Credential rotation and update flow is supported.

### 19. Add Tests And Fixtures

Add fixtures for:

- Elementor WordPress content
- Posts, pages, media, menus, and comments
- WooCommerce simple products
- WooCommerce variable products and variations
- Coupons
- Customers
- Guest orders
- Registered-customer orders
- Refunds
- Reviews
- Missing relationship targets
- Duplicate slugs, SKUs, and emails

Add tests for:

- Adapter normalization
- Phase behavior
- Idempotent reruns
- Conflict detection
- Dry-run no-mutation behavior
- Reconciliation findings
- Cleanup and tombstones

Acceptance criteria:

- A representative import can be validated without hitting a live WordPress site.
- Rerunning the same fixture does not create duplicates.
- Relationship failures produce expected findings.

### 20. Add Performance Hardening

Implement the large-store safeguards that matter.

Required:

- Cursor pagination everywhere
- Bounded batch sizes
- Scheduled continuation for long phases
- Rate-limit backoff
- No unbounded in-memory accumulation
- Indexed queries for mappings, findings, and reports
- Summary aggregation without scanning huge tables in UI queries

Acceptance criteria:

- Import can handle large catalogs and order histories without hitting Convex limits.
- UI queries stay paginated.
- Cleanup and reconciliation are scheduled and resumable.

### 21. Add Post-Import Dashboard

Create a practical operator dashboard.

Show:

- Latest run status
- Import scope
- Capabilities
- Counts by phase and entity
- Created, updated, skipped, conflicted, and failed counts
- Warnings and errors
- Reconciliation findings
- Unresolved relationship gaps
- Source URLs still present after media rewrite
- Next recommended actions

Acceptance criteria:

- Operator can decide whether the import is production-ready from one screen.
- Detailed findings are reachable but not dumped all at once.

### 22. Add Operator Documentation

Create a short runbook.

Include:

- Required source plugin or configuration
- Required WordPress and WooCommerce credentials
- Elementor meta endpoint requirement
- Recommended dry-run workflow
- Import modes
- Rerun behavior
- Conflict handling
- Cleanup and tombstone behavior
- Common failure messages
- Production cutover checklist

Acceptance criteria:

- A non-author of the system can run a full import safely.
- Limitations are explicit.

## Definition Of Production Quality

The system is production quality when:

- A real Elementor + WooCommerce site can be imported without manual database surgery.
- Reruns are safe.
- Failures are resumable.
- Missing capabilities are visible before import.
- Unsupported data is preserved or reported, not silently discarded.
- WooCommerce and WordPress content are part of one job, report, and reconciliation model.
- The admin UI clearly shows whether the imported site is complete, partial, or blocked.
