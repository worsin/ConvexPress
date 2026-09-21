import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`UGC Grid across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1100});const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/ugc-grid");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas"),scenario=canvas.getByLabel("Community preview scenario");
  await scenario.selectOption("ready");await expect(canvas.locator(".cp-ugc-frame")).toHaveCount(3);
  const images=canvas.locator(".cp-ugc-photo img");for(const img of await images.all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);}
  expect(await canvas.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
  const trigger=canvas.getByRole("button",{name:"View photograph: Ceramic cup, olive sprig and sketchbook on a sunlit oak table"});await trigger.focus();await page.keyboard.press("Enter");
  const dialog=canvas.getByRole("dialog",{name:"Community photograph"});await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Close photograph"})).toBeFocused();
  await page.keyboard.press("ArrowRight");await expect(dialog.locator(".cp-ugc-selected img")).toHaveAttribute("alt","Sculptural ceramic vase with olive branches on an oak sideboard");
  await page.keyboard.press("ArrowLeft");await expect(dialog.locator(".cp-ugc-selected img")).toHaveAttribute("alt","Ceramic cup, olive sprig and sketchbook on a sunlit oak table");
  await dialog.getByRole("button",{name:"Close photograph"}).focus();await page.keyboard.press("Shift+Tab");await expect(dialog.getByRole("button",{name:"Next photograph"})).toBeFocused();await page.keyboard.press("Tab");await expect(dialog.getByRole("button",{name:"Close photograph"})).toBeFocused();
  await dialog.screenshot({path:info.outputPath(`${pack}-${width}-lightbox.png`),animations:"disabled"});
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();expect(await page.evaluate(()=>document.documentElement.style.overflow)).not.toBe("hidden");
  const more=canvas.getByRole("link",{name:"More moments"});await more.focus();await page.keyboard.press("Enter");await expect(canvas.locator(".cp-ugc-frame")).toHaveCount(1);
  await expect(canvas).toContainText("A place for the next idea.");await canvas.getByRole("link",{name:"First photographs"}).click();await expect(canvas.locator(".cp-ugc-frame")).toHaveCount(3);
  await scenario.selectOption("empty");await expect(canvas).toContainText("The next moment is still to come.");await expect(canvas.locator(".cp-ugc-photo")).toHaveCount(0);
  await scenario.selectOption("unavailable");await expect(canvas).toContainText("Community photographs are not available here yet.");
  await scenario.selectOption("ready");await expect(canvas.locator(".cp-ugc-frame")).toHaveCount(3);await page.emulateMedia({reducedMotion:"reduce"});expect(await canvas.locator(".cp-ugc-frame").first().evaluate(element=>getComputedStyle(element).animationName)).toBe("none");await page.emulateMedia({reducedMotion:"no-preference"});
 }
 expect(errors).toEqual([]);
});
test("UGC Grid replaces broken images with a usable message",async({page})=>{
 let aborted=0;await page.route("**/*",route=>{if(route.request().resourceType()==="image"&&route.request().url().includes("community-ceramics")){aborted++;return route.abort();}return route.continue();});await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/ugc-grid");
 const canvas=page.locator(".canonical-canvas");await canvas.locator(".cp-ugc-photo").first().scrollIntoViewIfNeeded();await expect.poll(()=>aborted).toBeGreaterThan(0);await expect(canvas).toContainText("This photograph could not be loaded.");await expect(canvas.getByRole("button",{name:"View photograph: Ceramic cup, olive sprig and sketchbook on a sunlit oak table"})).toBeDisabled();
 await expect(canvas.locator(".cp-ugc-photo img")).toHaveCount(2);
});
