import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const directory = mkdtempSync(join(app, ".order-display-test-"));
try {
  const entry = join(directory, "entry.tsx");
  const router = join(directory, "router.tsx");
  writeFileSync(router, `import * as React from "react";export const Link=({children,to,params,activeProps,inactiveProps,...rest})=><a href={to} {...rest}>{children}</a>;export const useRouterState=()=>({location:{pathname:"/"}});export const useRouter=()=>({invalidate(){}});`);
  writeFileSync(entry, `import * as React from "react";import{renderToStaticMarkup}from"react-dom/server";
${["core", "journal", "depot", "aster-house"].map((pack, i) => `import Pack${i} from ${JSON.stringify(join(app, "src/templates/packs", pack, "surfaces/dashboard.order.tsx"))};`).join("\n")}
const packs=[Pack0,Pack1,Pack2,Pack3];let count=0;
for(const Pack of packs)for(const source of ["storefront_order","form_order"])for(const historic of [false,true,"eur","no-currency"]){
const record={_id:"order",orderNumber:"TEST-1",sourceType:source,status:"paid",paymentStatus:"paid",fulfillmentStatus:"unfulfilled",currencyCode:historic==="no-currency"?undefined:historic==="eur"?"EUR":"USD",totalAmount:historic==="eur"?999:4500,items:[{_id:"line",productTitle:"Recorded item",quantity:1,lineTotalAmount:historic===true?undefined:3800}],lines:[{_id:"line",title:"Recorded item",quantity:1,lineTotalAmount:historic===true?undefined:3800,currencyCode:historic==="no-currency"?undefined:historic==="eur"?"EUR":"USD"}],shipments:[{_id:"shipment",shipmentNumber:"TEST-S1",carrier:"Utah delivery",serviceName:"Utah delivery",status:"pending"}],payments:[],transactions:[],createdAt:1,shippingCarrierName:"Utah delivery",shippingServiceName:"Utah delivery",...(historic===true?{}:{subtotalAmount:3800,discountAmount:historic==="eur"?300:0,shippingAmount:700,taxAmount:historic==="eur"?150:0,appliedDiscountCode:historic==="eur"?"FIELD":undefined})};
const data={orderId:"order",purchase:source==="storefront_order"?null:record,order:record,eligibility:null,existingReturns:[],hrefs:{orders:"/dashboard/orders",requestReturn:"/return",returnDetail:()=>"/return"}};
const html=renderToStaticMarkup(<Pack data={data} packId="fixture"/>);const text=html.replace(/<[^>]+>/g," ").replace(/\\s+/g," ");
for(const label of ["Subtotal","Discount","Shipping","Tax","Total"])if(!text.includes(label))throw Error("Missing "+label+": "+text);
if(historic===true){if((text.match(/Not recorded/g)||[]).length<5||text.includes("$0.00"))throw Error("Invented historical amounts: "+text);}
else if(historic==="no-currency"){if(!text.includes("Currency not recorded")||text.includes("$"))throw Error("Invented currency: "+text);}
else for(const value of historic==="eur"?["€38.00","−€3.00","€7.00","€1.50","€9.99"]:["$38.00","$0.00","$7.00","$45.00"])if(!text.includes(value))throw Error("Missing saved value "+value+": "+text);
if(text.includes("Utah delivery • Utah delivery"))throw Error("Duplicate carrier/service");count++;}
console.log(count+" order surface receipts passed");`);
  const result = await Bun.build({ entrypoints: [entry], target: "bun", outdir: directory, naming: "render.js", plugins: [{ name: "route-only-test-boundary", setup(build) {
    build.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({ path: router }));
    build.onResolve({ filter: /^@\// }, args => ({ path: Bun.resolveSync(resolve(app, "src", args.path.slice(2)), app) }));
  } }] });
  if (!result.success) throw Error(result.logs.join("\n"));
  const run = spawnSync(process.execPath, [join(directory, "render.js")], { encoding: "utf8" });
  process.stdout.write(run.stdout);process.stderr.write(run.stderr);
  if(run.status!==0)process.exitCode=1;
} finally { rmSync(directory, { recursive: true, force: true }); }
