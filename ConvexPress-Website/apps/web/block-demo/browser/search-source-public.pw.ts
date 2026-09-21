import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("public site search renders the retained product and navigates to its current page", async ({page}, info) => {
  const origin = process.env.CONVEXPRESS_SEARCH_ACCEPTANCE_ORIGIN;
  test.skip(!origin, "Requires the owned Website bound to the retained search acceptance fleet");
  if (!origin) return;
  const endpoint = new URL(origin);
  if(endpoint.protocol !== "http:" || !["127.0.0.1","localhost"].includes(endpoint.hostname) || endpoint.username || endpoint.password) throw Error("Expected an owned loopback Website");
  const errors: string[]=[];
  page.on("pageerror", error=>errors.push(error.message));
  await page.goto(new URL("/search?q=Download%20transport%20acceptance&type=product", endpoint).href, {waitUntil:"networkidle"});
  const result = page.getByRole("link", {name:"Download transport acceptance", exact:true});
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("href", "/products/download-transport-20260915");
  await page.screenshot({path:info.outputPath("public-product-search.png"),fullPage:true});
  await result.click();
  await expect(page).toHaveURL(/\/products\/download-transport-20260915(?:\?.*)?$/);
  await expect(page.getByRole("heading",{name:"Download transport acceptance",exact:true})).toBeVisible();
  await writeFile(info.outputPath("runtime-observations.json"), JSON.stringify({pageErrors:errors,currentProductRendered:true},null,2));
  expect(errors).toEqual([]);
});
