import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`Search Results across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1100});const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/search-results");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas"),scenario=canvas.getByLabel("Search preview scenario");
  await scenario.selectOption("ready");await expect(canvas.getByRole("link",{name:"The quiet art of growing orchids"})).toBeVisible();
  expect(await canvas.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
  const next=canvas.getByRole("link",{name:"Next results"});await next.focus();await expect(next).toBeFocused();await page.keyboard.press("Enter");
  await expect(canvas.getByRole("link",{name:"Orchids at the glasshouse"})).toBeVisible();await expect(canvas.getByRole("link",{name:"Visit our orchid house"})).toBeVisible();
  await canvas.getByRole("link",{name:"First results"}).click();await expect(canvas.getByRole("link",{name:"The quiet art of growing orchids"})).toBeVisible();
  await scenario.selectOption("empty");await expect(canvas).toContainText("No matches this time.");await expect(canvas.locator(".cp-search-item")).toHaveCount(0);
  await scenario.selectOption("idle");await expect(canvas).toContainText("Start with a little curiosity.");
  await canvas.getByRole("searchbox",{name:"Search this site"}).fill("orchid");await canvas.getByRole("button",{name:"Search",exact:false}).click();await expect(canvas.locator(".cp-search-item")).toHaveCount(3);
  await page.emulateMedia({reducedMotion:"reduce"});expect(await canvas.locator(".cp-search-item").first().evaluate(element=>getComputedStyle(element).animationName)).toBe("none");await page.emulateMedia({reducedMotion:"no-preference"});
 }
 expect(errors).toEqual([]);
});
