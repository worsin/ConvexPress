import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test("global stylesheet is present in SSR and hydrates without duplicate asset ownership", async ({ page, browser }, info) => {
  const url = process.env.CONVEXPRESS_STYLESHEET_ACCEPTANCE_URL;
  test.skip(!url, "Requires an explicitly owned Website SSR server");
  if (!url) return;
  const endpoint = new URL(url);
  if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(endpoint.hostname) || endpoint.username || endpoint.password) throw Error("Use an owned loopback Website server");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await expect(page.locator(".cp-download-library")).toBeVisible();
  const links = await page.locator('link[rel="stylesheet"]').evaluateAll(elements => elements.map(element => element.getAttribute("href")));
  const normalized = links.map(link => link?.replace(/([?&])t=\d+(&?)/g, "$1").replace(/[?&]$/, ""));
  expect(new Set(normalized).size).toBe(normalized.length);
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  let serverBodyMargin;
  try {
    const serverPage = await noJs.newPage();
    await serverPage.goto(url, { waitUntil: "networkidle" });
    serverBodyMargin = await serverPage.locator("body").evaluate(element => getComputedStyle(element).margin);
    expect(serverBodyMargin).toBe("0px");
    await expect(serverPage.locator(".cp-download-library")).toBeVisible();
    await serverPage.screenshot({ path: info.outputPath("server-rendered-no-js.png"), fullPage: true });
  } finally { await noJs.close(); }
  await writeFile(info.outputPath("stylesheet-observations.json"), JSON.stringify({ links, errors, serverBodyMargin }, null, 2));
  expect(errors).toEqual([]);
});
