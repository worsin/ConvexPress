import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { EmbeddedFormBody } from "./form-embed";
import { ProductionFormEmbedProvider } from "./form-embed-production";
import formBlock from "../../../../../../../blocks/core/form/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { demoFormResult, resolveFormDemo } from "../../../../block-demo/form-adapter";
const form=demoFormResult.form;
const policy={enabledPlugins:["forms"],capabilities:["form.submission","reference.targetResolution"],disabledBlocks:[]};
const context={scope:{websiteKey:"demo-site",instanceKey:"demo-staging"},documentKey:"demo-page",revision:"1",viewerKey:"demo-viewer"};
const tree=[{id:"form",name:"core/form",version:1,attrs:{form:form._id}}];
test("a form reference requires the exact host grant and is removed on revocation",async()=>{
 expect(()=>prepareBlocks(tree,{"core/form":formBlock},policy,{media:{}})).toThrow();
 const host=createDemoContentPageHost();
 const envelope=await resolveFormDemo(tree,context.scope,policy);
 const grant=host.install({tree,policy,context,envelope});
 const render=(blocks=tree,current=context)=>prepareBlocks(blocks,{"core/form":formBlock},policy,{media:{}},{grant,current});
 const html=renderToStaticMarkup(render());
 expect(html).toContain('Your name');expect(html).toContain('Form preview');expect(html).not.toContain('<form');
 expect(()=>render([{...tree[0],attrs:{form:"other-form"}}])).toThrow();
 expect(()=>render(tree,{...context,viewerKey:"another-viewer"})).toThrow();
 host.invalidate();expect(()=>render()).toThrow();
});
test("public form SSR stays disabled until the real submission host mounts",()=>{
 const html=renderToStaticMarkup(<ProductionFormEmbedProvider><EmbeddedFormBody form={form}/></ProductionFormEmbedProvider>);
 expect(html).toContain('Preparing form');expect(html).toContain('<fieldset disabled');expect(html).not.toContain('<form');
 const empty=renderToStaticMarkup(<EmbeddedFormBody form={{...form,fields:form.fields.filter(field=>field.type==='page_break')}}/>);
 expect(empty).toContain('This form has no fields yet');expect(empty).not.toContain('<button');
});
test("two previews have unique field labels and support read-only step navigation",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
 const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 try {
  await act(async()=>root.render(<><EmbeddedFormBody form={form}/><EmbeddedFormBody form={form}/></>));
  const inputs=[...document.querySelectorAll('input')];
  expect(inputs.length).toBeGreaterThanOrEqual(4);
  expect(new Set(inputs.map(input=>input.id)).size).toBe(inputs.length);
  for(const input of inputs) {expect(input.matches(':disabled')).toBe(true);expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();}
  const previews=document.querySelectorAll('.cp-embedded-form-preview');
  const next=[...previews[0].querySelectorAll('button')].find(button=>button.textContent==='Next step');
  await act(async()=>next.click());
  expect(previews[0].textContent).toContain('Step 2 of 2');expect(previews[1].textContent).toContain('Step 1 of 2');
  expect(previews[0].querySelector('textarea').matches(':disabled')).toBe(true);
  expect(document.querySelectorAll('form')).toHaveLength(0);
 } finally {await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);}
});
