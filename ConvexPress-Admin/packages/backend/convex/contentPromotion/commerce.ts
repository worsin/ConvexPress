import type { IndexRangeBuilder } from "convex/server";
import type { Doc } from "../_generated/dataModel";
import type { ContentPromotionManifest, PromotionRecord } from "@convexpress/site-contract/content-promotion";
import { promotionDataSchemas } from "@convexpress/site-contract/content-promotion";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { COMMERCE_GENERAL_DEFAULTS } from "../settings/defaults";
import { buildSelectionKey, buildOptionSummaryFromSelections, normalizeName, type OptionType } from "../commerce/variantHelpers";
import { fail, hash, plain, read, referencedKey, type Row } from "./shared";
import { patchWithMediaReferences } from "../media/attachmentGuard";

export const isCatalogKind = (kind: string) => ["product", "productCategory", "productTag", "productBrand", "productVariant"].includes(kind);
const optionSignature = (options: Array<{name:string;value:string}>) => JSON.stringify(options.map(o=>[normalizeName(o.name),normalizeName(o.value)]).sort((a,b)=>a[0].localeCompare(b[0])));
export function validateCatalogManifest(manifest: ContentPromotionManifest): void {
  const categories = new Map(manifest.records.filter(r=>r.kind === "productCategory").map(r=>[r.key,r]));
  for(const category of categories.values()) {
    let row=category, depth=0; const visited=new Set<string>([row.key]);
    while(row.data.parentId) {
      const parent=categories.get(referencedKey(String(row.data.parentId))??"");
      if(!parent) fail("CATALOG_PARENT_REQUIRED","Every category parent must be included in the reviewed unit.");
      if(visited.has(parent.key)) fail("PROMOTION_REFERENCE_CYCLE","Category parents form a cycle.");
      visited.add(parent.key); row=parent; depth++;
      if(depth>=5) fail("CATALOG_CATEGORY_DEPTH","Product categories support five levels.");
    }
  }
  const skus = new Set<string>();
  for (const record of manifest.records) {
    if (!isCatalogKind(record.kind)) continue;
    if (record.data.slug && !(record.kind === "productTag" ? /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u : /^[a-z0-9][a-z0-9_-]*$/).test(String(record.data.slug))) fail("CATALOG_SLUG_INVALID", "Catalog slugs must be canonical single segments.");
    if (record.kind === "productBrand" && record.data.logoMediaId) {
      const logo = manifest.records.find(r => r.key === referencedKey(String(record.data.logoMediaId)));
      if (!logo || logo.kind !== "media" || !String(logo.data.mimeType).startsWith("image/")) fail("BRAND_LOGO_INVALID", "A brand logo must reference reviewed image media.");
    }
    if (record.data.sku) {
      const sku=String(record.data.sku);
      if(sku !== sku.trim() || skus.has(sku.toUpperCase())) fail("CATALOG_SKU_CONFLICT", "Each reviewed SKU must be trimmed and unique across products and variants.");
      skus.add(sku.toUpperCase());
    }
    if(record.kind === "product" || record.kind === "productVariant") {
      const price = record.kind === "product" ? promotionDataSchemas.product.parse(record.data).basePrice : promotionDataSchemas.productVariant.parse(record.data).price;
      const sale = record.kind === "product" ? promotionDataSchemas.product.parse(record.data).salePrice : promotionDataSchemas.productVariant.parse(record.data).salePrice;
      if(sale && (sale.currencyCode !== price.currencyCode || sale.amount > price.amount)) fail("CATALOG_PRICE_INVALID", "Sale currency must match and sale price cannot exceed the reviewed regular price.");
      if(typeof record.data.salePriceFrom === "number" && typeof record.data.salePriceTo === "number" && record.data.salePriceFrom >= record.data.salePriceTo) fail("CATALOG_PRICE_INVALID", "Sale end must follow its start.");
    }
  }
  for (const record of manifest.records.filter(r=>r.kind === "product")) {
    const product=promotionDataSchemas.product.parse(record.data);
    const names=new Set<string>();
    for(const option of product.options) {
      const name=normalizeName(option.name), values=option.values.map(normalizeName);
      if(!name || names.has(name) || values.some(v=>!v) || new Set(values).size!==values.length) fail("CATALOG_OPTIONS_INVALID", "Option names and values must be nonempty and unique.");
      names.add(name);
    }
    const variants=manifest.records.filter(r=>r.kind === "productVariant" && referencedKey(String(r.data.productId)) === record.key).map(r=>promotionDataSchemas.productVariant.parse(r.data));
    if(product.productType === "simple" && (variants.length || product.options.length)) fail("CATALOG_VARIANTS_INVALID", "Simple products cannot carry variant options or variants.");
    if(product.productType === "variable" && (!product.options.length || !variants.length || variants.filter(v=>v.isDefault).length!==1)) fail("CATALOG_VARIANTS_INVALID", "Variable products require options, all variants and exactly one default.");
    const selections=new Set<string>();
    for(const variant of variants) {
      const key=optionSignature(variant.options);
      if(selections.has(key) || variant.options.length!==product.options.length || new Set(variant.options.map(o=>normalizeName(o.name))).size !== product.options.length) fail("CATALOG_VARIANTS_INVALID", "Variant selections must be complete and unique.");
      selections.add(key);
      for(const option of product.options) {
        const selected=variant.options.find(o=>normalizeName(o.name)===normalizeName(option.name));
        if(!selected || !option.values.some(v=>normalizeName(v)===normalizeName(selected.value))) fail("CATALOG_VARIANTS_INVALID", "Variant selection does not exist in the reviewed product options.");
      }
      if(variant.price.currencyCode !== product.basePrice.currencyCode) fail("CATALOG_PRICE_INVALID", "Variant and product currency must match.");
    }
  }
  for(const variant of manifest.records.filter(r=>r.kind === "productVariant"))
    if(!manifest.records.some(r=>r.kind === "product" && r.key===referencedKey(String(variant.data.productId)))) fail("CATALOG_PARENT_REQUIRED", "Every variant must include its authored parent product in this reviewed unit.");
}
export async function lookupCatalogTarget(ctx: QueryCtx, record: PromotionRecord, known: Map<string,string>): Promise<Row|null> {
  if(record.kind === "product") return await ctx.db.query("commerce_products").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).unique();
  if(record.kind === "productCategory") return await ctx.db.query("commerce_product_categories").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).unique();
  if(record.kind === "productBrand") return await ctx.db.query("commerce_product_brands").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).unique();
  if(record.kind === "productTag") return await ctx.db.query("commerce_product_tags").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).unique();
  const productId=known.get(referencedKey(String(record.data.productId))??"");
  if(!productId) return null;
  const parent=ctx.db.normalizeId("commerce_products",productId);
  if(!parent) fail("CATALOG_PARENT_REQUIRED","Invalid target product mapping.");
  const rows: Doc<"commerce_product_variants">[]=await ctx.db.query("commerce_product_variants").withIndex("by_product",(q: IndexRangeBuilder<Doc<"commerce_product_variants">, ["productId", "_creationTime"]>)=>q.eq("productId",parent)).take(101);
  if(rows.length>100) fail("PROMOTION_SCAN_LIMIT","Target variant collection exceeds this atomic adapter.");
  const wanted=promotionDataSchemas.productVariant.parse(record.data);
  const matches=rows.filter(row => (wanted.sku && row.sku===wanted.sku) || optionSignature((row.selections??[]).map((o:{optionTypeName:string;optionValueLabel:string})=>({name:o.optionTypeName,value:o.optionValueLabel})))===optionSignature(wanted.options));
  if(matches.length>1) fail("TARGET_VARIANT_CONFLICT","Target SKU and selection identify different variants.");
  return matches[0]??null;
}
export async function reviewCatalogRecord(ctx:QueryCtx, manifest:ContentPromotionManifest, record:PromotionRecord, current:Row|null, known:Map<string,string>, issue:(code:string,key:string,message:string)=>void):Promise<void> {
  if(!isCatalogKind(record.kind)) return;
  if(record.data.sku) {
    const sku=String(record.data.sku);
    const owners=[...await ctx.db.query("commerce_products").withIndex("by_sku",q=>q.eq("sku",sku)).take(2),...await ctx.db.query("commerce_product_variants").withIndex("by_sku",(q: IndexRangeBuilder<Doc<"commerce_product_variants">, ["sku", "_creationTime"]>)=>q.eq("sku",sku)).take(2)];
    if(owners.some(o=>o._id!==current?._id)) issue("TARGET_SKU_CONFLICT",record.key,"The SKU belongs to another live record or changes an established target SKU. Resolve the target identity explicitly.");
  }
  if(current?.sku && current.sku !== record.data.sku) issue("TARGET_SKU_CONFLICT",record.key,"Removing or changing an established target SKU requires explicit identity resolution.");
  if(current && record.data.slug) {
    const natural=record.kind === "product" ? await ctx.db.query("commerce_products").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).take(2) : record.kind === "productCategory" ? await ctx.db.query("commerce_product_categories").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).take(2) : record.kind === "productBrand" ? await ctx.db.query("commerce_product_brands").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).take(2) : record.kind === "productTag" ? await ctx.db.query("commerce_product_tags").withIndex("by_slug",q=>q.eq("slug",String(record.data.slug))).take(2) : [];
    if(natural.some(r=>r._id!==current._id)) issue("TARGET_CATALOG_IDENTITY_CONFLICT",record.key,"Another target record owns the reviewed slug.");
  }
  if(record.kind === "product" || record.kind === "productVariant") {
    const settings=await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","commerce.general")).unique();
    const currency=settings?.values.currencyCode??COMMERCE_GENERAL_DEFAULTS.currencyCode;
    const price=record.kind === "product" ? promotionDataSchemas.product.parse(record.data).basePrice : promotionDataSchemas.productVariant.parse(record.data).price;
    if(currency!==price.currencyCode) issue("TARGET_CURRENCY_MISMATCH",record.key,"Reviewed catalog prices must use the target store currency.");
    if(current && (current.isVirtual || current.isDownloadable || current.requiresLicense || current.productType === "external")) issue("TARGET_DELIVERY_ADAPTER_REQUIRED",record.key,"Existing virtual, downloadable, licensed or external products require a delivery adapter; their target configuration is preserved.");
  }
  if(record.kind === "product" && current) {
    const id=ctx.db.normalizeId("commerce_products",current._id)!;
    if(await ctx.db.query("commerce_bundles").withIndex("by_product",q=>q.eq("productId",id)).first()) issue("TARGET_BUNDLE_ADAPTER_REQUIRED",record.key,"Bundle-owned products require their authored bundle adapter.");
    if(current.productType!==record.data.productType) issue("TARGET_PRODUCT_TYPE_CONFLICT",record.key,"Changing an established product type requires a separate catalog migration.");
    for(const categoryId of (Array.isArray(current.categoryIds)?current.categoryIds:[])) {
      const category=await read(ctx,"productCategory",String(categoryId));
      for(const id of [categoryId,...(Array.isArray(category?.path)?category.path:[])])
        if(![...known.values()].includes(String(id))) issue("TARGET_CATEGORY_COLLECTION_CONFLICT",record.key,"All existing target categories and their ancestors must be included before changing catalog assignments/counts.");
    }
  }
  if(record.kind === "productCategory" && current) {
    const parent=typeof record.data.parentId === "string" ? known.get(referencedKey(record.data.parentId)??""):undefined;
    if(Array.isArray(current.path) && current.path.some(id=>![...known.values()].includes(String(id)))) issue("TARGET_CATEGORY_PATH_CONFLICT",record.key,"Target category ancestry outside the reviewed graph needs explicit repair before count changes.");
    if(current.parentId!==parent) issue("TARGET_CATEGORY_PARENT_CONFLICT",record.key,"Moving an existing category requires an explicit subtree/count migration.");
  }
  if(record.kind === "productVariant" && !current) {
    const parent=known.get(referencedKey(String(record.data.productId))??"");
    const row=parent?await read(ctx,"product",parent):null;
    if(row && !row.trackInventory) issue("TARGET_VARIANT_STOCK_POLICY",record.key,"Configure tracked stock on the target parent before adding new variants; promotion never changes live inventory policy.");
  }
  if(record.kind === "productVariant" && current) {
    const parent=known.get(referencedKey(String(record.data.productId))??"");
    if(current.productId!==parent) issue("TARGET_VARIANT_PARENT_CONFLICT",record.key,"A mapped variant cannot move between live products.");
  }
}
export async function reviewCatalogCollections(ctx:QueryCtx, changes:Array<{kind:string;targetId:string|null;key:string}>, issue:(code:string,key:string,message:string)=>void):Promise<void> {
  const retained=new Set(changes.filter(c=>c.kind === "productVariant").map(c=>c.targetId));
  for(const product of changes.filter(c=>c.kind === "product" && c.targetId)) {
    const id=ctx.db.normalizeId("commerce_products",product.targetId!)!;
    const variants: Doc<"commerce_product_variants">[]=await ctx.db.query("commerce_product_variants").withIndex("by_product",(q: IndexRangeBuilder<Doc<"commerce_product_variants">, ["productId", "_creationTime"]>)=>q.eq("productId",id)).take(101);
    if(variants.some(v=>!retained.has(v._id))) issue("TARGET_VARIANT_COLLECTION_CONFLICT",product.key,"Target variants outside this reviewed mapping require an explicit removal/merge adapter.");
  }
}
export async function catalogFields(ctx:MutationCtx, record:PromotionRecord, data:Record<string,unknown>, before:Row|null, seed:string):Promise<Record<string,unknown>> {
  if(record.kind === "productCategory") {
    const parentId=typeof data.parentId === "string"?ctx.db.normalizeId("commerce_product_categories",data.parentId):null;
    const parent=parentId?await ctx.db.get(parentId):null;
    const path=parent?[...(parent.path??[]),parent._id]:[];
    return {path,depth:path.length,...(!before?{productCount:0,totalProductCount:0}:{})};
  }
  if(record.kind === "product") {
    const product=promotionDataSchemas.product.parse(data);
    const old=Array.isArray(before?.optionTypes)?before.optionTypes:[];
    const optionTypes:OptionType[]=product.options.map((option,index)=>{
      const existing=old.find(o=>plain(o)&&normalizeName(String(o.name))===normalizeName(option.name));
      const values=plain(existing)&&Array.isArray(existing.values)?existing.values:[];
      return {id:plain(existing)&&typeof existing.id === "string"?existing.id:`opt_${hash(seed+option.name).slice(0,24)}`,name:option.name,sortOrder:index,values:option.values.map((label,n)=>{
        const prior=values.find(v=>plain(v)&&normalizeName(String(v.label))===normalizeName(label));
        return {id:plain(prior)&&typeof prior.id === "string"?prior.id:`val_${hash(seed+option.name+":"+label).slice(0,24)}`,label,sortOrder:n,active:true};
      })};
    });
    return {optionTypes,searchText:[product.title,product.excerpt,product.description,...product.options.flatMap(o=>[o.name,...o.values])].filter(Boolean).join(" "),...(!before?{trackInventory:true,stockQuantity:0,allowBackorders:false,isVirtual:false,isDownloadable:false}:{})};
  }
  if(record.kind === "productVariant") {
    const variant=promotionDataSchemas.productVariant.parse(data);
    const id=ctx.db.normalizeId("commerce_products",variant.productId);
    const product=id?await ctx.db.get(id):null;
    if(!product || !Array.isArray(product.optionTypes)) fail("CATALOG_PARENT_REQUIRED","Target product options are missing.");
    const optionTypes=product.optionTypes as OptionType[];
    const selections=optionTypes.map(option=>{
      const picked=variant.options.find(v=>normalizeName(v.name)===normalizeName(option.name));
      const value=option.values.find(v=>normalizeName(v.label)===normalizeName(picked?.value));
      if(!value) fail("CATALOG_VARIANTS_INVALID","Target option could not be resolved.");
      return {optionTypeId:option.id,optionTypeName:option.name,optionValueId:value.id,optionValueLabel:value.label,sortOrder:option.sortOrder};
    });
    return {selections,selectionKey:buildSelectionKey(selections),optionSummary:buildOptionSummaryFromSelections(selections),...(!before?{manageStock:"yes",stockQuantity:0,stockStatus:"outofstock",backorders:"no",isVirtual:false,isDownloadable:false}:{})};
  }
  return {};
}
export async function updateCatalogCounts(ctx:MutationCtx, entries:Array<{before:Row|null;targetId:string}>):Promise<void> {
  const deltas=new Map<string,{direct:number;total:number}>();
  const add=(id:string,direct:number,total:number)=>{const old=deltas.get(id)??{direct:0,total:0};deltas.set(id,{direct:old.direct+direct,total:old.total+total});};
  for(const {before,targetId} of entries) {
    const after=await read(ctx,"product",targetId);
    for(const [product,sign] of [[before,-1],[after,1]] as const) {
      if(product?.status!=="publish" || !Array.isArray(product.categoryIds)) continue;
      for(const categoryId of product.categoryIds) {
        const category=await read(ctx,"productCategory",String(categoryId));
        if(!category) fail("CATALOG_CATEGORY_MISSING","A reviewed category disappeared.");
        add(category._id,sign,sign);
        for(const ancestor of Array.isArray(category.path)?category.path:[]) add(String(ancestor),0,sign);
      }
    }
  }
  for(const [id,delta] of deltas) {
    const normalized=ctx.db.normalizeId("commerce_product_categories",id)!;const category=await ctx.db.get(normalized);
    if(!category) fail("CATALOG_CATEGORY_MISSING","A reviewed category disappeared.");
    await patchWithMediaReferences<"commerce_product_categories">(ctx, "commerce_product_categories", normalized,{productCount:Math.max(0,category.productCount+delta.direct),totalProductCount:Math.max(0,(category.totalProductCount??category.productCount)+delta.total)});
  }
}
