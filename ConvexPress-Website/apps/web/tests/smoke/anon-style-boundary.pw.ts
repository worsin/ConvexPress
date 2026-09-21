import { expect, test } from "@playwright/test";

test("public stylesheet excludes internal BlockDemo chrome", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(
    (links) => links.map((link) => (link as HTMLLinkElement).href),
  );
  expect(stylesheets.length).toBeGreaterThan(0);
  for (const href of stylesheets) {
    const response = await request.get(href);
    expect(response.ok()).toBe(true);
    const css = await response.text();
    // Test delivered CSS, not merely source imports: development collectors can
    // traverse watched files that are not part of the storefront module tree.
    expect(css.match(/\.lab-header|\.composed-masthead|\/block-demo\//)).toBeNull();
  }
});
