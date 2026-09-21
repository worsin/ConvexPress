import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`Archive list across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/archive-list");await page.locator("#canonical-example").selectOption("0");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas");await expect(canvas.getByRole("heading",{name:"Worth returning to.",exact:true})).toBeVisible();await expect(canvas.locator(".cp-archive-list li")).toHaveCount(6);
  const first=canvas.locator(".cp-archive-list a").first();await expect(first).toHaveAttribute("href","/archive?year=2026&month=9");await first.focus();await expect(first).toBeFocused();
  expect(await canvas.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(false);await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
  await canvas.getByRole("link",{name:"Earlier dates →",exact:true}).click();await expect(canvas.locator(".cp-archive-list a").first()).toHaveAttribute("href","/archive?year=2026&month=3");
  await canvas.getByRole("link",{name:"Back to newest",exact:true}).click();await expect(canvas.locator(".cp-archive-list a").first()).toHaveAttribute("href","/archive?year=2026&month=9");
 }
 await page.locator("#canonical-example").selectOption("1");await expect(page.locator(".canonical-canvas .cp-archive-list a").first()).toHaveAttribute("href","/archive?year=2026");
 await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".cp-archive-open").first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe("0s");expect(errors).toEqual([]);
});
