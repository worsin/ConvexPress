import { expect, test } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

test("lms catalog [P1]", async ({ page }) => {
  await smokeRoute(page, "/courses", {
    allowNotFound: true,
    expectHeading: /Courses|Learning/i,
    expectSelector: "body",
  });
});

test("lms first published course landing [P1]", async ({ page }) => {
  const response = await page.goto("/courses", { waitUntil: "domcontentloaded" });
  test.skip(response?.status() === 404, "LMS plugin disabled");
  const courseLinks = page.locator('a[href^="/courses/"]');
  await Promise.race([
    courseLinks.first().waitFor({ state: "visible", timeout: 20_000 }),
    page.getByText(/No courses are published yet/i).waitFor({
      state: "visible",
      timeout: 20_000,
    }),
  ]).catch(() => undefined);
  test.skip((await courseLinks.count()) === 0, "No published LMS courses");

  await courseLinks.first().click();
  await expect(page).toHaveURL(/\/courses\/[^/?#]+/, { timeout: 20_000 });
  await expect(page.getByRole("heading").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Curriculum|Course not found/i).first()).toBeVisible({
    timeout: 20_000,
  });
});

test("lms preview lesson deep-link [P1]", async ({ page }) => {
  test.setTimeout(60_000);
  const response = await page.goto("/courses", { waitUntil: "domcontentloaded" });
  test.skip(response?.status() === 404, "LMS plugin disabled");
  const courseLinks = page.locator('a[href^="/courses/"]');
  await Promise.race([
    courseLinks.first().waitFor({ state: "visible", timeout: 20_000 }),
    page.getByText(/No courses are published yet/i).waitFor({
      state: "visible",
      timeout: 20_000,
    }),
  ]).catch(() => undefined);
  test.skip((await courseLinks.count()) === 0, "No published LMS courses");

  const courseHrefs = await courseLinks.evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => !!href),
  );
  let previewLink = page.locator('a[href^="/courses/"]').first();
  let foundPreviewLesson = false;

  for (const href of courseHrefs.slice(0, 10)) {
    await page.goto(href, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Curriculum/i })).toBeVisible({
      timeout: 20_000,
    });
    const candidate = page
      .locator("li", { hasText: /Preview/i })
      .locator('a[href^="/courses/"]')
      .first();
    if ((await candidate.count()) > 0) {
      previewLink = candidate;
      foundPreviewLesson = true;
      break;
    }
  }

  test.skip(!foundPreviewLesson, "No preview LMS lessons");

  await previewLink.click();
  await expect(page).toHaveURL(/\/courses\/[^/?#]+\/[^/?#]+/, {
    timeout: 20_000,
  });
  await expect(page.getByText(/^Preview lesson$/i).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading").first()).toBeVisible({
    timeout: 20_000,
  });
});

test("lms certificate verification [P1]", async ({ page }) => {
  const result = await smokeRoute(page, "/certificates/verify", {
    allowNotFound: true,
    expectHeading: /Verify certificate/i,
    expectSelector: "#certificate-serial",
  });
  test.skip(result.notFound, "LMS plugin disabled");

  await page.locator("#certificate-serial").fill("CERT-NOT-A-REAL-SERIAL");
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/serial=CERT-NOT-A-REAL-SERIAL/, {
    timeout: 20_000,
  });
  await expect(page.getByText(/Certificate not found/i)).toBeVisible({
    timeout: 20_000,
  });
});

test("lms certificate detail [P1]", async ({ page }) => {
  await smokeRoute(page, "/certificates/CERT-NOT-A-REAL-SERIAL", {
    allowNotFound: true,
    expectHeading: /Certificate not found/i,
  });
});
