# Website Import Operator Runbook

Practical guide for importing content from WordPress and WooCommerce into ConvexPress.

---

## 1. Prerequisites

**WordPress site requirements:**

- WordPress 5.6+ with REST API enabled (usually `/wp-json/wp/v2/`)
- An Application Password created for a user with Administrator role
- Permalinks set to anything other than "Plain" (REST API requires pretty permalinks)

**WooCommerce (if importing commerce data):**

- WooCommerce 5.0+ with REST API enabled
- Consumer Key and Consumer Secret generated from WooCommerce > Settings > Advanced > REST API
- Key permissions must be set to "Read" at minimum

**Elementor/custom meta (optional):**

- Install the ConvexPress custom meta endpoint plugin on the WordPress site
- This exposes hidden post meta (Elementor data, ACF fields, Yoast SEO) that the standard REST API does not return
- Without it, Elementor page layouts will import as raw HTML/shortcodes

---

## 2. Credential Setup

### WordPress Application Password

1. In WordPress admin, go to Users > Your Profile
2. Scroll to "Application Passwords"
3. Enter a name (e.g., "ConvexPress Import") and click "Add New Application Password"
4. Copy the generated password immediately -- it will not be shown again
5. In ConvexPress, enter the WordPress username and application password when adding the site

### WooCommerce API Keys

1. In WordPress admin, go to WooCommerce > Settings > Advanced > REST API
2. Click "Add Key"
3. Set Description to "ConvexPress Import", User to an admin user, Permissions to "Read"
4. Click "Generate API Key"
5. Copy the Consumer Key and Consumer Secret

### Auth Mode

- **Shared** (default): WordPress credentials are used for both WP and WooCommerce API calls. Use this when the WP user has WooCommerce admin access.
- **Separate**: WordPress and WooCommerce use independent credentials. Use this when WooCommerce API keys belong to a different user or when your WP application password lacks WooCommerce permissions.

---

## 3. Recommended Workflow

1. **Add site** -- Enter the WordPress URL and credentials in Tools > Website Import
2. **Test connection** -- Click "Test Connection" to verify credentials and detect capabilities
3. **Review capabilities** -- Check the Capabilities card to see what the system can access
4. **Dry run** -- Start an import with "Dry Run" enabled. This validates everything without writing data
5. **Review report** -- Check the Phase Summary and Findings cards for issues
6. **Full import** -- Start a real import with your desired scope and behavior settings
7. **Review dashboard** -- Check imported counts, findings, and error log
8. **Resolve findings** -- Address any errors or warnings from the reconciliation phase

---

## 4. Import Scopes

| Scope | What It Imports | Dependencies |
|-------|----------------|-------------|
| **WP Content** | Posts, pages, users, categories, tags, comments | None (core scope) |
| **Media** | Media library attachments (images, files, videos) | None |
| **Menus** | Navigation menus and menu items | Requires Menus API capability |
| **WooCommerce Catalog** | Products, product categories, product tags, attributes | Requires WooCommerce API |
| **WooCommerce Transactions** | Orders, customers, coupons | Requires WooCommerce API |
| **Elementor Data** | Page builder layouts and custom meta | Requires custom meta endpoint |

**Scope dependencies:**

- WP Content must be enabled for posts, pages, and users to be imported. Other content types (comments, categories, tags) depend on posts/pages existing.
- Media is independent but media URLs in post content are only rewritten if both Media and WP Content scopes are enabled.
- WooCommerce Transactions depends on WooCommerce Catalog (products must exist before orders can reference them).

---

## 5. Behavior Options

| Option | Default | Description |
|--------|---------|-------------|
| **Dry Run** | Off | Simulate the entire import without writing any data. Generates a full report. |
| **Update Existing** | Off | When a previously imported item is found, overwrite it with the source data. When off, existing items are skipped. |
| **Preserve Local Edits** | On | Skip items that have been locally modified since their last import. Only applies when Update Existing is on. |
| **Import Drafts** | Off | Include draft and pending posts/pages. By default, only published content is imported. |
| **Tombstone Deleted** | Off | When source items have been deleted since the last import, mark the local copies as tombstoned (soft-deleted) rather than leaving them as orphans. |

---

## 6. Rerun Behavior

The import system is idempotent. Running the same import twice produces the same result.

**How it works:**

- Every imported item gets a source hash computed from its content at import time
- On rerun, the system fetches the source item, computes its hash, and compares it to the stored hash
- If the hash matches, the item is skipped (counted as "skipped" in the report)
- If the hash differs, the item is updated only if "Update Existing" is enabled
- ID mappings (WordPress ID to ConvexPress ID) persist across runs, ensuring the same source item always maps to the same local record

**Conflict resolution:**

- When "Update Existing" is off: changed items are skipped and reported as "skipped"
- When "Update Existing" is on but "Preserve Local Edits" is also on: items edited locally are skipped
- When "Update Existing" is on and "Preserve Local Edits" is off: source data overwrites local data unconditionally

---

## 7. Common Errors

### Authentication Failures (401/403)

- **401 Unauthorized**: Application password is incorrect or has been revoked. Regenerate it in WordPress.
- **403 Forbidden**: The WordPress user lacks sufficient permissions. Use an Administrator-role account.
- **WooCommerce 401**: Consumer Key/Secret is wrong. Regenerate in WooCommerce settings.

### Missing Capabilities

- **Menus API unavailable**: The WP-REST-API-Menus plugin may not be installed, or the site uses a non-standard menu endpoint. Menus will be skipped.
- **Custom Meta Endpoint unavailable**: The ConvexPress meta endpoint plugin is not installed. Elementor layouts will import as raw content.
- **WooCommerce API unavailable**: WooCommerce is not installed or its REST API is disabled.

### Rate Limiting (429)

- WordPress or the hosting provider is throttling API requests
- The import system automatically backs off and retries
- If persistent, check the host's rate limit settings or add the ConvexPress server IP to an allowlist

### Stale Jobs

- A job stuck in "running" status for more than 30 minutes likely encountered an unrecoverable error
- Cancel the job and start a new one
- Check the Error Log for the last recorded error before the stall

### Media Download Failures

- Large media files may time out during download
- The system retries failed media downloads up to 3 times
- If a specific file consistently fails, it may exceed the host's max upload size or be behind authentication

---

## 8. Production Cutover Checklist

Before going live with imported content:

- [ ] Run a full (non-dry-run) import with all desired scopes enabled
- [ ] Verify the Phase Summary shows expected counts for each content type
- [ ] Confirm zero errors in the Findings card (warnings are acceptable)
- [ ] Spot-check 5-10 imported posts for correct content, formatting, and media
- [ ] Verify imported media files load correctly (check a few image URLs)
- [ ] If using Elementor, confirm page layouts render correctly on the website
- [ ] Check that categories and tags are correctly assigned to posts
- [ ] Verify menu items link to the correct imported pages/posts
- [ ] If importing WooCommerce data, verify product prices, images, and categories
- [ ] Test the website's public-facing pages to confirm imported content displays
- [ ] Set up DNS / domain pointing if switching from the WordPress site
- [ ] Disable or restrict the WordPress site to prevent content drift
- [ ] Run one final import to catch any last-minute changes
- [ ] Verify the final report shows no new errors
