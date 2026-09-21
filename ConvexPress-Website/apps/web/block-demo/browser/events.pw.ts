import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`Upcoming Events across packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'networkidle'});
 for(const pack of ['core','journal','depot','aster-house']){
  await page.locator('#pack').selectOption(pack);await page.locator('#canonical-block').selectOption('events/upcoming');
  for(const example of ['0','1']){
   await page.locator('#canonical-example').selectOption(example);
   const canvas=page.locator('.canonical-canvas');await expect(canvas.locator('[data-demo-ready="true"]')).toHaveCount(1);
   await expect(canvas.locator('.cp-event-row')).toHaveCount(3);
   await expect(canvas.getByRole('link',{name:'A morning with clay'})).toHaveAttribute('href','/events/a-morning-with-clay');
   await expect(canvas.locator('.cp-event-date strong').first()).toHaveText('17');
   await expect(canvas.getByRole('link',{name:'Explore all events →'})).toHaveAttribute('href','/events');
   await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
   const link=canvas.getByRole('link',{name:'A morning with clay'});await link.focus();await expect(link).toBeFocused();
   expect(await link.evaluate(node=>getComputedStyle(node).outlineStyle)).not.toBe('none');
   await canvas.screenshot({path:info.outputPath(`${pack}-${width}-${example}.png`),animations:'disabled'});
  }
 }
 expect(errors).toEqual([]);
});
