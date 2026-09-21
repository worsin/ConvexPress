import {test,expect} from "@playwright/test";
import {selectPackReady} from "./pack-ready";

for(const width of [1440,390]) test(`assistant availability and authored questions across templates · ${width}`,async({page},info)=>{
  test.setTimeout(60000);
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/',{waitUntil:'networkidle'});
  const canvas=page.locator('.canonical-canvas');
  for(const pack of ['core','journal','depot','aster-house']){
    await selectPackReady(page,pack);
    await page.locator('#canonical-block').selectOption('commerce/assistant-band');
    await page.locator('#canonical-example').selectOption('0');
    const fixture=canvas.getByRole('combobox',{name:'Assistant fixture'});
    for(const state of ['enabled','empty','disabled','catalog-disabled','mobile-hidden','enabled']){
      await fixture.selectOption(state);
      const questions=canvas.locator('.cp-assistant-questions a:visible');
      await expect(questions).toHaveCount(['disabled','catalog-disabled','empty'].includes(state)||(state==='mobile-hidden'&&width===390)?0:2);
      await expect(canvas.getByRole('link',{name:'Browse the shop',exact:true})).toBeVisible();
      if(state==='empty')await expect(canvas.locator('.cp-split')).toHaveCount(0);
      expect(await canvas.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    }
    await page.locator('#canonical-example').selectOption('1');
    const questions=canvas.locator('.cp-assistant-questions a');
    await expect(questions).toHaveCount(8);
    for(const question of await questions.all()){
      const prompt=await question.locator(':scope > span').nth(1).innerText();
      expect(new URL((await question.getAttribute('href'))!,'https://shop.invalid').searchParams.get('ask')).toBe(prompt);
      await question.focus();await expect(question).toBeFocused();
      expect(await question.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    }
    expect(await questions.first().locator('.cp-assistant-arrow').evaluate(node=>getComputedStyle(node).transitionDuration)).toBe('0s');
    await canvas.screenshot({path:info.outputPath(`${pack}-eight-questions-${width}.png`),animations:'disabled'});
  }
});
