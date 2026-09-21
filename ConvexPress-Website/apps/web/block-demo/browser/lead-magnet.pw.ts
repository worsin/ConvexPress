import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {sampleGuide} from "../lead-magnet-adapter";
for(const width of [1440,390])test(`Lead Magnet across four packs at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1100});
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/",{waitUntil:"networkidle"});await page.locator("#canonical-block").selectOption("core/lead-magnet");
 for(const pack of ["core","journal","depot","aster-house"]){
  await page.locator("#pack").selectOption(pack);
  const canvas=page.locator(".canonical-canvas"),scenario=canvas.getByLabel("Lead magnet preview scenario");
  await scenario.selectOption("ready");await expect(canvas.getByLabel("Lead magnet study")).toHaveAttribute("data-demo-ready","true");
  const email=canvas.getByRole("textbox",{name:"Email address"}),consent=canvas.getByRole("checkbox");
  await expect(consent).not.toBeChecked();expect(await consent.evaluate((el:HTMLInputElement)=>el.required)).toBe(false);
  expect(await canvas.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}.png`),animations:"disabled"});
  await email.fill("reader@example.test");await canvas.getByRole("button",{name:"Get the guide",exact:true}).click();
  await expect(canvas.getByRole("heading",{name:"Your next chapter awaits."})).toBeVisible();await expect(canvas.getByRole("button",{name:"Stop email updates"})).toHaveCount(0);
  const downloadEvent=page.waitForEvent("download");await canvas.getByRole("button",{name:"Download your guide"}).click();const download=await downloadEvent;
  expect(download.suggestedFilename()).toBe("field-notes.txt");expect(await download.failure()).toBeNull();
  const saved=info.outputPath(`${pack}-${width}-guide.txt`);await download.saveAs(saved);expect(await readFile(saved,"utf8")).toBe(sampleGuide);
  await expect(canvas.getByRole("status")).toContainText("Download requested.");
  await canvas.getByRole("button",{name:"Back to the form"}).click();await consent.check();await canvas.getByRole("button",{name:"Get the guide",exact:true}).click();await canvas.getByRole("button",{name:"Stop email updates"}).click();
  await expect(canvas.getByRole("status")).toHaveText("Your opt-out request has been received.");await expect(canvas.getByRole("button",{name:"Stop email updates"})).toHaveCount(0);
  // A fresh opt-in after an opt-out must expose its own opt-out action.
  await canvas.getByRole("button",{name:"Back to the form"}).click();await canvas.getByRole("button",{name:"Get the guide",exact:true}).click();await expect(canvas.getByRole("button",{name:"Stop email updates"})).toBeVisible();
  await scenario.selectOption("error");await email.fill("reader@example.test");await canvas.getByRole("button",{name:"Get the guide",exact:true}).click();
  await expect(canvas.getByRole("alert")).toContainText("Demonstration: the request failed.");await expect(canvas.getByRole("alert")).toBeFocused();await expect(canvas.getByRole("button",{name:"Get the guide",exact:true})).toBeEnabled();
  await scenario.selectOption("unavailable");await expect(email).toBeDisabled();await expect(canvas.getByRole("button",{name:"Get the guide",exact:true})).toBeDisabled();await expect(canvas.getByRole("status")).toContainText("This download is not currently available.");
  await scenario.selectOption("ready");await page.emulateMedia({reducedMotion:"reduce"});await email.fill("reader@example.test");await canvas.getByRole("button",{name:"Get the guide",exact:true}).click();expect(await canvas.locator(".cp-lead-ready").evaluate(element=>getComputedStyle(element).animationName)).toBe("none");
  await canvas.screenshot({path:info.outputPath(`${pack}-${width}-ready.png`),animations:"disabled"});await page.emulateMedia({reducedMotion:"no-preference"});
  await scenario.selectOption("unavailable");await scenario.selectOption("ready");
 }
 expect(errors).toEqual([]);
});
