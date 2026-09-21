import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

// The same schema form used by the editor drives the real renderer here.
// This local study has no persistence or backend and cannot prove native save.
for (const width of [1440, 390]) {
  test(`tab field limits, keyboard access and removal recovery · ${width}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/?block=core%2Ftabs&example=2", { waitUntil: "networkidle" });
    await page.getByText("Try local field edits", { exact: true }).click();
    const study = page.getByRole("region", { name: "Local block authoring preview" });
    const form = study.getByRole("form", { name: "Tabs content" });
    const canvas = study.locator('[data-authoring-preview="canvas"]');
    const tabs = canvas.getByRole("tab");
    const text = "https://example.test/" + "a".repeat(300);
    for (const pack of ["core", "aster-house", "journal", "depot"]) {
      await selectPackReady(page, pack);
      await study.getByRole("button", { name: "Reset local draft", exact: true }).click();
      await form.getByRole("textbox", { name: "Label", exact: true }).first().fill("W".repeat(40));
      await form.getByRole("textbox", { name: "Body", exact: true }).first().fill(text);
      await expect(canvas.getByRole("tabpanel")).toHaveText(text);
      await tabs.first().focus();
      const bounds = await tabs.first().evaluate(node => ({
        tab: node.getBoundingClientRect().width,
        list: node.parentElement!.clientWidth,
      }));
      expect(bounds.tab, "A valid label must fit within its scrollable tab bar").toBeLessThanOrEqual(bounds.list + 1);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.keyboard.press("End");
      await expect(tabs.last()).toBeFocused();
      await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
      const visible = await tabs.last().evaluate(node => {
        const item = node.getBoundingClientRect(), list = node.parentElement!.getBoundingClientRect();
        return item.left >= list.left - 1 && item.right <= list.right + 1;
      });
      expect(visible, "Keyboard selection scrolls the whole selected label into view").toBe(true);
      await page.keyboard.press("Tab");
      await expect(canvas.getByRole("tabpanel")).toBeFocused();

      await form.getByRole("button", { name: "Remove Tabs 3", exact: true }).click();
      await expect(tabs).toHaveCount(2);
      await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
      await expect(canvas.getByRole("tabpanel")).toHaveText(text);
      await canvas.scrollIntoViewIfNeeded();
      await canvas.screenshot({ path: info.outputPath(`${pack}-long-label-${width}.png`), animations: "disabled" });

      // Rejected content leaves the last valid preview intact, then recovers.
      await form.getByRole("textbox", { name: "Body", exact: true }).first().fill("x".repeat(2001));
      await expect(study.getByText("The draft has errors. Showing the last valid preview.", { exact: true })).toBeVisible();
      await expect(canvas.getByRole("tabpanel")).toHaveText(text);
      await form.getByRole("textbox", { name: "Body", exact: true }).first().fill("Recovered body");
      await expect(canvas.getByRole("tabpanel")).toHaveText("Recovered body");
      await form.getByRole("button", { name: "Remove Tabs 2", exact: true }).click();
      await form.getByRole("button", { name: "Remove Tabs 1", exact: true }).click();
      await expect(tabs).toHaveCount(0);
      await expect(canvas.getByRole("tabpanel")).toHaveCount(0);
      await form.getByRole("button", { name: "Add Tabs", exact: true }).click();
      await expect(tabs).toHaveCount(1);
      await expect(tabs.first()).toHaveAccessibleName("Section 1");
      await tabs.first().focus();
      await page.keyboard.press("ArrowLeft");
      await expect(tabs.first()).toBeFocused();
      await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
      expect(errors).toEqual([]);
    }
  });
}
