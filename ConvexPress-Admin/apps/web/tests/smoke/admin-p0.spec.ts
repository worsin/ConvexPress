import { expect, test } from "./_fixtures";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// ADMIN P0 — critical paths
test("commerce [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce", { expectSelector: "#admin-content" });
});

test("commerce-customers [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/customers", { expectSelector: "#admin-content" });
});

test("commerce-orders [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/orders", { expectSelector: "#admin-content" });
});

test("commerce-orders-abandoned [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/orders/abandoned", { expectSelector: "#admin-content" });
});

test("commerce-payments [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/payments", { expectSelector: "#admin-content" });
});

test("commerce-products [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/products", { expectSelector: "#admin-content" });
});

test("dashboard [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/dashboard", { expectSelector: "#admin-content" });
});

test("first-run setup checklist [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/setup", {
		expectHeading: /Finish ConvexPress setup/i,
		expectSelector: "#admin-content",
	});

	await expect(authedPage.getByText("Resend email delivery")).toBeVisible();
	await expect(authedPage.getByText("Clerk website auth")).toBeVisible();
	await expect(authedPage.getByText("Meilisearch")).toBeVisible();
	await expect(authedPage.getByText("AI providers")).toBeVisible();
	await expect(authedPage.getByText("Knowledge base search and RAG")).toBeVisible();
	await expect(authedPage.getByText("Support AI deflection")).toBeVisible();
	await expect(authedPage.getByText("Stripe payments")).toBeVisible();
	await expect(authedPage.getByText("PayPal checkout")).toBeVisible();
	await expect(authedPage.getByText("Google Analytics 4")).toBeVisible();
	await expect(authedPage.getByText("Shipping carriers")).toBeVisible();
	await expect(authedPage.getByText("ConvexPress access keys")).toBeVisible();
	await expect(authedPage.getByText("AUTH_ALLOWED_ORIGINS")).toBeVisible();
	await expect(authedPage.getByText("AUTH_ADMIN_ORIGIN")).toBeVisible();
	await expect(authedPage.getByText("AUTH_ALLOW_NULL_ORIGIN")).toBeVisible();
	await expect(authedPage.getByText("FIRST_ADMIN_SETUP_SECRET")).toBeVisible();
	await expect(authedPage.getByText("CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP")).toBeVisible();
});
