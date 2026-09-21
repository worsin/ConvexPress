import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`Language switcher across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/language-switcher");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas"),nav=canvas.getByRole("navigation",{name:"Choose a language"});await expect(nav).toBeVisible();
  const links=nav.getByRole("link");await expect(links).toHaveCount(3);await expect(links.first()).toHaveAttribute("aria-current","page");await expect(links.nth(1)).toHaveAttribute("href","/page/demo-espanol");await expect(links.nth(2)).toHaveAttribute("hreflang","ar");await expect(nav.locator('[lang="ar"]')).toHaveAttribute("dir","rtl");
  await links.first().focus();await page.keyboard.press("Tab");await expect(links.nth(1)).toBeFocused();expect(await canvas.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(false);await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
 }
 await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".cp-language-mark").first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe("0s");expect(errors).toEqual([]);
});
