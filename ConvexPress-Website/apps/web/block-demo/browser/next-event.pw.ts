import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`Next Event across packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'networkidle'});
 for(const pack of ['core','journal','depot','aster-house']){
  await page.locator('#pack').selectOption(pack);await page.locator('#canonical-block').selectOption('events/next-event');
  const canvas=page.locator('.canonical-canvas');await expect(canvas.locator('[data-demo-ready="true"]')).toHaveCount(1);
  await expect(canvas.getByRole('heading',{name:'A morning with clay'})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'Event details →'})).toHaveAttribute('href','/events/a-morning-with-clay');
  await expect(canvas.locator('.cp-next-event-date strong')).toHaveText('17');
  await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await canvas.getByRole('link',{name:'Event details →'}).focus();expect(await canvas.getByRole('link',{name:'Event details →'}).evaluate(node=>getComputedStyle(node).outlineStyle)).not.toBe('none');
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:'disabled'});
  // A narrow column in a desktop editor must stack without relying on viewport media queries.
  await canvas.locator('.cp-next-event-shell').evaluate(node=>{(node as HTMLElement).style.width='300px';});
  const positions=await canvas.locator('.cp-next-event').evaluate(node=>{const [date,body]=Array.from(node.children).map(child=>child.getBoundingClientRect());return {stacked:body.top>=date.bottom-1,overflow:node.scrollWidth>node.clientWidth};});
  expect(positions).toEqual({stacked:true,overflow:false});await canvas.locator('.cp-next-event-shell').evaluate(node=>{(node as HTMLElement).style.width='';});
 }
 expect(errors).toEqual([]);
});
