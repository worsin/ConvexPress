import {test,expect} from '@playwright/test';
for(const width of [1440,390]) test(`Post Grid cards, pagination and reduced motion at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:1000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'networkidle'});
 for(const pack of ['core','journal','depot','aster-house']) {
  await page.locator('#pack').selectOption(pack);
  await page.locator('#canonical-block').selectOption('core/post-grid');
  await page.locator('#canonical-example').selectOption('0');
  const canvas=page.locator('.canonical-canvas');
  await expect(canvas.locator('[data-demo-ready="true"]')).toHaveCount(1);
  await expect(canvas.locator('.cp-post-grid-card')).toHaveCount(6);
  await canvas.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const cols=await canvas.locator('.cp-grid').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(width===390?1:3);
  const images=canvas.locator('.cp-post-grid-image img');
  await expect(images).toHaveCount(6);
  expect(await images.evaluateAll(nodes=>nodes.every(node=>(node as HTMLImageElement).complete&&(node as HTMLImageElement).naturalWidth>0))).toBe(true);
  expect(await images.first().evaluate(node=>getComputedStyle(node).transitionDuration)).toBe('0s');
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-first.png`),animations:'disabled'});
  const older=canvas.getByRole('link',{name:'Older stories →'});
  await older.focus();await page.keyboard.press('Enter');
  await expect(canvas.locator('.cp-post-grid-card')).toHaveCount(3);
  await expect(canvas.getByRole('link',{name:'Materials that tell a story'})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'Older stories →'})).toHaveCount(0);
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-older.png`),animations:'disabled'});
  await page.goBack();await expect(canvas.locator('.cp-post-grid-card')).toHaveCount(6);
  await page.goForward();await expect(canvas.locator('.cp-post-grid-card')).toHaveCount(3);
  await canvas.getByRole('link',{name:'Back to newest'}).click();
  await expect(canvas.locator('.cp-post-grid-card')).toHaveCount(6);
  expect(new URL(page.url()).searchParams.has('blockPages')).toBe(false);
 }
 expect(errors).toEqual([]);
});
