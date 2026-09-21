import {test,expect} from '@playwright/test';
for(const width of [1440,390]) test(`embedded form preview across packs at ${width}px`, async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/',{waitUntil:'networkidle'});
 for(const pack of ['core','journal','depot','aster-house']) {
  await page.locator('#pack').selectOption(pack);await page.locator('#canonical-block').selectOption('core/form');
  await page.locator('#canonical-example').selectOption('0');
  const canvas=page.locator('.canonical-canvas');
  await expect(canvas).toContainText('This form is not currently available');
  await page.locator('#canonical-example').selectOption('1');
  await expect(canvas.getByRole('textbox',{name:'Your name',exact:true})).toBeDisabled();
  await expect(canvas.getByRole('textbox',{name:'Email address',exact:true})).toBeDisabled();
  await expect(canvas).toContainText('Step 1 of 2');
  const control=await canvas.getByRole('textbox',{name:'Your name',exact:true}).boundingBox();
  expect(control!.width).toBeGreaterThan(250);expect(control!.height).toBeGreaterThanOrEqual(47);
  await expect(canvas.getByRole('button',{name:'Submit response'})).toBeDisabled();
  await expect(canvas.locator('form')).toHaveCount(0);
  await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const next=canvas.getByRole('button',{name:'Next step'});await page.keyboard.press('Tab');await next.focus();await expect(next).toBeFocused();
  expect(await next.evaluate(node=>getComputedStyle(node).outlineStyle)).not.toBe('none');
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-step1.png`),animations:'disabled'});
  await next.click();await expect(canvas).toContainText('Step 2 of 2');
  await expect(canvas.getByRole('textbox',{name:'Tell us what you have in mind',exact:true})).toBeDisabled();
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-step2.png`),animations:'disabled'});
  await canvas.getByRole('button',{name:'Previous step'}).click();await expect(canvas).toContainText('Step 1 of 2');
 }
 expect(errors).toEqual([]);
});
