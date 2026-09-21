import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`Product option links across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1100});const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("commerce/variant-picker-teaser");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas");await expect(canvas.locator('[data-options-state="ready"]')).toBeVisible();
  const choice=canvas.getByRole("link",{name:"View Field notes, kept close in Color: Forest",exact:true});await expect(choice).toBeVisible();
  await expect(choice).toHaveAttribute("href","/products/demo-product-notebook?optionType=color&optionValue=forest");
  expect(await canvas.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
  await choice.focus();await expect(choice).toBeFocused();await page.keyboard.press("Tab");await expect(canvas.getByRole("link",{name:"View Field notes, kept close in Color: Oat",exact:true})).toBeFocused();
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
 }
 await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".cp-option-teaser-image img").evaluate(element=>getComputedStyle(element).transitionDuration)).toBe("0s");expect(errors).toEqual([]);
});
