import {test,expect} from '@playwright/test';
import {selectPackReady} from './pack-ready';
import {execFileSync} from 'node:child_process';
test.beforeAll(()=>execFileSync(process.execPath,[new URL('../generate-original-utilities-css.mjs',import.meta.url).pathname,'--check'],{stdio:'pipe'}));
for(const width of [1440,390])test(`original utility variants retain their rendered geometry · ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'networkidle'});
 for(const pack of ['core','journal','depot','aster-house']){
  await selectPackReady(page,pack);const study=page.locator('[data-original-utilities]');await study.locator('summary').click();
  for(const row of await study.locator('[data-utility-case]').all()){
   const name=await row.getAttribute('data-utility-case');
   if(name!.startsWith('size-')){
    const before=await row.locator('[data-original-view] > div').boundingBox(),after=await row.locator('.cp-original-spacer').boundingBox();
    expect(after!.height).toBe(before!.height);expect(after!.height).toBe(({ 'size-small':16,'size-medium':32,'size-large':64,'size-xlarge':96 } as Record<string,number>)[name!]);
    await expect(row.locator('.cp-original-spacer')).toHaveAttribute('aria-hidden','true');
   }else{
    const css=(el:Element)=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,color:s.borderTopColor,top:s.marginTop,bottom:s.marginBottom,height:el.getBoundingClientRect().height}};
    expect(await row.locator('[data-converted-view] hr').evaluate(css)).toEqual(await row.locator('[data-original-view] hr').evaluate(css));
   }
   expect(await row.locator('[data-converted-view] .cp-container').evaluate(el=>getComputedStyle(el).paddingInlineStart)).toBe('0px');
  }
  expect(await study.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await study.screenshot({path:info.outputPath(`${pack}-utilities-${width}.png`)});
 }
 expect(errors).toEqual([]);
});
