import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440,390]) {
  test(`long paragraph authoring preserves marks, links and readable wrapping · ${width}`,async({page},info)=>{
    test.setTimeout(90000);
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({reducedMotion:"reduce"});
    const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto("/?block=core%2Fparagraph&example=1",{waitUntil:"networkidle"});
    await page.getByText("Try local field edits",{exact:true}).click();
    const study=page.getByRole("region",{name:"Local block authoring preview"});
    const form=study.getByRole("form",{name:"Paragraph content"});
    const canvas=study.locator('[data-authoring-preview="canvas"]');
    const field=form.getByLabel("Text segment 1",{exact:true});
    const text="The studio keeps a record of the work: the choices that mattered, the lessons that lasted, and the details worth returning to. ".repeat(25);
    for(const pack of ["core","journal","depot","aster-house"]){
      await selectPackReady(page,pack);
      await study.getByRole("button",{name:"Reset local draft",exact:true}).click();
      await field.fill(text);
      await expect(canvas.locator(".cp-rich-text p")).toHaveCount(1);
      await expect(canvas.locator(".cp-rich-text p")).toHaveText(text+"emphasis and a link.");
      await expect(canvas.locator("strong")).toHaveText("emphasis");
      const link=canvas.getByRole("link",{name:"link",exact:true});
      await expect(link).toHaveAttribute("href","https://example.com");
      await expect(link).toHaveAttribute("target","_blank");
      await expect(link).toHaveAttribute("rel","noopener noreferrer");
      await link.focus();await expect(link).toBeFocused();
      expect(await canvas.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
      await canvas.scrollIntoViewIfNeeded();
      await canvas.screenshot({path:info.outputPath(`${pack}-paragraph-${width}.png`),animations:"disabled"});
      await field.fill("W".repeat(6000));
      await expect(canvas.locator(".cp-rich-text p")).toHaveText("W".repeat(6000)+"emphasis and a link.");
      expect(await canvas.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
      await field.fill("x".repeat(20001));
      await expect(study.getByText("The draft has errors. Showing the last valid preview.",{exact:true})).toBeVisible();
      await expect(field).toHaveValue("x".repeat(20001));
      await expect(canvas.locator(".cp-rich-text p")).toHaveText("W".repeat(6000)+"emphasis and a link.");
      await field.fill("Recovered paragraph with ");
      await expect(canvas.locator(".cp-rich-text p")).toHaveText("Recovered paragraph with emphasis and a link.");
    }
    expect(errors).toEqual([]);
  });
}
