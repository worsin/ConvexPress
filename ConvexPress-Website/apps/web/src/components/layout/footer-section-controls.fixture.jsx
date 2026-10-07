import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import { getFunctionName } from "convex/server";
const identity = { title: "Studio", tagline: "Ideas made useful" };
mock.module("@/hooks/layout/useSiteIdentity", () => ({ useSiteIdentity: () => identity }));
mock.module("@/hooks/layout/useFooterConfig", () => ({ useFooterConfig: () => undefined }));
mock.module("@/hooks/layout/useMenuForLocation", () => ({ useMenuForLocation: () => ({ items: [{id:"work",type:"custom",label:"Our work",url:"/work",children:[]}] }) }));
mock.module("@/components/layout/SocialLinks", () => ({ SocialLinks: () => null }));
const convex = await import("convex/react");
mock.module("convex/react", () => ({ ...convex, useMutation: () => async () => {}, useQuery: (ref,args) => { const name=getFunctionName(ref); if(name.endsWith(":getPublic")) return args.mediaId === "missing" ? null : {url:"/footer-image.svg",width:1200,height:800,altText:"Library image"}; if(name.endsWith(":getSrcSet")) return ""; throw new Error(`Unexpected query ${name}`); } }));
const router = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({ ...router, Link: ({ to, children, activeProps: _activeProps, ...props }) => createElement("a", { href: to, ...props }, children) }));
const { FOOTER_DEFAULTS } = await import("@/templates/sdk/chromeDefinitions");
const fields = { columns:["1","2","3","4","centered","minimal"], background:["dark","match-site","accent","image"], topBorder:["none","subtle","bold","accent"], padding:["compact","normal","spacious"] };
const exports = {}; const failures = []; let cases=0;
for (const pack of ["core","journal","depot","aster-house"]) {
 const {default:Surface} = await import(`../../templates/packs/${pack}/surfaces/chrome.footer.tsx`);
 const render = (layout={},variant="full") => {
  const config=structuredClone(FOOTER_DEFAULTS);
  config.rows=[]; config.layout={...config.layout,backgroundImageId:"library-image",...layout};
  config.branding.description="Thoughtful work and useful details.";
  config.navColumns={enabled:true,columns:[{heading:"Explore",menuSource:"footer-1"}]};
  config.newsletter={enabled:true,heading:"Studio updates",subtext:"Occasional notes",buttonText:"Subscribe"};
  config.contactInfo={enabled:true,address:"Studio address",phone:"",email:"hello@example.test"};
  return renderToStaticMarkup(createElement(Surface,{data:{variant,siteIdentity:identity,footerConfig:config}}));
 };
 for (const [field,values] of Object.entries(fields)) {
  try {
   const variants=values.map(value=>render({[field]:value}));
   assert.equal(new Set(variants).size,values.length,`${pack}/${field}: ignored choices`);
   variants.forEach(html=>{assert(html.includes('href="/work"'));assert(html.includes("Thoughtful work"));});
   cases+=values.length;
  } catch(error){failures.push(error.message);}
 }
 try {
  const html=render({columns:"minimal"});
  assert(!html.includes("Studio updates"),`${pack}/minimal: newsletter should be omitted, as the builder preview promises`);
  assert(!html.includes("Studio address"),`${pack}/minimal: contact should be omitted`);
  const image=render({background:"image"});
  assert(image.includes('src="/footer-image.svg"'),`${pack}/image: selected public media must render`);
  assert(image.includes('alt=""'),`${pack}/image: background must be decorative`);
  assert(!render({background:"image",backgroundImageId:"missing"}).includes('src="/footer-image.svg"'));
  assert(!render({background:"match-site"}).includes('src="/footer-image.svg"'));
  assert.equal(render({columns:"1"},"minimal"),render({columns:"4"},"minimal"),"dashboard minimal variant stays independent");
  cases+=4;
 } catch(error){failures.push(error.message);}
 for (const [field,values] of Object.entries(fields)) for (const value of values) exports[`${pack}/${field}/${value}`]=render({[field]:value});
}
if(process.env.FOOTER_SECTION_OUTPUT)fs.writeFileSync(process.env.FOOTER_SECTION_OUTPUT,JSON.stringify(exports));
assert.equal(failures.length,0,failures.join("\n")); console.log(JSON.stringify({passed:true,cases}));
