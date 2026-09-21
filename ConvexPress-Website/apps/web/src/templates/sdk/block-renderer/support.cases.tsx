import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import block from "../../../../../../../blocks/support/ticket-cta/render";
import { prepareBlocks, type BlockInstance } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveSupportDemo } from "../../../../block-demo/support-adapter";
import { validateCanonicalData } from "../block-data/portable/resolve";
const policy={enabledPlugins:["tickets"],capabilities:[],disabledBlocks:[]};
const scope={websiteKey:"support",instanceKey:"staging"};
async function fixture(available=true){
 const tree:BlockInstance[]=[{id:"contact",name:"support/ticket-cta",version:1,attrs:{title:'Help <script>alert(1)</script>',body:"Tell us what happened."}}];
 const current={scope,documentKey:"support-page",revision:"1",viewerKey:"public"};
 const envelope=await resolveSupportDemo(tree,scope,policy,available),host=createDemoContentPageHost();
 const grant=host.install({tree,context:current,policy,envelope});
 return {tree,envelope,host,render:()=>renderToStaticMarkup(prepareBlocks(tree,{"support/ticket-cta":block},policy,{media:{}},{grant,current}))};
}
test("ticket CTA escapes authored copy and hands off to the real route without simulating submission",async()=>{
 const f=await fixture(),html=f.render();expect(html).toContain('href="/support/new"');expect(html).toContain("Tell us what happened.");expect(html).not.toContain("<script>");expect(html).not.toContain("<form");expect(html).not.toContain("Ticket created");
 f.host.invalidate();expect(()=>f.render()).toThrow();
});
test("unavailable support has no actionable link and forged route/submission payloads are rejected",async()=>{
 const f=await fixture(false),html=f.render();expect(html).toContain("Support requests are not available here right now.");expect(html).not.toContain('href="/support/new"');
 Object.assign(f.envelope.dataByBlock.contact.data,{href:"https://other.invalid",ticketId:"forged"});expect(()=>validateCanonicalData(f.tree,scope,policy,f.envelope)).toThrow();
});
