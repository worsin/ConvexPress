import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("announcement live authoring restores required content and rejects invalid schedules in every pack", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?block=core%2Fannouncement-bar&example=1", { waitUntil: "networkidle" });
  await page.getByText("Try local field edits", { exact: true }).click();
  const study = page.getByRole("region", { name: "Local block authoring preview" });
  const canvas = study.locator('[data-authoring-preview="canvas"]');
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.getByRole("button", { name: "Reset local draft", exact: true }).click();
    const text = study.getByRole("textbox", { name: "Text", exact: true });
    await text.fill("A studio notice that remains visible when dismissal is disabled.");
    await canvas.getByRole("button", { name: "Dismiss announcement", exact: true }).click();
    await expect(canvas).not.toContainText("A studio notice");
    await study.getByLabel("Dismissible value mode", { exact: true }).selectOption("value");
    await study.getByRole("checkbox", { name: "Dismissible", exact: true }).uncheck();
    await expect(canvas).toContainText("A studio notice");
    await expect(canvas.getByRole("button")).toHaveCount(0);
    await study.getByLabel("Schedule value mode", { exact: true }).selectOption("value");
    await study.getByLabel("Starts At value mode", { exact: true }).selectOption("value");
    await study.getByLabel("Starts At", { exact: true }).fill("2020-06-01T09:00:00Z");
    await study.getByLabel("Ends At value mode", { exact: true }).selectOption("value");
    await study.getByLabel("Ends At", { exact: true }).fill("2020-06-01T09:00:00Z");
    await expect(study).toContainText("Must follow startsAt");
    await study.getByLabel("Ends At", { exact: true }).fill("2040-06-01T10:00:00Z");
    await expect(study).not.toContainText("Must follow startsAt");
    await expect(canvas).toContainText("A studio notice");
    await canvas.screenshot({ path: info.outputPath(`${pack}-announcement.png`) });
  }
});
