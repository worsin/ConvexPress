import {test,expect} from "@playwright/test";
for(const width of [1440,390])test(`Social Feed across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.clock.install();await page.setViewportSize({width,height:1100});
 const errors:string[]=[],outbound:string[]=[];page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>{if(new URL(request.url()).hostname.endsWith("example.com"))outbound.push(request.url());});
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/social-feed");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas"),scenario=canvas.getByLabel("Social feed preview scenario");
  await scenario.selectOption("ready");await expect(canvas.getByLabel("Social feed study")).toHaveAttribute("data-demo-ready","true");
  await expect(canvas.getByRole("heading",{name:"Fieldwork Studio"})).toBeVisible();await expect(canvas.locator(".cp-social-card")).toHaveCount(3);await expect(canvas.locator(".cp-social img")).toHaveCount(0);
  await canvas.getByRole("button",{name:"Load photographs"}).focus();await page.keyboard.press("Enter");await expect(canvas.locator(".cp-social img")).toHaveCount(3);
  await expect.poll(()=>canvas.locator(".cp-social img").evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  expect(await canvas.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
  for(const img of await canvas.locator(".cp-social img").all()){await img.scrollIntoViewIfNeeded();await img.evaluate((el:HTMLImageElement)=>el.decode());}
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
  const link=canvas.getByRole("link",{name:"View post 1 on Mastodon (opens in a new tab)"});await expect(link).toHaveAttribute("href","https://social.example.com/@fieldwork/1");await expect(link).toHaveAttribute("rel","noopener noreferrer");
  await canvas.getByRole("button",{name:"Hide photographs"}).click();await expect(canvas.locator(".cp-social img")).toHaveCount(0);
  await scenario.selectOption("empty");await expect(canvas.getByRole("status")).toHaveText("No public posts to share just yet.");await scenario.selectOption("unavailable");await expect(canvas.getByRole("status")).toHaveText("This feed is not available right now.");
  await page.emulateMedia({reducedMotion:"reduce"});await scenario.selectOption("ready");await expect(canvas.locator(".cp-social-card")).toHaveCount(3);expect(await canvas.locator(".cp-social-card").first().evaluate(el=>getComputedStyle(el).animationName)).toBe("none");await page.emulateMedia({reducedMotion:"no-preference"});
 }
 // Image decode failure leaves the text and original post link usable.
 const canvas=page.locator(".canonical-canvas");await canvas.getByRole("button",{name:"Load photographs"}).click();await canvas.locator(".cp-social img").first().dispatchEvent("error");await expect(canvas.getByRole("status")).toHaveText("This photograph could not be loaded.");await expect(canvas.locator(".cp-social-post-link").first()).toBeVisible();
 await page.clock.fastForward(900001);await expect(canvas.getByRole("status")).toHaveText("This feed is not available right now.");await expect(canvas.locator(".cp-social img")).toHaveCount(0);
 expect(errors).toEqual([]);expect(outbound).toEqual([]);
});
