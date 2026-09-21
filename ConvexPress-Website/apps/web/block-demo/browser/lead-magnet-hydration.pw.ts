import {test,expect} from "@playwright/test";
test.use({trace:"off",screenshot:"off"});
test("published Lead Magnet hydrates without page errors",async({page},info)=>{
 const origin=process.env.CONVEXPRESS_LEAD_ACCEPTANCE_ORIGIN;test.skip(!origin,"Requires owned acceptance Website");if(!origin)return;expect(origin).toBe("http://127.0.0.1:4322");
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto(origin+"/page/field-notebook-20260915",{waitUntil:"networkidle"});
 await expect(page.locator(".cp-lead").getByRole("button",{name:"Get the guide",exact:true})).toBeEnabled();
 await info.attach("page-errors",{body:JSON.stringify(errors),contentType:"application/json"});expect(errors).toEqual([]);
});
