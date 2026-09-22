import { expect, test } from '@playwright/test';
import { selectPackReady } from './pack-ready';

for (const block of ['cta-band', 'cta-with-form']) test(`${block} validates labels and retains multiline copy across four packs`, async ({page}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`/?block=core%2F${block}&example=1`,{waitUntil:'networkidle'});
  await page.getByText('Try local field edits',{exact:true}).click();
  const study=page.getByRole('region',{name:'Local block authoring preview'});
  const canvas=study.locator('[data-authoring-preview="canvas"]');
  for(const pack of ['core','journal','depot','aster-house']) {
    await selectPackReady(page,pack);
    await study.getByRole('button',{name:'Reset local draft',exact:true}).click();
    const body=study.getByRole('textbox',{name:'Body',exact:true});
    expect(await body.evaluate(n=>n.tagName)).toBe('TEXTAREA');
    await body.fill('Make room for a good conversation.\n\nTake the next step when you are ready.');
    await expect(canvas).toContainText('Take the next step when you are ready.');
    const label=study.getByRole('textbox',{name:block==='cta-band'?'Primary Cta Label':'Submit Label',exact:true});
    for(const invalid of ['   ','\u200b','\u2066\u2069']) {
      await label.fill(invalid);await expect(label).toHaveAttribute('aria-invalid','true');
    }
    await label.fill(block==='cta-band'?'Explore the next chapter':'Join the notes');
    await expect(label).not.toHaveAttribute('aria-invalid','true');
    if(block==='cta-band') {
      await study.getByRole('textbox',{name:'Primary Cta Url',exact:true}).fill('#next-chapter');
      await study.getByRole('textbox',{name:'Secondary Cta Label',exact:true}).fill('Ask a question');
      await study.getByRole('textbox',{name:'Secondary Cta Url',exact:true}).fill('mailto:hello@example.test');
      const secondary=study.getByRole('textbox',{name:'Secondary Cta Label',exact:true});
      await secondary.fill(' ');await expect(secondary).toHaveAttribute('aria-invalid','true');await secondary.fill('Ask a question');
      const link=canvas.getByRole('link',{name:'Explore the next chapter',exact:true});
      await expect(link).toHaveAttribute('href','#next-chapter');await link.focus();await expect(link).toBeFocused();
      await page.keyboard.press('Tab');await expect(canvas.getByRole('link',{name:'Ask a question',exact:true})).toBeFocused();
    } else {
      await expect(canvas.getByRole('button',{name:'Join the notes',exact:true})).toBeDisabled();
    }
    for(const width of [1104,350]) {
      await canvas.evaluate((node,width)=>{node.style.width=`${width}px`;node.style.maxWidth='none';node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute('data-width','full');},width);
      expect(await canvas.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
      if(block==='cta-with-form' && width===350) {
        const signup=await canvas.locator('.cp-library-signup').boundingBox();
        const input=await canvas.getByRole('textbox',{name:'Email address',exact:true}).boundingBox();
        expect(input!.width/signup!.width).toBeGreaterThan(.75);
      }
      await canvas.screenshot({path:info.outputPath(`${pack}-${block}-${width}.png`)});
    }
  }
});
