import { test, expect } from "@playwright/test";
for(const width of [1440,390])test(`Related content across four packs at ${width}px`,async({page},info)=>{
  test.setTimeout(120000);await page.setViewportSize({width,height:1000});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/related-content");
  for(const pack of ["core","journal","depot","aster-house"]) {
    await page.locator("#pack").selectOption(pack);const canvas=page.locator(".canonical-canvas");
    await expect(canvas.getByRole("heading",{name:"Follow your curiosity",exact:true})).toBeVisible();
    await expect(canvas.locator(".cp-related-card")).toHaveCount(3);
    for(const img of await canvas.locator(".cp-related-image img").all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}
    await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
    expect(await canvas.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(false);
    const link=canvas.getByRole("link",{name:"The art of a slower weekend",exact:true});await expect(link).toHaveAttribute("href","/blog/a-slower-weekend");
    await link.focus();await expect(link).toBeFocused();
    await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
    await canvas.getByRole("link",{name:"Explore more →",exact:true}).click();await expect(canvas.locator(".cp-related-card")).toHaveCount(1);
    await expect(canvas.getByRole("heading",{name:"A good place to begin again"})).toBeVisible();
    await canvas.getByRole("link",{name:"Back to first results",exact:true}).click();await expect(canvas.locator(".cp-related-card")).toHaveCount(3);
  }
  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await page.locator(".cp-related-image img").first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe("0s");expect(errors).toEqual([]);
});
