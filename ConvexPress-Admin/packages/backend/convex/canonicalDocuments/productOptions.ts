import { parseSourceOptions } from "./productOptionSource";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "./sourceBudget";
import { createPublicProductCardProjector } from "./featuredProducts";
import { CanonicalDataError } from "./foundation/contracts";
import { productOptionsArgsSchema, productOptionsResultSchema, productOptionsMatchArgs, type ProductOptionsResult } from "./foundation/productOptionsContracts";

const MAX_VARIANTS = 128;
function refuse(message:string):never { throw new CanonicalDataError("PRODUCT_OPTIONS_INVALID","productOptions",message); }

/** Read only the saved product in this database. Options are public disclosures,
 * not an inventory promise; ordering and stock are checked on the product page. */
export async function readProductOptions(ctx:QueryCtx, rawArgs:unknown,
  budget=new RequestReadLedger(), sources=new SourceByteLedger(), now=Date.now()):Promise<ProductOptionsResult> {
  const args=productOptionsArgsSchema.parse(rawArgs);
  if(!Number.isSafeInteger(now)||now<0)refuse("Invalid product options time.");
  const project=await createPublicProductCardProjector(ctx,false,budget,sources,now);
  const id=args.product && ctx.db.normalizeId("commerce_products",args.product);
  if(!id)return {product:null,groups:[]};
  sources.beforeRead();budget.beforeRead();
  const source=budget.record(await ctx.db.get("commerce_products",id));
  const card=await project(source);
  if(!card||!source)return {product:null,groups:[]};
  const groups:ProductOptionsResult["groups"]=[];
  if(source.productType==="variable"){
    const parsed=parseSourceOptions(source.optionTypes??[]);
    if(!parsed.success)refuse("Product options need repair before they can be displayed.");
    const options=parsed.data.sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map(group=>({id:group.id,name:group.name,values:group.values.filter(value=>value.active!==false).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map(({id,label})=>({id,label}))}));
    if(new Set(options.map(group=>group.id)).size!==options.length || options.some(group=>new Set(group.values.map(value=>value.id)).size!==group.values.length))refuse("Product options contain duplicate identities.");
    const allowed=new Map<string,Set<string>>();let count=0;
    // Two indexed public-status ranges; hidden variants cannot consume or leak
    // into the result. Read one beyond the cap and refuse partial coverage.
    for(const status of ["publish",undefined] as const){
      const iterator=ctx.db.query("commerce_product_variants").withIndex("by_product_status",q=>q.eq("productId",id).eq("status",status))[Symbol.asyncIterator]();
      try { while(true){
        sources.beforeRead();budget.beforeRead();const next=await iterator.next();if(next.done)break;
        const variant=budget.record(next.value);sources.record("variant",variant);
        if(++count>MAX_VARIANTS)refuse("Product options exceed the bounded variant budget; no partial choices are returned.");
        const selections=variant.selections??[];
        // Only complete combinations recognized by the product page qualify.
        if(selections.length!==options.length || new Set(selections.map(value=>value.optionTypeId)).size!==options.length
          || selections.some(value=>!options.some(group=>group.id===value.optionTypeId&&group.values.some(option=>option.id===value.optionValueId))))continue;
        for(const value of selections){const values=allowed.get(value.optionTypeId)??new Set<string>();values.add(value.optionValueId);allowed.set(value.optionTypeId,values);}
      }} finally {await iterator.return?.();}
    }
    const selected=args.attribute.trim();const matches=selected?options.filter(group=>group.id===selected):options;
    const candidates=selected&&matches.length===0?options.filter(group=>group.name.toLowerCase()===selected.toLowerCase()):matches;
    if(selected&&candidates.length>1)refuse("The selected attribute is ambiguous; use its option identity.");
    for(const group of candidates){const values=group.values.filter(value=>allowed.get(group.id)?.has(value.id));if(values.length)groups.push({...group,values});}
  }
  const result=productOptionsResultSchema.parse({product:{...card,pricing:null},groups});
  if(!productOptionsMatchArgs(args,result))refuse("Product options do not match the saved selection.");
  return result;
}
