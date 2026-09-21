import { ConvexError, v } from "convex/values";
import type { RegisteredQuery } from "convex/server";
import { query, type QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { createPublicBrandReader } from "../canonicalDocuments/brands";
import { createPublicProductCardProjector } from "../canonicalDocuments/featuredProducts";
import { publicProductCardSchema, type FeaturedProductsResult } from "../canonicalDocuments/foundation/productContracts";
import type { PublicBrand } from "../canonicalDocuments/foundation/brandContracts";

type Args={slug:string;cursor?:string|null;refresh?:number};
type Result={brand:PublicBrand|null;page:FeaturedProductsResult["items"];isDone:boolean;continueCursor:string;recheckAt:number|null};
const money=v.object({amount:v.number(),currencyCode:v.string()});
const image=v.union(v.null(),v.object({src:v.string(),alt:v.string()}));
const card=v.object({id:v.string(),title:v.string(),href:v.string(),excerpt:v.union(v.null(),v.string()),createdAt:v.number(),image,pricing:v.union(v.null(),v.object({price:money,salePrice:v.union(v.null(),money),salePriceFrom:v.union(v.null(),v.number()),salePriceTo:v.union(v.null(),v.number()),pricedAt:v.number()}))});
/** A fixed-size indexed source page, with current authorization on every card.
 * Empty authorized pages retain their cursor so private prefixes never truncate
 * the catalog. Refresh is only a cache key; authority always uses server time. */
export const page:RegisteredQuery<"public",Args,Promise<Result>>=query({
  args:{slug:v.string(),cursor:v.optional(v.union(v.string(),v.null())),refresh:v.optional(v.number())},
  returns:v.object({brand:v.union(v.null(),v.object({id:v.string(),name:v.string(),slug:v.string(),description:v.string(),href:v.string(),logo:image})),page:v.array(card),isDone:v.boolean(),continueCursor:v.string(),recheckAt:v.union(v.null(),v.number())}),
  handler:async(ctx:QueryCtx,args:Args):Promise<Result>=>{
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.slug) || args.slug.length>120 || (args.cursor?.length??0)>8192 || (args.refresh!==undefined && (!Number.isSafeInteger(args.refresh)||args.refresh<0)))throw new ConvexError({code:"VALIDATION_ERROR",message:"Invalid brand catalog request."});
    const budget=new RequestReadLedger(),sources=new SourceByteLedger();
    const reader=await createPublicBrandReader(ctx,budget);
    const unavailable=():Result=>({brand:null,page:[],isDone:true,continueCursor:"",recheckAt:budget.authorizationRecheckAt});
    if(!reader.shopAllowed)return unavailable();
    budget.beforeRead();const source=budget.record(await ctx.db.query("commerce_product_brands").withIndex("by_slug",q=>q.eq("slug",args.slug)).unique());
    const brand=await reader.project(source);if(!brand || !source)return unavailable();
    budget.beforeRead();
    const candidates=await ctx.db.query("commerce_products").withIndex("by_brand_status",q=>q.eq("brandId",source._id).eq("status","publish")).order("desc").paginate({numItems:12,cursor:args.cursor??null,maximumRowsRead:12,maximumBytesRead:1024*1024});
    // Account every complete source before performing dependent reads.
    for(const product of candidates.page)budget.record(product);
    const project=await createPublicProductCardProjector(ctx,true,budget,sources);
    const items:FeaturedProductsResult["items"]=[];
    for(const product of candidates.page){const item=await project(product);if(item)items.push(publicProductCardSchema.parse(item));}
    return {brand,page:items,isDone:candidates.isDone,continueCursor:candidates.continueCursor,recheckAt:budget.authorizationRecheckAt};
  },
});
