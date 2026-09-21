import { resolveFormDemo } from "../../../../block-demo/form-adapter";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ContactFormPreview } from "./contact-form";
import { parseContactDefinition } from "../block-data/portable/contactContracts";
import contactBlock from "../../../../../../../blocks/core/contact-form/render";
import { prepareBlocks } from "./model";
const attrs = parseContactDefinition({heading:"Let's talk",recipientEmail:"private@example.invalid",fields:[{name:"email",label:"Your email",type:"email",required:true},{name:"topic",label:"Topic",type:"select",options:["Project","Question"]},{name:"message",label:"Details",type:"textarea"}]});
test("contact preview labels every disabled control, keeps recipients private and cannot submit",()=>{
 const html=renderToStaticMarkup(<><ContactFormPreview attrs={attrs}/><ContactFormPreview attrs={attrs}/></>);
 const dom=new JSDOM(html),doc=dom.window.document;
 try {
  expect(html).not.toContain("private@example.invalid");expect(doc.querySelectorAll("form")).toHaveLength(0);
  const controls=[...doc.querySelectorAll("input,select,textarea")];expect(controls).toHaveLength(6);expect(new Set(controls.map(x=>x.id)).size).toBe(6);
  for(const control of controls){expect(control.matches(":disabled")).toBe(true);expect(doc.querySelector(`label[for="${control.id}"]`)).not.toBeNull();}
  expect([...doc.querySelectorAll("button")].every(button=>button.disabled&&button.type==="button")).toBe(true);
 }finally{dom.window.close();}
});
test("contact renderer remains unavailable without its implemented submission capability",async()=>{
 const tree=[{id:"contact",name:"core/contact-form",version:2,attrs}];
 expect(()=>prepareBlocks(tree,{"core/contact-form":contactBlock},{enabledPlugins:["forms"],capabilities:["form.submission"],disabledBlocks:[]},{media:{}})).toThrow();
 const policy={enabledPlugins:["forms"],capabilities:["contact.submission"],disabledBlocks:[]};
 const current={scope:{websiteKey:"fixture",instanceKey:"fixture"},documentKey:"contact",revision:"1",viewerKey:"preview"};
 const envelope=await resolveFormDemo(tree,current.scope,policy);
 const grant=createDemoContentPageHost().install({tree,policy,context:current,envelope});
 const html=renderToStaticMarkup(prepareBlocks(tree,{"core/contact-form":contactBlock},policy,{media:{}},{current,grant}));
 expect(html).toContain("Form preview");
});
