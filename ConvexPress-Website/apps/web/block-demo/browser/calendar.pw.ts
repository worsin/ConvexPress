import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`Calendar month, agenda and navigation across packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1100});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'networkidle'});
 for(const pack of ['core','journal','depot','aster-house']){
  await page.locator('#pack').selectOption(pack);await page.locator('#canonical-block').selectOption('events/calendar');const canvas=page.locator('.canonical-canvas');
  await expect(canvas.getByRole('heading',{name:'October 2026',exact:true})).toBeVisible();await canvas.getByRole('button',{name:'Month',exact:true}).click();
  await expect(canvas.locator('table')).toBeVisible();await expect(canvas.locator('table time')).toHaveCount(31);
  await expect(canvas.locator('table').getByRole('link',{name:'A morning with clay',exact:true})).toHaveAttribute('href','/events/a-morning-with-clay');
  await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await canvas.screenshot({path:info.outputPath(`${pack}-month-${width}.png`),animations:'disabled'});
  await canvas.getByRole('button',{name:'Agenda',exact:true}).click();await expect(canvas.locator('.cp-calendar-agenda')).toBeVisible();await expect(canvas.locator('.cp-calendar-agenda article')).toHaveCount(3);
  await canvas.screenshot({path:info.outputPath(`${pack}-agenda-${width}.png`),animations:'disabled'});
  await canvas.getByRole('link',{name:'Next month →',exact:true}).click();await expect(canvas.getByRole('heading',{name:'November 2026',exact:true})).toBeVisible();await expect(canvas.getByText(/No events are scheduled/)).toBeVisible();
  await canvas.getByRole('link',{name:'← Previous month',exact:true}).click();await expect(canvas.getByRole('heading',{name:'October 2026',exact:true})).toBeVisible();
  await canvas.getByRole('button',{name:'Month',exact:true}).click();await canvas.locator('.cp-calendar').evaluate(el=>{(el as HTMLElement).style.width='300px';});
  expect(await canvas.locator('.cp-calendar').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
  await canvas.locator('.cp-calendar').evaluate(el=>{(el as HTMLElement).style.width='';});
 }
 expect(errors).toEqual([]);
});
