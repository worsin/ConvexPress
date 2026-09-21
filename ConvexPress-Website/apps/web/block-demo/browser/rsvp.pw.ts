import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`RSVP registration and cancellation across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1100});const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/event-rsvp");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas");await expect(canvas.getByRole("heading",{name:"Save your place.",exact:true})).toBeVisible();
  await canvas.getByLabel("Your name",{exact:true}).fill("Preview Guest");await canvas.getByLabel("Email address",{exact:true}).fill("preview@example.invalid");
  await expect(canvas.getByRole("button",{name:"Reserve my place",exact:true})).toBeEnabled();expect(await canvas.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
  await canvas.getByRole("button",{name:"Reserve my place",exact:true}).click();await expect(canvas.getByText("Your place is reserved.",{exact:true})).toBeVisible();await expect(canvas.getByText("preview@example.invalid",{exact:true})).toBeVisible();
  await canvas.getByRole("button",{name:"Cancel my reservation",exact:true}).click();await canvas.getByRole("button",{name:"Keep my place",exact:true}).click();await expect(canvas.getByText("Your place is reserved.",{exact:true})).toBeVisible();
  await canvas.getByRole("button",{name:"Cancel my reservation",exact:true}).click();await canvas.getByRole("button",{name:"Confirm cancellation",exact:true}).click();await expect(canvas.getByText("Your reservation was cancelled. You can reserve again while places are available.",{exact:true})).toBeVisible();await expect(canvas.getByText("12 places available",{exact:true})).toBeVisible();
  await canvas.getByLabel("Your name",{exact:true}).focus();await page.keyboard.press("Tab");await expect(canvas.getByLabel("Email address",{exact:true})).toBeFocused();
 }
 await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".cp-rsvp-submit").evaluate(element=>getComputedStyle(element).transitionDuration)).toBe("0s");expect(errors).toEqual([]);
});
