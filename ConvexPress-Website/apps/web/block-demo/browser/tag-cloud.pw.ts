import {test,expect} from '@playwright/test';
for(const width of [1440,390,320]) test(`Topics wrap, paginate and support keyboard navigation at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:1000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'networkidle'});
 for(const pack of ['core','journal','depot','aster-house']) {
  await page.locator('#pack').selectOption(pack);
  await page.locator('#canonical-block').selectOption('core/tag-cloud');
  await page.locator('#canonical-example').selectOption('2');
  const canvas=page.locator('.canonical-canvas');
  await expect(canvas.locator('[data-demo-ready="true"]')).toHaveCount(1);
  const topics=canvas.locator('.cp-tag-cloud-topics a');
  await expect(topics).toHaveCount(8);
  await expect(canvas.getByRole('heading',{name:'Follow your curiosity'})).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const rectangles=await topics.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,right:r.right,height:r.height};}));
  expect(rectangles.every(r=>r.height>=44&&r.x>=0&&r.right<=width)).toBe(true);
  expect(await topics.first().evaluate(node=>getComputedStyle(node).transitionDuration)).toBe('0s');
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-first.png`),animations:'disabled'});
  await canvas.getByRole('link',{name:'More topics →'}).focus();await page.keyboard.press('Enter');
  await expect(topics).toHaveCount(5);
  await expect(canvas.getByRole('link',{name:'The art of paying attention'})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'More topics →'})).toHaveCount(0);
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-older.png`),animations:'disabled'});
  await page.goBack();await expect(topics).toHaveCount(8);
  await page.goForward();await expect(topics).toHaveCount(5);
  await canvas.getByRole('link',{name:'Back to first topics'}).click();await expect(topics).toHaveCount(8);
  expect(new URL(page.url()).searchParams.has('blockPages')).toBe(false);
 }
 expect(errors).toEqual([]);
});
