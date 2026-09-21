import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`contact form preview across packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/",{waitUntil:"networkidle"});
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);await page.locator("#canonical-block").selectOption("core/contact-form");await page.locator("#canonical-example").selectOption("2");const canvas=page.locator(".canonical-canvas");
  await expect(canvas).toContainText("Tell us what you have in mind.");await expect(canvas.locator("input,textarea,select")).toHaveCount(4);
  for(const control of await canvas.locator("input,textarea,select").all())await expect(control).toBeDisabled();
  await expect(canvas.getByRole("button",{name:"Start a conversation"})).toBeDisabled();await expect(canvas.locator("form")).toHaveCount(0);
  await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
 }
 expect(errors).toEqual([]);
});
