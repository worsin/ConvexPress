import {test,expect} from "@playwright/test";
test("published UGC Grid resolves the source image and opens an accessible lightbox",async({page},info)=>{
 const origin=process.env.CONVEXPRESS_UGC_ACCEPTANCE_ORIGIN;test.skip(!origin,"Requires the owned Website bound to the retained UGC acceptance fleet");if(!origin)return;const endpoint=new URL(origin);if(endpoint.protocol!=="http:"||!["127.0.0.1","localhost"].includes(endpoint.hostname)||endpoint.username||endpoint.password)throw Error("Expected owned loopback Website");
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
 const response=await page.goto(new URL("/page/community-gallery-20260915",endpoint).href,{waitUntil:"networkidle"});expect(response?.status()).toBe(200);
 const block=page.locator(".cp-ugc");await expect(block).toHaveCount(1);await expect(block).toContainText("Community ceramics demo");await expect(block).toContainText("ConvexPress Studio");
 const photo=block.locator(".cp-ugc-photo img");await photo.scrollIntoViewIfNeeded();await expect.poll(()=>photo.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
 await block.screenshot({path:info.outputPath("published-community-grid.png"),animations:"disabled"});
 const trigger=block.locator(".cp-ugc-photo");await trigger.click();const dialog=block.getByRole("dialog");await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Next photograph"})).toBeDisabled();await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
 expect(errors).toEqual([]);
});
