import type {ProductShowcaseArgs} from "../src/templates/sdk/block-data/portable/productShowcaseContracts";
import type { CategoryTilesArgs } from "../src/templates/sdk/block-data/portable/categoryTilesContracts";
import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { FeaturedProductsArgs } from "../src/templates/sdk/block-data/portable/productContracts";
import type { ProductCollectionArgs } from "../src/templates/sdk/block-data/portable/productCollectionContracts";
import mug from "./assets/aster-house-camp-mug.png";
import notebook from "./assets/aster-house-field-notebook.png";
/** Explicitly synthetic BlockDemo catalog, never imported by production readers. */
export const demoProducts=[
 {id:"demo-product-mug",title:"The morning mug",excerpt:"A generous shape, a quiet green glaze. Made for the first unhurried cup.",src:mug,alt:"Green ceramic mug on sunlit stone",amount:3800},
 {id:"demo-product-notebook",title:"Field notes, kept close",excerpt:"For unfinished thoughts, familiar places, and things worth remembering.",src:notebook,alt:"Green field notebook and pencil",amount:2400},
 {id:"demo-product-pair",title:"A cup for company",excerpt:"An everyday ritual, shared. Two well-made companions for the kitchen shelf.",src:mug,alt:"Handmade ceramic mug",amount:7000},
 {id:"demo-product-journal",title:"The open-page journal",excerpt:"A little room to notice more. Bound simply, ready for the everyday.",src:notebook,alt:"A notebook resting on warm stone",amount:3200},
];
const records = demoProducts;
function select(ids:readonly string[],count:number,showPrice:boolean) {
 return [...new Set(ids)].flatMap(id=>records.filter(record=>record.id===id)).slice(0,count).map(record=>({id:record.id,title:record.title,href:`/products/${record.id}`,excerpt:record.excerpt,createdAt:1788566400000-records.indexOf(record),image:{src:record.src.startsWith('/')?record.src:`/${record.src}`,alt:record.alt},pricing:showPrice?{price:{amount:record.amount,currencyCode:"USD"},salePrice:record.id==='demo-product-notebook'?{amount:1800,currencyCode:"USD"}:null,salePriceFrom:null,salePriceTo:null,pricedAt:Date.now()}:null}));
}
const featured=(args:FeaturedProductsArgs)=>({items:select(args.productIds.length?args.productIds:records.map(r=>r.id),args.count,args.showPrice)});
const collection=(args:ProductCollectionArgs)=>{
 const ids=args.mode==="manual"?args.productIds:args.mode==="sale"?["demo-product-notebook"]:args.mode==="recentlyViewed"?["demo-product-journal","demo-product-mug"]:args.mode==="tag"?(args.tagSlug==="gift"?["demo-product-notebook"]:[]):args.mode==="category"?(args.categorySlug==="studio"?["demo-product-mug","demo-product-pair"]:[]):args.mode==="featured"?["demo-product-mug","demo-product-notebook"]:records.map(r=>r.id);
 const cards=(selected:readonly string[])=>select(selected,args.count,args.showPrice).map(card=>({...card,rating:args.showRating?{average:4.8,count:24}:null,cart:args.showAddToCart?{kind:"add" as const,productId:card.id}:null}));
 return {items:cards(ids),groups:args.groups.map((group,index)=>({index,items:cards(group.productIds)}))};
};
const showcase=(args:ProductShowcaseArgs)=>({items:collection({mode:args.source==="newest"?"recent":args.source==="slugs"?"manual":args.source,productIds:args.productSlugs,categorySlug:args.categorySlug,tagSlug:"",count:args.count,showPrice:true,showRating:false,showAddToCart:args.showAddToCart,groups:[]}).items.map(item=>({...item,slug:item.id,stock:"instock" as const}))});
const categoryRecords=[
 {id:"demo-category-home",slug:"home",name:"At home",description:"Good company for the kitchen shelf and the first cup of the day.",src:mug,count:12},
 {id:"demo-category-field",slug:"field",name:"Out in the field",description:"For wandering paths, open pages, and the notes you bring home.",src:notebook,count:8},
 {id:"demo-category-gifts",slug:"gifts",name:"Thoughtfully given",description:"Simple things that say a little more. Chosen to be kept.",src:null,count:0},
];
const categories=(args:CategoryTilesArgs)=>({items:(args.categorySlugs.length?[...new Set(args.categorySlugs)].flatMap(slug=>categoryRecords.filter(c=>c.slug===slug)):categoryRecords).slice(0,args.count).map(c=>({id:c.id,slug:c.slug,name:c.name,href:`/categories/${c.slug}`,description:args.showDescriptions?c.description:null,image:c.src?{src:c.src.startsWith('/')?c.src:`/${c.src}`,alt:c.name}:null,productCount:args.showCounts?c.count:null}))});
export type CategorySpecimen = "available" | "empty" | "discovering" | "counting" | "maximum";
function categorySpecimen(args: CategoryTilesArgs, state: CategorySpecimen = "available") {
 if (state === "empty") return { items: [] };
 if (state === "discovering") return { items: [], state, cursor: null, nextCursor: "synthetic-category-discovery" };
 const result = categories(args);
 if (state === "counting" && args.showCounts) return { items: result.items.map(item => ({ ...item, productCount: null })), state, cursor: null, nextCursor: "synthetic-category-counting" };
 if (state === "maximum") return { items: result.items.map(item => ({ ...item, name: "W".repeat(512), description: args.showDescriptions ? "Long description ".repeat(600).slice(0,8192) : null, productCount: args.showCounts ? Number.MAX_SAFE_INTEGER : null })) };
 return result;
}
export function resolveProductsDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,options:{emptyHistory?:boolean;emptyCategories?:boolean;categoryState?:CategorySpecimen}={}) {
 const parameters:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>({page:null}),undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,async args=>featured(args),async args=>args.mode==="recentlyViewed" && options.emptyHistory?{items:[],groups:[]}:collection(args),async args=>categorySpecimen(args,options.emptyCategories?"empty":options.categoryState),async args=>showcase(args)];
 parameters[36]=async args=>{const product=select(args.product?[args.product]:[],1,false)[0]??null;const groups=product?[{id:"color",name:"Color",values:[{id:"forest",label:"Forest"},{id:"oat",label:"Oat"},{id:"ink",label:"Ink"}]},{id:"size",name:"Size",values:[{id:"pocket",label:"Pocket"},{id:"desk",label:"Desk"}]}]:[];return {product,groups:args.attribute.trim()?groups.filter(group=>group.id===args.attribute.trim()||group.name.toLowerCase()===args.attribute.trim().toLowerCase()):groups};};
 return resolveCanonicalData(...parameters);
}
