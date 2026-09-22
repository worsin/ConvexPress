import { expect, test } from '@playwright/test';
import { selectPackReady } from './pack-ready';
for (const block of ['hero','hero-split','hero-text-only']) test(`${block} preserves copy, actions and responsive media across four packs`, async ({page},info)=>{
 test.setTimeout(120_000);await page.setViewportSize({width:1440,height:1000});
 await page.goto(`/?block=core%2F${block}&example=${block==='hero-text-only'?1:2}`,{waitUntil:'networkidle'});
 await page.getByText('Try local field edits',{exact:true}).click();
 const study=page.getByRole('region',{name:'Local block authoring preview'});const canvas=study.locator('[data-authoring-preview="canvas"]');
 for(const pack of ['core','journal','depot','aster-house']){
  await selectPackReady(page,pack);await study.getByRole('button',{name:'Reset local draft',exact:true}).click();
  const body=study.getByRole('textbox',{name:'Body',exact:true});expect(await body.evaluate(n=>n.tagName)).toBe('TEXTAREA');
  await body.fill('A quiet place for ideas to take shape.\n\nFind room for your next beginning.');await expect(canvas).toContainText('Find room for your next beginning.');
  for(const prefix of ['Primary','Secondary']){
   const label=study.getByRole('textbox',{name:`${prefix} Cta Label`,exact:true});await study.getByRole('textbox',{name:`${prefix} Cta Url`,exact:true}).fill(prefix==='Primary'?'#beginning':'mailto:hello@example.test');
   await label.fill('\u200b');await expect(label).toHaveAttribute('aria-invalid','true');await label.fill(prefix==='Primary'?'Explore the studio':'Start a conversation');await expect(label).not.toHaveAttribute('aria-invalid','true');
  }
  const link=canvas.getByRole('link',{name:'Explore the studio',exact:true});await link.focus();await page.keyboard.press('Tab');await expect(canvas.getByRole('link',{name:'Start a conversation',exact:true})).toBeFocused();
  for(const width of [1200,350]){
   await canvas.evaluate((n,width)=>{n.style.width=`${width}px`;n.style.maxWidth='none';n.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute('data-width','full');},width);
   expect(await canvas.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
   if(block!=='hero-text-only')expect(await canvas.locator('img').evaluate((n:HTMLImageElement)=>n.complete&&n.naturalWidth>0)).toBe(true);
   await canvas.screenshot({path:info.outputPath(`${pack}-${block}-${width}.png`)});
  }
  if(block==='hero-split'){
   await study.getByLabel('Media position value mode',{exact:true}).selectOption('value');
   for(const direction of ['ltr','rtl'])for(const side of ['start','end']){
    await canvas.evaluate((n,direction)=>{n.style.width='1200px';n.setAttribute('dir',direction);},direction);
    await study.getByRole('combobox',{name:'Media position',exact:true}).selectOption({label:side});
    const heading=await canvas.getByRole('heading',{level:1}).boundingBox();const media=await canvas.locator('img').boundingBox();
    const start=direction==='ltr'?media!.x<heading!.x:media!.x>heading!.x;expect(start).toBe(side==='start');
    await canvas.evaluate(n=>{n.style.width='350px';});const narrowHeading=await canvas.getByRole('heading',{level:1}).boundingBox();const narrowMedia=await canvas.locator('img').boundingBox();expect(narrowHeading!.y).toBeLessThan(narrowMedia!.y);
   }
   await canvas.evaluate(n=>{n.setAttribute('dir','ltr');});
  }
  if(block!=='hero-text-only'){
   await study.getByRole('button',{name:'Reset Media Id',exact:true}).click();
   await expect(canvas.locator('img')).toHaveCount(0);await expect(canvas.getByRole('heading',{level:1})).toBeVisible();
  }
 }
});
