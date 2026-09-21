import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) test(`Contact interactive states across packs at ${width}px`, async ({ page }, info) => {
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:width===390?"reduce":"no-preference"});const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 for (const pack of ["core","journal","depot","aster-house"]) {
  await page.goto("/",{waitUntil:"networkidle"});await page.locator("#pack").selectOption(pack);await page.locator("#canonical-block").selectOption("core/contact-form");await page.locator("#canonical-example").selectOption("2");
  const canvas=page.locator(".canonical-canvas");await canvas.getByRole("button",{name:"Try interactive demo"}).click();
  const honeypot=canvas.locator('[data-slot="form-honeypot"]');
  expect(await honeypot.evaluate(node=>{const r=node.getBoundingClientRect();return r.right<0&&r.width<=1&&r.height<=1&&getComputedStyle(node).overflow==="hidden";})).toBe(true);
  const submit=canvas.getByRole("button",{name:"Start a conversation"});await expect(submit).toBeEnabled();await submit.click();
  await expect(canvas.getByLabel("Your name",{exact:false})).toBeFocused();await expect(canvas.getByRole("alert").first()).toBeVisible();
  await canvas.getByLabel("Your name",{exact:false}).fill("Demo visitor");await canvas.getByLabel("Email address",{exact:false}).fill("error@example.invalid");await canvas.getByLabel("What brings you here?",{exact:false}).selectOption("A new project");await canvas.getByLabel("A few details",{exact:false}).fill("An isolated block demo.");
  await submit.click();await expect(canvas.getByRole("button",{name:"Submitting"})).toBeDisabled();
  expect(await canvas.locator("svg.animate-spin").evaluate(node=>getComputedStyle(node).animationName)).toBe(width===390?"none":"cp-contact-spin");
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-pending.png`),animations:"disabled"});
  await expect(canvas.locator('[data-slot="form-submit-error"]')).toBeFocused();await expect(canvas.getByRole("alert")).toContainText("temporarily unavailable");
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-error.png`),animations:"disabled"});
  await canvas.getByLabel("Email address",{exact:false}).fill("visitor@example.invalid");await submit.click();await expect(canvas.locator('[data-slot="form-success"]')).toBeFocused();await expect(canvas).toContainText("Nothing was sent or stored");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await canvas.screenshot({path:info.outputPath(`${pack}-${width}-success.png`),animations:"disabled"});
 }
 expect(errors).toEqual([]);
});

test("Contact follows its available column width on a desktop viewport", async ({ page }, info) => {
 test.setTimeout(120000);await page.setViewportSize({width:1440,height:1000});
 for(const pack of ["core","journal","depot","aster-house"]) {
  await page.goto("/",{waitUntil:"networkidle"});await page.locator("#pack").selectOption(pack);await page.locator("#canonical-block").selectOption("core/contact-form");await page.locator("#canonical-example").selectOption("2");
  const canvas=page.locator(".canonical-canvas");
  for(const width of [300,550,1100]) {
   await canvas.evaluate((node,width)=>{(node as HTMLElement).style.width=`${width}px`;},width);
   const shell=canvas.locator(".cp-library-contact-shell"), grid=canvas.locator(".cp-library-contact");
   const available=await shell.evaluate(node=>node.getBoundingClientRect().width);
   const columns=await grid.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(" ").length);
   expect(columns).toBe(available<=760?1:2);
   await canvas.getByRole("button",{name:"Try interactive demo"}).click();
   const inputs=canvas.locator('[data-slot="form-field"] input');
   for(const input of await inputs.all()) expect(await input.evaluate(node=>node.getBoundingClientRect().width)).toBeGreaterThan(170);
   expect(await grid.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
   await canvas.screenshot({path:info.outputPath(`${pack}-column-${width}.png`),animations:"disabled"});
   await canvas.getByRole("button",{name:"Show read-only preview"}).click();
  }
 }
});
