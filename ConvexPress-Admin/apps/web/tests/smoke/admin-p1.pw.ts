import { test } from "./_fixtures";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// ADMIN P1 — core CRUD
test("comments [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/comments", { expectSelector: "#admin-content" });
});

test("comments-pending [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/comments/pending", { expectSelector: "#admin-content" });
});

test("commerce-attributes [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/attributes", { expectSelector: "#admin-content" });
});

test("commerce-bundles [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/bundles", { expectSelector: "#admin-content" });
});

test("commerce-categories [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/categories", { expectSelector: "#admin-content" });
});

test("commerce-digital [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/digital", { expectSelector: "#admin-content" });
});

test("commerce-discounts [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/discounts", { expectSelector: "#admin-content" });
});

test("commerce-products-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/products/new", { expectSelector: "#admin-content" });
});

test("commerce-returns [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/returns", { expectSelector: "#admin-content" });
});

test("commerce-returns-reasons [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/returns/reasons", { expectSelector: "#admin-content" });
});

test("commerce-reviews [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/reviews", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-contracts [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/contracts", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-coupons [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/coupons", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-coupons-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/coupons/new", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-dunning [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/dunning", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-form-submissions [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/form-submissions", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-invoices [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/invoices", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-offers [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/offers", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-offers-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/offers/new", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-order-forms [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/order-forms", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-order-forms-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/order-forms/new", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-pricing-cards [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/pricing-cards", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-templates [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/templates", { expectSelector: "#admin-content" });
});

test("commerce-subscriptions-templates-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/subscriptions/templates/new", { expectSelector: "#admin-content" });
});

test("commerce-wishlists [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/wishlists", { expectSelector: "#admin-content" });
});

test("gallery [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/gallery", { expectSelector: "#admin-content" });
});

test("kb [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/kb", { expectSelector: "#admin-content" });
});

test("layouts [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/layouts", { expectSelector: "#admin-content" });
});

test("media [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/media", { expectSelector: "#admin-content" });
});

test("media-upload [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/media/upload", { expectSelector: "#admin-content" });
});

test("membership [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/membership", { expectSelector: "#admin-content" });
});

test("menus [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/menus", { expectSelector: "#admin-content" });
});

test("pages [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/pages", { expectSelector: "#admin-content" });
});

test("pages-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/pages/new", { expectSelector: "#admin-content" });
});

test("posts [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/posts", { expectSelector: "#admin-content" });
});

test("posts-categories [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/posts/categories", { expectSelector: "#admin-content" });
});

test("posts-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/posts/new", { expectSelector: "#admin-content" });
});

test("posts-tags [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/posts/tags", { expectSelector: "#admin-content" });
});

test("recipes [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/recipes", { expectSelector: "#admin-content" });
});

test("seo [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/seo", { expectSelector: "#admin-content" });
});

test("tickets [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/tickets", { expectSelector: "#admin-content" });
});

test("users [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/users", { expectSelector: "#admin-content" });
});

test("users-new [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/users/new", { expectSelector: "#admin-content" });
});
