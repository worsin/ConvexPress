import { test } from "./_fixtures";
import { smokeRoute } from "./_helpers";
import { expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "parallel" });

// ADMIN DYNAMIC — runtime-discovered routes (no seed data needed)
//
// Pattern: navigate to a list page, grab the first row's link to the dynamic
// detail/edit route, smoke that URL. If the list is empty, skip — empty list
// is a legitimate state, not a failure.

interface DynamicRouteCheck {
	name: string;
	listPath: string;
	// Regex the discovered href must match. Anchored to avoid grabbing nav links.
	hrefPattern: RegExp;
	// Optional follow-up — if set, swap the matched href's "/edit" / "/view"
	// suffix to also smoke that variant.
	followupSuffixes?: string[];
}

const DYNAMIC_CHECKS: DynamicRouteCheck[] = [
	{
		name: "posts",
		listPath: "/posts",
		hrefPattern: /^\/posts\/(?!new\b)[a-z0-9]{16,}(?:\/edit)?$/i,
		followupSuffixes: ["/revisions", "/seo", "/engagement", "/traffic"],
	},
	{
		name: "pages",
		listPath: "/pages",
		hrefPattern: /^\/pages\/(?!new\b)[a-z0-9]{16,}(?:\/edit)?$/i,
		followupSuffixes: ["/revisions", "/seo", "/engagement", "/traffic"],
	},
	{
		name: "products",
		listPath: "/commerce/products",
		hrefPattern: /^\/commerce\/products\/(?!new\b)[a-z0-9]{16,}$/i,
	},
	{
		name: "orders",
		listPath: "/commerce/orders",
		hrefPattern: /^\/commerce\/orders\/(?!new\b|abandoned\b)[a-z0-9]{16,}$/i,
	},
	{
		name: "users",
		listPath: "/users",
		hrefPattern: /^\/users\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "comments",
		listPath: "/comments",
		hrefPattern: /^\/comments\/(?!pending\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "media",
		listPath: "/media",
		hrefPattern: /^\/media\/(?!upload\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "kb-articles",
		listPath: "/kb",
		hrefPattern: /^\/kb\/(?!new\b|categories\b|tags\b|settings\b|collections\b|workflows\b|templates\b|analytics\b)[a-z0-9]{16,}(?:\/edit)?$/i,
	},
	{
		name: "tickets",
		listPath: "/tickets",
		hrefPattern: /^\/tickets\/(?!new\b)[a-z0-9]{16,}$/i,
	},
	{
		name: "roles",
		listPath: "/roles",
		hrefPattern: /^\/roles\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "menus",
		listPath: "/menus",
		hrefPattern: /^\/menus\/(?!new\b|locations\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "recipes",
		listPath: "/recipes",
		hrefPattern: /^\/recipes\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "custom-fields",
		listPath: "/custom-fields",
		hrefPattern: /^\/custom-fields\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "subscription-offers",
		listPath: "/commerce/subscriptions/offers",
		hrefPattern: /^\/commerce\/subscriptions\/offers\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "subscription-templates",
		listPath: "/commerce/subscriptions/templates",
		hrefPattern: /^\/commerce\/subscriptions\/templates\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "subscription-coupons",
		listPath: "/commerce/subscriptions/coupons",
		hrefPattern: /^\/commerce\/subscriptions\/coupons\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
	{
		name: "subscription-contracts",
		listPath: "/commerce/subscriptions/contracts",
		hrefPattern: /^\/commerce\/subscriptions\/contracts\/[a-z0-9]{16,}$/i,
	},
	{
		name: "subscription-invoices",
		listPath: "/commerce/subscriptions/invoices",
		hrefPattern: /^\/commerce\/subscriptions\/invoices\/[a-z0-9]{16,}$/i,
	},
	{
		name: "membership-plans",
		listPath: "/membership/plans",
		hrefPattern: /^\/membership\/plans\/(?!new\b)[a-z0-9]{16,}\/edit$/i,
	},
];

async function findFirstHref(
	page: Page,
	listPath: string,
	hrefPattern: RegExp,
): Promise<string | null> {
	await page.goto(listPath, { waitUntil: "domcontentloaded" });
	await expect(page.locator("#admin-content")).toBeVisible({ timeout: 20_000 });

	const disabledPluginNotice = page
		.getByRole("heading", { name: /disabled/i })
		.first();
	if (await disabledPluginNotice.isVisible().catch(() => false)) {
		return null;
	}

	await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

	const allLinks = await page.locator("a[href]").evaluateAll((els) =>
		(els as HTMLAnchorElement[]).map((el) => el.getAttribute("href") ?? ""),
	);
	return allLinks.find((href) => hrefPattern.test(href)) ?? null;
}

for (const check of DYNAMIC_CHECKS) {
	test(`dynamic: ${check.name} detail`, async ({ authedPage }) => {
		const href = await findFirstHref(authedPage, check.listPath, check.hrefPattern);
		test.skip(!href, `no records on ${check.listPath} — nothing to discover`);
		await smokeRoute(authedPage, href!, { expectSelector: "#admin-content" });
	});

	if (check.followupSuffixes) {
		for (const suffix of check.followupSuffixes) {
			test(`dynamic: ${check.name} ${suffix.replace("/", "")}`, async ({ authedPage }) => {
				const baseHref = await findFirstHref(
					authedPage,
					check.listPath,
					check.hrefPattern,
				);
				test.skip(!baseHref, `no records on ${check.listPath}`);
				// Strip trailing /edit if present, then append the suffix
				const trimmed = baseHref!.replace(/\/edit$/, "");
				const targetUrl = `${trimmed}${suffix}`;
				await smokeRoute(authedPage, targetUrl, {
					expectSelector: "#admin-content",
				});
			});
		}
	}
}
