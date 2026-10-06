import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
const identity = { title: "Footer row controls" };
mock.module("@/hooks/layout/useSiteIdentity", () => ({ useSiteIdentity: () => identity }));
mock.module("@/hooks/layout/useFooterConfig", () => ({ useFooterConfig: () => undefined }));
mock.module("@/hooks/layout/useMenuForLocation", () => ({ useMenuForLocation: () => null }));
mock.module("@/components/layout/SocialLinks", () => ({ SocialLinks: () => null }));
const convex = await import("convex/react");
mock.module("convex/react", () => ({ ...convex, useMutation: () => async () => {} }));
const router = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({ ...router, Link: ({ to, children, ...props }) => createElement("a", { href: to, ...props }, children) }));
const { FOOTER_DEFAULTS } = await import("@/templates/sdk/chromeDefinitions");
const fields = { background: ["default", "muted", "accent", "contrast", "transparent"], padding: ["none", "compact", "normal", "spacious"], container: ["narrow", "default", "wide", "full"], topBorder: ["none", "subtle", "bold", "accent"], alignment: ["left", "center", "right"] };
const row = { id: "study", heading: "Authored row", background: "default", padding: "normal", container: "default", topBorder: "none", alignment: "left", columns: [{id:"text",width:6,cell:{type:"text",heading:"Visit our studio",body:"Thoughtful work, useful details, and space to explore. This authored content must survive every row setting."}},{id:"links",width:6,cell:{type:"links",heading:"Explore",items:[{label:"Our work",url:"/work"},{label:"Contact",url:"/contact"}]}}] };
let cases = 0; const failures = []; const exports = {};
for (const pack of ["core", "journal", "depot", "aster-house"]) {
 const {default:Surface} = await import(`../../templates/packs/${pack}/surfaces/chrome.footer.tsx`);
 const render = rows => {const config=structuredClone(FOOTER_DEFAULTS);config.rows=rows;config.bottomBar.enabled=false;return renderToStaticMarkup(createElement(Surface,{data:{variant:"full",siteIdentity:identity,footerConfig:config}}));};
 for (const [field, values] of Object.entries(fields)) {
  const variants = values.map(value => render([{...row,[field]:value}]));
  try {assert.equal(new Set(variants).size,values.length,`${pack}/${field}: each exposed value changes the rendered row`); for (const html of variants) assert(html.includes(row.columns[0].cell.body));cases+=values.length;} catch(error){failures.push(error.message);}
 }
 exports[pack]=render([{...row,id:"compact",heading:"Compact narrow row",background:"muted",padding:"compact",container:"narrow",topBorder:"bold",alignment:"right"},{...row,id:"spacious",heading:"Spacious full row",background:"accent",padding:"spacious",container:"full",topBorder:"accent",alignment:"center"}]);
}
if(process.env.FOOTER_ROW_OUTPUT)fs.writeFileSync(process.env.FOOTER_ROW_OUTPUT,JSON.stringify(exports));
assert.equal(failures.length,0,failures.join("\n"));console.log(JSON.stringify({passed:true,cases}));
