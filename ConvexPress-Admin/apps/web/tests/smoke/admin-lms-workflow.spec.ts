import { expect, test } from "./_fixtures";

test.describe.configure({ mode: "serial" });

test("lms authoring-to-completion workflow [P1]", async ({ authedPage }) => {
  test.slow();

  const stamp = Date.now();
  const certificateTitle = `Codex LMS Smoke Certificate ${stamp}`;
  const courseTitle = `Codex LMS Smoke Course ${stamp}`;
  const topicTitle = `Smoke Topic ${stamp}`;
  const lessonTitle = `Smoke Lesson ${stamp}`;

  await authedPage.goto("/lms/certificates", { waitUntil: "domcontentloaded" });
  await expect(authedPage.getByRole("heading", { name: /Certificate Templates/i })).toBeVisible();
  await authedPage.getByPlaceholder(/New certificate template title/i).fill(certificateTitle);
  await authedPage.getByRole("button", { name: /^Create$/i }).click();
  await expect(authedPage.getByText(certificateTitle)).toBeVisible({ timeout: 20_000 });

  await authedPage.goto("/lms/courses/new", { waitUntil: "domcontentloaded" });
  await authedPage.getByLabel(/Course title/i).fill(courseTitle);
  await authedPage.getByRole("button", { name: /Create course/i }).click();
  await expect(authedPage).toHaveURL(/\/lms\/courses\/[^/]+\/?$/, {
    timeout: 20_000,
  });
  await expect(authedPage.getByRole("heading", { name: courseTitle })).toBeVisible({
    timeout: 20_000,
  });

  const courseUrl = authedPage.url();
  const courseId = new URL(courseUrl).pathname.split("/").filter(Boolean).at(-1);
  expect(courseId, "created course id").toBeTruthy();

  await authedPage.getByLabel(/Course description/i).fill(
    "This smoke course verifies LMS authoring, learner preview, progress, and certificate issuance.",
  );
  await authedPage.getByLabel(/^Excerpt$/i).fill("A paid-tester LMS workflow smoke course.");
  await authedPage.getByLabel(/Access mode/i).selectOption("free");
  await authedPage.getByLabel(/Certificate on completion/i).selectOption({
    label: certificateTitle,
  });
  await authedPage.getByRole("button", { name: /^Save$/i }).click();
  await expect(authedPage.getByText("Saved").last()).toBeVisible({ timeout: 20_000 });

  await authedPage.getByRole("link", { name: /Builder/i }).click();
  await expect(authedPage.getByRole("heading", { name: /Curriculum Builder/i })).toBeVisible({
    timeout: 20_000,
  });
  await authedPage.getByPlaceholder(/New topic title/i).fill(topicTitle);
  await authedPage.getByRole("button", { name: /^Add Topic$/i }).click();
  await expect(authedPage.getByRole("link", { name: topicTitle })).toBeVisible({
    timeout: 20_000,
  });

  await authedPage.getByPlaceholder(/New lesson title/i).fill(lessonTitle);
  await authedPage.getByRole("button", { name: /^Add Lesson$/i }).click();
  await expect(authedPage.getByRole("link", { name: lessonTitle })).toBeVisible({
    timeout: 20_000,
  });

  await authedPage.getByRole("link", { name: lessonTitle }).click();
  await expect(authedPage.getByRole("heading", { name: /Edit Lesson/i })).toBeVisible({
    timeout: 20_000,
  });
  await authedPage.getByLabel(/Video URL/i).fill("https://youtu.be/dQw4w9WgXcQ");
  await authedPage.getByLabel(/Lesson body/i).fill(
    "## Smoke lesson overview\n\nThis lesson body was written by the LMS workflow smoke.\n\n- It proves lesson text persists.\n- It exercises the production editor preview.",
  );
  await authedPage.getByLabel(/Materials & resources/i).fill(
    "[Smoke material](https://example.com/lms-resource)",
  );
  await expect(authedPage.getByText(/Unsaved changes/i).first()).toBeVisible({
    timeout: 20_000,
  });
  await authedPage.getByRole("tab", { name: /Preview/i }).first().click();
  await expect(authedPage.getByRole("heading", { name: /Smoke lesson overview/i })).toBeVisible({
    timeout: 20_000,
  });
  await authedPage.getByRole("tab", { name: /Write/i }).first().click();
  await expect(authedPage.getByText(/YouTube video/i)).toBeVisible({
    timeout: 20_000,
  });
  await authedPage.getByRole("button", { name: /^Save$/i }).click();
  await expect(authedPage.getByText("Lesson saved").last()).toBeVisible({
    timeout: 20_000,
  });

  await authedPage.goto(`/lms/courses/${courseId}`, { waitUntil: "domcontentloaded" });
  await authedPage.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(authedPage.getByText("Published").last()).toBeVisible({ timeout: 20_000 });

  await authedPage.getByRole("link", { name: /Preview/i }).click();
  await expect(authedPage.getByRole("heading", { name: courseTitle })).toBeVisible({
    timeout: 20_000,
  });
  await expect(authedPage.getByRole("heading", { name: lessonTitle })).toBeVisible({
    timeout: 20_000,
  });
  await expect(authedPage.getByRole("heading", { name: /Smoke lesson overview/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(authedPage.getByText("It proves lesson text persists.")).toBeVisible({
    timeout: 20_000,
  });
  await authedPage.getByRole("button", { name: /Mark complete/i }).click();
  await expect(authedPage.getByText(/Course complete|certificate/i).first()).toBeVisible({
    timeout: 20_000,
  });

  const getCertificate = authedPage.getByRole("button", { name: /Get certificate/i });
  if (await getCertificate.isVisible().catch(() => false)) {
    await getCertificate.click();
  }
  await expect(authedPage.getByText(/certificate has been issued|Certificate issued/i).first()).toBeVisible({
    timeout: 20_000,
  });

  await authedPage.goto("/lms/courses", { waitUntil: "domcontentloaded" });
  await authedPage.getByPlaceholder(/Search courses/i).fill(courseTitle);
  const row = authedPage.locator("tr", { hasText: courseTitle });
  await expect(row).toBeVisible({ timeout: 20_000 });
  authedPage.once("dialog", (dialog) => dialog.accept());
  await row.getByTitle("Delete").click();
  await expect(row).toBeHidden({ timeout: 20_000 });

  await authedPage.goto("/lms/certificates", { waitUntil: "domcontentloaded" });
  const certificateRow = authedPage.locator("tr", { hasText: certificateTitle });
  await expect(certificateRow).toBeVisible({ timeout: 20_000 });
  authedPage.once("dialog", (dialog) => dialog.accept());
  await certificateRow.getByTitle("Delete").click();
  await expect(certificateRow).toBeHidden({ timeout: 20_000 });
});
