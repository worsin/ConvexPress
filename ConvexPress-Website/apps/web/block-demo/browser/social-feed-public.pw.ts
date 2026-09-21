import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
const origin=process.env.CONVEXPRESS_SOCIAL_ACCEPTANCE_ORIGIN;
test.use({trace:"off",screenshot:"off"});
test("published social feed renders current cached provider posts without browser provider requests",async({page,browser},info)=>{
 test.skip(!origin,"Requires the owned Website and disposable social feed publication");if(!origin)return;
 expect(origin).toBe("http://127.0.0.1:4322");
 const receipt=JSON.parse(await readFile(new URL("../../../../../output/social-feed-block-20260915/renderer-live-publication.json",import.meta.url),"utf8"));
 const errors:string[]=[],providerRequests:string[]=[];page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>{if(new URL(request.url()).hostname.endsWith("mastodon.social"))providerRequests.push(request.url());});
 const response=await page.goto(`${origin}/page/${receipt.slug}`,{waitUntil:"networkidle"});expect(response?.status()).toBe(200);
 const block=page.locator(".cp-social");await expect(block.getByRole("heading",{name:receipt.profileName,exact:true})).toBeVisible();await expect(block.locator(".cp-social-card")).toHaveCount(receipt.postCount);
 await expect(block.locator(".cp-social-post-link").first()).toHaveAttribute("href",receipt.firstPostUrl);await expect(block.locator("img")).toHaveCount(0);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1100});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await block.screenshot({path:info.outputPath(`published-social-${width}.png`),animations:"disabled"});}
 const noJs=await browser.newContext({javaScriptEnabled:false});try{const ssr=await noJs.newPage();const response=await ssr.goto(`${origin}/page/${receipt.slug}`,{waitUntil:"networkidle"});expect(response?.status()).toBe(200);await expect(ssr.locator(".cp-social-card")).toHaveCount(receipt.postCount);await expect(ssr.locator(".cp-social h2")).toHaveText(receipt.profileName);}finally{await noJs.close();}
 expect(errors).toEqual([]);expect(providerRequests).toEqual([]);
});
