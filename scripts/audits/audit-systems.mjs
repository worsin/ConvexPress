#!/usr/bin/env node
/**
 * Cross-references each Airtable Systems record against the actual
 * ConvexPress codebase. Outputs a per-system verification matrix so the
 * stabilization audit can mark records Complete or surface real gaps.
 *
 * Reads system names from /tmp/cp-systems.tsv (produced by
 *   airtable records list --base <airtable-base-id> --table Systems
 *   | jq ... > /tmp/cp-systems.tsv
 * ).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/Users/worsin/Development/ConvexPress";
const ADMIN = join(ROOT, "ConvexPress-Admin");
const CONVEX = join(ADMIN, "packages/backend/convex");
const ADMIN_NAV = join(ADMIN, "apps/web/src/lib/admin-shell/nav-config.ts");
const SCHEMA_FILE = join(CONVEX, "schema.ts");

// Map Airtable system name → expected backend folders / nav keywords.
// Each entry is a single source of truth — adding a system here lets the
// audit confirm presence without ambiguity.
const SYSTEM_MAP = {
  "Page System": { backend: ["pages"], nav: ["/pages"], schema: ["posts"] },
  "Cart System": { backend: ["commerce"], schema: ["commerce_carts", "commerce_cart_items"], file: "commerce/cart.ts" },
  "Menu System": { backend: ["menus"], nav: ["/menus"], schema: ["menus", "menuItems", "menuLocations"] },
  "AI Content Generation": { backend: ["ai"], schema: [] },
  "Event Dispatcher System": { backend: ["events", "eventDefinitions"], schema: ["events", "eventDefinitions", "eventListeners"] },
  "SEO System": { backend: ["seo"], nav: ["/seo"], schema: ["seoSettings"] },
  "Recipe System": { backend: ["recipes"], nav: ["/recipes"], schema: ["recipes", "recipe_categories"] },
  "Media System": { backend: ["media"], nav: ["/media"], schema: ["media", "mediaMeta", "mediaSizes"] },
  "Post System": { backend: ["posts"], nav: ["/posts"], schema: ["posts", "postMeta"] },
  "Product Variants System": { backend: ["commerce"], schema: ["commerce_product_variants"], file: "commerce/variantHelpers.ts" },
  "Subscription Billing System": { backend: ["commerceSubscriptions"], nav: ["/commerce/subscriptions"], schema: ["commerce_subscriptions", "commerce_subscription_invoices"] },
  "WordPress Sync System": { backend: ["wordpressSync"], nav: ["/wordpress-sync"], schema: ["wordpressSites", "wordpressSyncJobs"] },
  "Audit Log System": { backend: ["auditLogs"], nav: ["/audit-log"], schema: ["auditEntries"] },
  "Analytics System": { backend: ["analytics"], schema: ["pageEvents", "pageAnalyticsDaily"] },
  "Content Editor System": { backend: ["editor"], schema: ["editorLocks"] },
  "User Profile System": { backend: ["profiles"], nav: ["/users"], schema: ["users", "commerce_customer_profiles"] },
  "Returns & Refunds System": { backend: ["commerceReturns"], nav: ["/commerce/returns"], schema: ["commerce_return_requests", "commerce_return_items"] },
  "Membership Plan System": { backend: ["membership"], nav: ["/membership"], schema: ["membership_plans", "membership_plan_benefits"] },
  "Checkout System": { backend: ["commerce"], file: "commerce/checkout.ts", schema: ["commerce_checkout_sessions"] },
  "Password Management System": { backend: ["password"], schema: ["failedLoginAttempts"] },
  "Shipping Zone System": { backend: ["shipping"], schema: ["commerce_shipping_zones"], file: "shipping/queries.ts" },
  "Product Category System": { backend: ["commerce"], schema: ["commerce_product_categories"], file: "commerce/categories.ts", nav: ["/commerce/categories"] },
  "Tax System": { backend: ["commerce"], schema: ["commerce_tax_classes", "commerce_tax_rules"], file: "commerce/tax.ts" },
  "API System": { backend: ["api"], nav: ["/api-keys"], schema: ["apiKeys", "apiRateLimitWindows"] },
  "KB Collections System": { backend: ["kb"], nav: ["/kb"], schema: ["kb_collections", "kb_collectionArticles"] },
  "KB Search & Analytics": { backend: ["kb"], schema: ["kb_searchQueries", "kb_pageViews"] },
  "Settings System": { backend: ["settings"], nav: ["/settings"], schema: ["settings"] },
  "Role & Capability System": { backend: ["roles", "capabilities"], nav: ["/roles"], schema: ["roles", "capabilities", "roleChanges"] },
  "Payment System": { backend: ["commerce"], schema: ["commerce_payment_transactions", "commerce_payment_captures"], file: "commerce/payments.ts" },
  "Auth System": { backend: ["auth"], schema: ["users", "refreshTokens"], file: "auth.config.ts" },
  "Customer System": { backend: ["commerce"], file: "commerce/customers.ts", schema: ["commerce_customer_profiles", "commerce_customer_addresses"] },
  "Order System": { backend: ["commerce"], schema: ["commerce_orders", "commerce_order_items"], file: "commerce/orders.ts" },
  "RSS/Feed System": { backend: ["feeds"], schema: [] },
  "Sitemap System": { backend: ["sitemaps"], schema: ["sitemapCache", "sitemapGenerationLog"] },
  "Dashboard System": { backend: ["dashboard"], nav: ["/dashboard"], schema: ["dashboardPreferences"] },
  "UPS Direct Integration": { backend: ["shipping"], file: "shipping/providers" },
  "Registration System": { backend: ["registration"], schema: ["invitations"] },
  "DHL Express Integration": { backend: ["shipping"], file: "shipping/providers" },
  "Reviews & Ratings System": { backend: ["commerceReviews"], schema: ["commerce_review_items", "commerce_review_helpful_votes"] },
  "Support Analytics System": { backend: ["support"], schema: ["support_inbound_events"] },
  "Revision System": { backend: ["revisions"], schema: ["revisions"] },
  "Digital Products System": { backend: ["commerceDigital"], schema: ["commerce_digital_files", "commerce_download_tokens"] },
  "KB Article System": { backend: ["kb"], nav: ["/kb"], schema: ["kb_articles", "kb_articleVersions"] },
  "Support Integration System": { backend: ["support"], schema: ["support_channels", "support_inbound_events"] },
  "KB Category System": { backend: ["kb"], schema: ["kb_categories"] },
  "Custom Field System": { backend: ["customFields"], nav: ["/custom-fields"], schema: ["fieldGroups", "fieldDefinitions"] },
  "Gallery System": { backend: ["gallery"], nav: ["/gallery"], schema: ["gallery_albums", "gallery_albumItems"] },
  "Support Deflection System": { backend: ["support"], schema: ["support_deflectionLogs"] },
  "Routing System": { backend: ["routing", "routeDefinitions"], schema: ["routeDefinitions", "redirects"], nav: ["/redirects"] },
  "Site Notification System": { backend: ["siteNotificationDefinitions", "notificationEngine"], schema: ["siteNotifications", "siteNotificationDefinitions"] },
  "FedEx Direct Integration": { backend: ["shipping"], file: "shipping/providers" },
  "Taxonomy System": { backend: ["taxonomies"], schema: ["terms", "termRelationships"] },
  "Discount System": { backend: ["commerce"], schema: ["commerce_discount_codes", "commerce_discount_usages"], file: "commerce/discounts.ts", nav: ["/commerce/discounts"] },
  "Email Notification System": { backend: ["emails", "notifications"], schema: ["emailTemplates", "emailQueue"] },
  "Subscription Entitlement System": { backend: ["commerceSubscriptions"], schema: ["commerce_subscription_entitlements"] },
  "Airtable Sync System": { backend: ["airtableSync"], schema: [] },
  "Comment System": { backend: ["comments"], nav: ["/comments"], schema: ["comments", "commentFlags", "commentLikes"] },
  "Subscription System": { backend: ["commerceSubscriptions"], nav: ["/commerce/subscriptions"], schema: ["commerce_subscriptions"] },
  "GA4 Integration System": { backend: ["ga4"], schema: ["gaCache"] },
  "Inventory System": { backend: ["commerce"], file: "commerce/inventory.ts", schema: ["commerce_inventory_levels", "commerce_inventory_adjustments"] },
  "Shipping Rate Engine": { backend: ["shipping"], file: "shipping/internals.ts", schema: ["commerce_shipping_rate_quotes", "commerce_rate_pipeline_runs"] },
  "Ticket Widget System": { backend: ["tickets"], schema: ["ticket_tickets", "ticket_messages"] },
  "Tabbed Editor Shell": { backend: ["editor"] },
  "Ticket Lifecycle System": { backend: ["tickets"], schema: ["ticket_tickets"] },
  "ShipStation Integration": { backend: ["shipping"], file: "shipping/providers/shipstation" },
  "Product Bundles System": { backend: ["commerceBundles"], schema: ["commerce_bundles", "commerce_bundle_components"] },
  "Ticket Agent Tools": { backend: ["tickets", "support"] },
  "Search System": { backend: ["search"], schema: ["searchIndex", "searchSynonyms", "searchQueries"] },
  "Content Restriction System": { backend: ["membership"], schema: ["membership_restriction_rules"] },
  "USPS Direct Integration": { backend: ["shipping"], file: "shipping/providers" },
  "Product System": { backend: ["commerce"], file: "commerce/products.ts", nav: ["/commerce/products"], schema: ["commerce_products"] },
  "Wishlist System": { backend: ["commerceWishlists"], schema: ["commerce_wishlists", "commerce_wishlist_items"] },
};

const navText = readFileSync(ADMIN_NAV, "utf8");
const schemaText = existsSync(SCHEMA_FILE) ? readFileSync(SCHEMA_FILE, "utf8") : "";
const schemaIndexFiles = readdirSync(join(CONVEX, "schema")).map((f) => f);
const schemaCombined = schemaText + "\n" + schemaIndexFiles
  .map((f) => readFileSync(join(CONVEX, "schema", f), "utf8"))
  .join("\n");

const rows = [];
const systemsTsv = readFileSync("/tmp/cp-systems.tsv", "utf8");
for (const line of systemsTsv.split("\n").filter(Boolean)) {
  const [airtableId, name, status, completion, category] = line.split("\t");
  const spec = SYSTEM_MAP[name];
  if (!spec) {
    rows.push({ airtableId, name, status, completion, category, missing: ["NO-SPEC"] });
    continue;
  }
  const missing = [];

  for (const folder of spec.backend ?? []) {
    const p = join(CONVEX, folder);
    if (!existsSync(p)) missing.push(`backend:${folder}`);
  }
  if (spec.file) {
    const p = join(CONVEX, spec.file);
    if (!existsSync(p)) missing.push(`file:${spec.file}`);
  }
  for (const nav of spec.nav ?? []) {
    if (!navText.includes(nav)) missing.push(`nav:${nav}`);
  }
  for (const tbl of spec.schema ?? []) {
    const re = new RegExp(`\\b${tbl}\\b\\s*[:]`);
    if (!re.test(schemaCombined) && !schemaCombined.includes(`"${tbl}"`)) {
      missing.push(`schema:${tbl}`);
    }
  }

  rows.push({ airtableId, name, status, completion, category, missing });
}

const ok = rows.filter((r) => r.missing.length === 0);
const issues = rows.filter((r) => r.missing.length > 0);

console.log(`Verified ${ok.length} / ${rows.length} systems with no missing artifacts.`);
console.log(`Issues in ${issues.length} systems:`);
for (const r of issues) {
  console.log(`  ${r.name} [${r.category} | ${r.status} | ${r.completion}] → ${r.missing.join(", ")}`);
}

console.log("\n--- Clean systems (eligible for Audit Status = Complete) ---");
for (const r of ok) {
  console.log(`  ${r.airtableId}  ${r.name}`);
}
