import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

// These are real block controls with a deliberately fictional verifier. Provider
// authorization and real certificate records require separate site acceptance.
for (const pack of ["core", "journal", "depot", "aster-house"])
  for (const width of [1440, 390])
    test(`certificate verification states · ${pack} · ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/?block=certificates%2Fverify", { waitUntil: "networkidle" });
      await selectPackReady(page, pack);
      const canvas = page.locator(".canonical-canvas");
      await expect(canvas).toHaveAttribute("data-canonical-block", "certificates/verify");
      const input = canvas.getByRole("textbox", { name: "Certificate code" });
      const button = canvas.getByRole("button", { name: "Verify certificate" });
      await expect(input).toBeEnabled();
      await input.focus();
      await page.keyboard.press("Tab");
      await expect(button).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(canvas.getByRole("alert")).toContainText("Enter the complete certificate code");
      await expect(canvas.getByRole("alert")).toBeFocused();
      await expect(input).toHaveAttribute("aria-invalid", "true");

      for (const [code, heading] of [
        ["CERT-DEMO-2026", "Certificate verified"],
        ["CERT-DEMO-REVOKED", "Unable to verify"],
        ["CERT-DEMO-UNAVAILABLE", "Verification unavailable"],
      ]) {
        await input.fill(code);
        await expect(canvas.locator(".cp-certificate-result")).toHaveCount(0);
        await expect(input).toHaveAttribute("aria-invalid", "false");
        await input.press("Enter");
        await expect(canvas.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        await expect(canvas.getByRole("status")).toBeFocused();
        if (code === "CERT-DEMO-2026") {
          await expect(canvas).toContainText("Alex Morgan");
          await expect(canvas).toContainText("A practice of observation");
          await expect(canvas.getByRole("link", { name: "View certificate PDF" })).toHaveCount(0);
        } else {
          await expect(canvas).not.toContainText("Alex Morgan");
          await expect(canvas).not.toContainText("A practice of observation");
        }
        await canvas.scrollIntoViewIfNeeded();
        expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await canvas.screenshot({ path: info.outputPath(`${code}.png`), animations: "disabled" });
      }
      // A rejected or unavailable response must leave an operable retry path.
      await input.fill("CERT-DEMO-2026");
      await input.press("Enter");
      await expect(canvas.getByRole("heading", { name: "Certificate verified", exact: true })).toBeVisible();
      await expect(button).toBeEnabled();
      expect(errors).toEqual([]);
    });
