import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";
import { CanonicalDataError } from "./foundation/contracts";
import { brandArgsSchema, brandResultSchema, publicBrandSchema, type BrandResult, type PublicBrand } from "./foundation/brandContracts";

/** Request-local reader. Neither storage ids nor private catalog metadata leave it. */
export async function createPublicBrandReader(ctx:QueryCtx,budget:RequestReadLedger) {
  const evaluate=createMembershipAccessEvaluator(ctx,budget);
  const enabled=await isPluginEnabled(ctx,"commerce",budget);
  const shopAllowed=enabled && (await evaluate({resourceType:"route",resourceIdOrKey:"/shop"})).allowed;
  const project=async(brand:Doc<"commerce_product_brands">|null):Promise<PublicBrand|null>=>{
    if(!shopAllowed || !brand || brand.status !== "publish") return null;
    const href=`/brands/${brand.slug}`;
    if(!(await evaluate({resourceType:"route",resourceIdOrKey:href})).allowed)return null;
    let logo:PublicBrand["logo"]=null;
    if(brand.logoMediaId) {
      budget.beforeRead();const media=budget.record(await ctx.db.get("media",brand.logoMediaId));
      if(media && media.status === "active" && media.mediaType === "image" && media.mimeType.startsWith("image/")) {
        let src:string|null|undefined=null;
        if(media.storageId){budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}
        src??=media.url;
        if(src)logo={src,alt:media.altText??brand.name};
      }
    }
    return publicBrandSchema.parse({id:brand._id,name:brand.name,slug:brand.slug,description:brand.description,href,logo});
  };
  return {shopAllowed,project};
}
export async function readBrands(ctx:QueryCtx,rawArgs:unknown,budget=new RequestReadLedger()):Promise<BrandResult> {
  const args=brandArgsSchema.parse(rawArgs),reader=await createPublicBrandReader(ctx,budget);
  if(!reader.shopAllowed)return {items:[]};
  const items:PublicBrand[]=[];
  const iterator=ctx.db.query("commerce_product_brands").withIndex("by_status_sort",q=>q.eq("status","publish"))[Symbol.asyncIterator]();
  let scanned=0;
  try {
    while(items.length<args.limit) {
      budget.beforeRead();const next=await iterator.next();if(next.done)break;
      const brand=budget.record(next.value);
      if(++scanned>160)throw new CanonicalDataError("BRAND_DISCOVERY_BUDGET","brands","Brand selection exceeds its authorized scan budget; no partial list is returned.");
      const item=await reader.project(brand);if(item)items.push(item);
    }
  }finally{await iterator.return?.();}
  return brandResultSchema.parse({items});
}
