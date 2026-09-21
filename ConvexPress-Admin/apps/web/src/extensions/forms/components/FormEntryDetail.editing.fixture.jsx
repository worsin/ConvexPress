import { expect, mock } from "bun:test";
import { anyApi, getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const {JSDOM}=createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const dom=new JSDOM("<html><body><div id='app'></div></body></html>",{url:"http://localhost"});
for(const name of ["window","document","HTMLElement","Element","Node","MutationObserver","DocumentFragment","getComputedStyle"])
 Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let canEdit=true,canView=true,entryId="entry-a";
const definition={fieldKey:"email",label:"Email now",type:"email",required:true,updatedAt:1,editable:true};
let fields=[definition];
let values=[{_id:"answer-email",fieldKey:"email",fieldLabel:"Original email prompt",fieldType:"text",value:"visitor@example.invalid"},
 {_id:"answer-company",fieldKey:"company",fieldLabel:"Company then",fieldType:"text",value:"History studio"}];
let calls=[];
mock.module("@backend/convex/_generated/api",()=>({api:anyApi}));
mock.module("@tanstack/react-router",()=>({Link:({children})=><a>{children}</a>,useNavigate:()=>async()=>{}}));
mock.module("@/lib/auth-context",()=>({useAuth:()=>({isLoading:false})}));
mock.module("@/hooks/useCan",()=>({useCan:cap=>cap==="form.view_entries"?canView:cap==="form.edit_entry"?canEdit:false}));
mock.module("./FormEntriesPage",()=>({EntryStatusBadge:()=>null}));
mock.module("sonner",()=>({toast:{success:()=>{},error:()=>{}}}));
mock.module("convex-helpers/react/cache",()=>({useQuery:(ref,args)=>{
 if(args==="skip")return undefined;
 switch(getFunctionName(ref)){
 case "extensions/forms/queries:getForm":return {title:"Historical inquiry"};
 case "extensions/forms/queries:getSubmission":return {submission:{_id:entryId,formId:"form-a",status:"complete",read:true,createdAt:1,updatedAt:1},values,notes:[]};
 case "extensions/forms/queries:getSubmissionEditing":return fields;
 }
}}));
mock.module("convex/react",()=>({useMutation:ref=>async args=>{
 calls.push({name:getFunctionName(ref),args});
 for(const edit of args.values??[])values=values.map(row=>row.fieldKey===edit.fieldKey?{...row,value:edit.value}:row);
}}));
const {FormEntryDetail}=await import("./FormEntryDetail");
const root=createRoot(document.getElementById("app"));
const render=()=>act(async()=>root.render(<FormEntryDetail formId="form-a" entryId={entryId}/>));
const buttons=name=>[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()===name);
const click=async name=>{expect(buttons(name).length).toBe(1);await act(async()=>buttons(name)[0].click());};
const closed=()=>{expect(buttons("Save answer")).toHaveLength(0);expect(document.querySelector('textarea[aria-label^="Correct answer"]')).toBeNull();};
try{
 await render();expect(buttons("Edit answer").length).toBe(1);
 expect(document.body.textContent).toContain("Historical answer · field no longer in this form");
 expect(document.body.textContent).toContain("History studio");
 await click("Edit answer");
 expect(document.querySelector('textarea[aria-label="Correct answer for Email now"]')).not.toBeNull();
 expect(document.body.textContent).toContain("Original email prompt");
 expect(document.body.textContent).toContain("Current form validation applies");
 await click("Cancel answer edit");expect(calls).toEqual([]);
 await click("Edit answer");canEdit=false;await render();closed();
 expect(document.body.textContent).toContain("History studio");
 canEdit=true;await render();closed();
 await click("Edit answer");fields=[{...definition,type:"calculation",editable:false,updatedAt:2}];await render();closed();
 expect(buttons("Edit answer")).toHaveLength(0);expect(document.body.textContent).toContain("Calculated by the current form");
 fields=[{...definition,type:"text",updatedAt:3}];await render();await click("Edit answer");
 fields=[{...definition,label:"Different question",updatedAt:4}];await render();closed();
 await click("Edit answer");fields=[];await render();closed();
 fields=[definition];await render();await click("Edit answer");fields=null;await render();closed();
 fields=[definition];await render();await click("Edit answer");entryId="entry-b";await render();closed();
 await click("Edit answer");await click("Save answer");await render();
 expect(calls).toEqual([{name:"extensions/forms/mutations:updateEntry",args:{id:"entry-b",formId:"form-a",values:[{fieldKey:"email",value:"visitor@example.invalid"}]}}]);
 closed();canView=false;await render();expect(document.body.textContent).toContain("cannot view form entries");
 console.log("Actual entry DOM passes history, current validation, cancel/save, revoked access, changed/removed/calculated fields and navigation");
}finally{await act(async()=>root.unmount());dom.window.close();}
