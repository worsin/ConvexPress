import { readReservedStock } from "../commerce/stockTarget";
import { resolveStockPolicy } from "../commerce/stockPolicy";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "./sourceBudget";
import { readProductCollection } from "./productCollection";
import { CanonicalDataError } from "./foundation/contracts";
import { productShowcaseArgsSchema,productShowcaseResultSchema,productShowcaseMatchArgs,type ProductShowcaseResult } from "./foundation/productShowcaseContracts";

/** Saved slugs are resolved in this database; the shared reader checks every
 * selected product against current publication, membership, stock and pricing. */
export async function readProductShowcase(ctx:QueryCtx,rawArgs:unknown,budget=new RequestReadLedger(),sources=new SourceByteLedger(),now=Date.now()):Promise<ProductShowcaseResult> {
 const args=productShowcaseArgsSchema.parse(rawArgs),productIds:string[]=[];
 if(args.source==="slugs")for(const slug of new Set(args.productSlugs)){
  if(!slug)continue;
  sources.beforeRead();budget.beforeRead();
  const product=budget.record(await ctx.db.query("commerce_products").withIndex("by_slug",q=>q.eq("slug",slug)).unique());
  if(product){sources.record("product",product);productIds.push(product._id);}
 }
 const mode=args.source==="newest"?"recent":args.source==="slugs"?"manual":args.source;
 const collection=await readProductCollection(ctx,{mode,productIds,categorySlug:args.categorySlug,count:args.count,showPrice:true,showRating:false,showAddToCart:args.showAddToCart},budget,sources,{now});
 const items:ProductShowcaseResult["items"]=[];
 for(const item of collection.items){
  const id=ctx.db.normalizeId("commerce_products",item.id);
  if(!id)throw new CanonicalDataError("PRODUCT_SHOWCASE_RESULT","showcase","Invalid projected product identity.");
  sources.beforeRead();budget.beforeRead();
  const product=budget.record(await ctx.db.get("commerce_products",id));
  if(!product)throw new CanonicalDataError("PRODUCT_SHOWCASE_RESULT","showcase","Missing projected product.");
  sources.record("product",product);
  let stock:ProductShowcaseResult["items"][number]["stock"];
  if(product.productType==="variable")stock="options";
  else if(product.productType==="external")stock="external";
  else {
   const initial=resolveStockPolicy(product);
   const reserved=initial.tracked?await readReservedStock(ctx,id,undefined,undefined,budget,now):0;
   stock=resolveStockPolicy(product,null,reserved).stockStatus;
  }
  items.push({...item,slug:product.slug,stock});
 }
 const result=productShowcaseResultSchema.parse({items});
 if(!productShowcaseMatchArgs(args,result))throw new CanonicalDataError("PRODUCT_SHOWCASE_RESULT","showcase","Product selection does not match the saved showcase.");
 return result;
}
