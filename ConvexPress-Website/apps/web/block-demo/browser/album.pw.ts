import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) test(`Album imagery, lightbox and pagination across four packs at ${width}px`, async ({page}, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({width,height:1000});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/",{waitUntil:"networkidle"});
  await page.locator("#canonical-block").selectOption("gallery/album");
  for (const pack of ["core","journal","depot","aster-house"]) {
    await page.locator("#pack").selectOption(pack);
    const canvas=page.locator(".canonical-canvas");
    await expect(canvas.getByRole("heading",{name:"A slower kind of weekend",exact:true})).toBeVisible();
    await expect(canvas.locator(".cp-album-frame")).toHaveCount(3);
    for (const image of await canvas.locator(".cp-album-frame img").all()) { await image.scrollIntoViewIfNeeded(); await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0); }
    await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
    expect(await canvas.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
    expect(await canvas.locator(".cp-album-number").evaluateAll(elements=>elements.every(element=>{const range=document.createRange();range.selectNodeContents(element);return range.getClientRects().length===1;}))).toBe(true);
    await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
    const trigger=canvas.getByRole("button",{name:/View image 1:/});await trigger.click();
    const dialog=canvas.getByRole("dialog");await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Close album preview"})).toBeFocused();
    await page.keyboard.press("ArrowRight");await expect(dialog.getByRole("status")).toHaveText("2 / 3");
    await dialog.getByRole("button",{name:"Previous image"}).click();await expect(dialog.getByRole("status")).toHaveText("1 / 3");
    await page.keyboard.press("ArrowLeft");await expect(dialog.getByRole("status")).toHaveText("3 / 3");
    for(let i=0;i<7;i++){await page.keyboard.press("Tab");expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);}
    await dialog.screenshot({path:info.outputPath(`${pack}-lightbox-${width}.png`),animations:"disabled"});
    await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
    await canvas.getByRole("link",{name:"More images →",exact:true}).click();await expect(canvas.locator(".cp-album-frame")).toHaveCount(1);
    await expect(canvas.getByText("A long lunch, with nowhere else to be.", {exact:true})).toBeVisible();
    await canvas.getByRole("button",{name:/View image 1:/}).click();await expect(dialog.getByRole("button",{name:"Next image"})).toBeDisabled();await page.keyboard.press("Escape");
    await canvas.getByRole("link",{name:"Back to first images",exact:true}).click();await expect(canvas.locator(".cp-album-frame")).toHaveCount(3);
  }
  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await page.locator(".cp-album-open img").first().evaluate(element=>getComputedStyle(element).transitionDuration)).toBe("0s");
  expect(errors).toEqual([]);
});
