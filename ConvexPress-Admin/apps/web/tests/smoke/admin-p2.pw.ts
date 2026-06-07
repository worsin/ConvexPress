import { test } from "./_fixtures";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// ADMIN P2 — settings/tools/edge
test("api-keys [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/api-keys", { expectSelector: "#admin-content" });
});

test("appearance [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/appearance", { expectSelector: "#admin-content" });
});

test("appearance-colors [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/appearance/colors", { expectSelector: "#admin-content" });
});

test("appearance-footer [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/appearance/footer", { expectSelector: "#admin-content" });
});

test("appearance-header [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/appearance/header", { expectSelector: "#admin-content" });
});

test("appearance-themes [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/appearance/themes", { expectSelector: "#admin-content" });
});

test("commerce-returns-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/returns/settings", { expectSelector: "#admin-content" });
});

test("commerce-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings", { expectSelector: "#admin-content" });
});

test("commerce-settings-shipping [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/shipping", { expectSelector: "#admin-content" });
});

test("commerce-settings-shipping-classes [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/shipping/classes", { expectSelector: "#admin-content" });
});

test("commerce-settings-shipping-locations [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/shipping/locations", { expectSelector: "#admin-content" });
});

test("commerce-settings-shipping-packages [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/shipping/packages", { expectSelector: "#admin-content" });
});

test("commerce-settings-shipping-rules [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/shipping/rules", { expectSelector: "#admin-content" });
});

test("commerce-settings-shipping-test-rates [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/shipping/test-rates", { expectSelector: "#admin-content" });
});

test("commerce-settings-shipping-zones [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/shipping/zones", { expectSelector: "#admin-content" });
});

test("commerce-settings-tax [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/tax", { expectSelector: "#admin-content" });
});

test("commerce-settings-tax-classes [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/settings/tax/classes", { expectSelector: "#admin-content" });
});

test("commerce-shipping-manifests [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/shipping/manifests", { expectSelector: "#admin-content" });
});

test("commerce-shipping-tracking [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/shipping/tracking", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions", { expectSelector: "#admin-content" });
});

test("custom-fields [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/custom-fields", { expectSelector: "#admin-content" });
});

test("custom-fields-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/custom-fields/new", { expectSelector: "#admin-content" });
});

test("gallery-categories [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/gallery/categories", { expectSelector: "#admin-content" });
});

test("gallery-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/gallery/new", { expectSelector: "#admin-content" });
});

test("gallery-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/gallery/settings", { expectSelector: "#admin-content" });
});

test("kb-analytics [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/analytics", { expectSelector: "#admin-content" });
});

test("kb-categories [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/categories", { expectSelector: "#admin-content" });
});

test("kb-collections [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/collections", { expectSelector: "#admin-content" });
});

test("kb-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/new", { expectSelector: "#admin-content" });
});

test("kb-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/settings", { expectSelector: "#admin-content" });
});

test("kb-tags [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/tags", { expectSelector: "#admin-content" });
});

test("kb-templates [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/templates", { expectSelector: "#admin-content" });
});

test("kb-workflows [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb/workflows", { expectSelector: "#admin-content" });
});

test("layouts-assign [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/layouts/assign", { expectSelector: "#admin-content" });
});

test("layouts-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/layouts/new", { expectSelector: "#admin-content" });
});

test("membership-grants [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/membership/grants", { expectSelector: "#admin-content" });
});

test("membership-grants-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/membership/grants/new", { expectSelector: "#admin-content" });
});

test("membership-plans [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/membership/plans", { expectSelector: "#admin-content" });
});

test("membership-restrictions [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/membership/restrictions", { expectSelector: "#admin-content" });
});

test("membership-restrictions-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/membership/restrictions/new", { expectSelector: "#admin-content" });
});

test("membership-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/membership/settings", { expectSelector: "#admin-content" });
});

test("menus-locations [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/menus/locations", { expectSelector: "#admin-content" });
});

test("plugins [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/plugins", { expectSelector: "#admin-content" });
});

test("profile [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/profile", { expectSelector: "#admin-content" });
});

test("recipes-categories [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/recipes/categories", { expectSelector: "#admin-content" });
});

test("recipes-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/recipes/new", { expectSelector: "#admin-content" });
});

test("roles [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/roles", { expectSelector: "#admin-content" });
});

test("roles-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/roles/new", { expectSelector: "#admin-content" });
});

test("seo-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/seo/settings", { expectSelector: "#admin-content" });
});

test("seo-sitemap [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/seo/sitemap", { expectSelector: "#admin-content" });
});

test("settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings", { expectSelector: "#admin-content" });
});

test("settings-ai [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/ai", { expectSelector: "#admin-content" });
});

test("settings-analytics [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/analytics", { expectSelector: "#admin-content" });
});

test("settings-analytics-ga4 [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/analytics/ga4", { expectSelector: "#admin-content" });
});

test("settings-discussion [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/discussion", { expectSelector: "#admin-content" });
});

test("settings-email [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/email", { expectSelector: "#admin-content" });
});

test("settings-general [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/general", { expectSelector: "#admin-content" });
});

test("settings-integrations [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations", { expectSelector: "#admin-content" });
});

test("settings-integrations-clerk [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/clerk", { expectSelector: "#admin-content" });
});

test("settings-integrations-google [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/google", { expectSelector: "#admin-content" });
});

test("settings-integrations-paypal [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/paypal", { expectSelector: "#admin-content" });
});

test("settings-integrations-shipping [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/shipping", { expectSelector: "#admin-content" });
});

test("settings-integrations-shipping-dhl [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/shipping/dhl", { expectSelector: "#admin-content" });
});

test("settings-integrations-shipping-fedex [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/shipping/fedex", { expectSelector: "#admin-content" });
});

test("settings-integrations-shipping-shipstation [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/shipping/shipstation", { expectSelector: "#admin-content" });
});

test("settings-integrations-shipping-ups [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/shipping/ups", { expectSelector: "#admin-content" });
});

test("settings-integrations-shipping-usps [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/shipping/usps", { expectSelector: "#admin-content" });
});

test("settings-integrations-stripe [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/integrations/stripe", { expectSelector: "#admin-content" });
});

test("settings-media [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/media", { expectSelector: "#admin-content" });
});

test("settings-notifications [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/notifications", { expectSelector: "#admin-content" });
});

test("settings-permalinks [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/permalinks", { expectSelector: "#admin-content" });
});

test("settings-privacy [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/privacy", { expectSelector: "#admin-content" });
});

test("settings-reading [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/reading", { expectSelector: "#admin-content" });
});

test("settings-search [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/search", { expectSelector: "#admin-content" });
});

test("settings-tools [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/tools", { expectSelector: "#admin-content" });
});

test("settings-writing [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/settings/writing", { expectSelector: "#admin-content" });
});

test("support-analytics [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/support/analytics", { expectSelector: "#admin-content" });
});

test("support-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/support/settings", { expectSelector: "#admin-content" });
});

test("tickets-analytics [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tickets/analytics", { expectSelector: "#admin-content" });
});

test("tickets-canned-responses [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tickets/canned-responses", { expectSelector: "#admin-content" });
});

test("tickets-settings [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tickets/settings", { expectSelector: "#admin-content" });
});

test("tools [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools", { expectSelector: "#admin-content" });
});

test("tools-404-log [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/404-log", { expectSelector: "#admin-content" });
});

test("tools-activity [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/activity", { expectSelector: "#admin-content" });
});

test("tools-audit-log [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/audit-log", { expectSelector: "#admin-content" });
});

test("tools-capabilities [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/capabilities", { expectSelector: "#admin-content" });
});

test("tools-email-notifications [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/email-notifications", { expectSelector: "#admin-content" });
});

test("tools-events [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/events", { expectSelector: "#admin-content" });
});

test("tools-redirects [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/redirects", { expectSelector: "#admin-content" });
});

test("tools-redirects-new [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/redirects/new", { expectSelector: "#admin-content" });
});

test("tools-roles [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/roles", { expectSelector: "#admin-content" });
});

test("tools-routes [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/routes", { expectSelector: "#admin-content" });
});

test("tools-site-notifications [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/site-notifications", { expectSelector: "#admin-content" });
});

test("tools-website-import [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/website-import", { expectSelector: "#admin-content" });
});

test("tools-wordpress-sync [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tools/wordpress-sync", { expectSelector: "#admin-content" });
});

test("updates [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/updates", { expectSelector: "#admin-content" });
});

test("webhooks [P2]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/webhooks", { expectSelector: "#admin-content" });
});
