import {expect,test} from 'bun:test';
import {convexTest} from 'convex-test';
import {makeFunctionReference as ref} from 'convex/server';
import schema from '../../schema';
import {toProductCard} from '../storefront';
const token='11111111-1111-4111-8111-111111111111';
const modules={
 './convex/commerce/storefront.ts':()=>import('../storefront'),
 './convex/commerce/assistant/queries.ts':()=>import('../assistant/queries'),
 './convex/_generated/api.js':()=>import('../../_generated/api.js'),
 './convex/_generated/server.js':()=>import('../../_generated/server.js'),
};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert('users',{authSource:'local',email:'catalog@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  await ctx.db.insert('settings',{section:'plugins',values:{commerceEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const product=await ctx.db.insert('commerce_products',{title:'Notebook',slug:'notebook',status:'publish',productType:'simple',authorId:user,categoryIds:[],galleryMediaIds:[],basePrice:{amount:2400,currencyCode:'USD'},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1});
  const cart=await ctx.db.insert('commerce_carts',{sessionToken:token,status:'active',currencyCode:'USD',subtotalAmount:2400,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:2400,itemCount:1,lastActiveAt:1,createdAt:1,updatedAt:1});
  await ctx.db.insert('commerce_cart_items',{cartId:cart,productId:product,quantity:1,unitPriceAmount:2400,lineTotalAmount:2400,createdAt:1,updatedAt:1});
  return {user,product,cart};
 });return {t,ids};
}
async function productCopy(ctx:any,id:any,fields:any){const{_id,_creationTime,...product}=await ctx.db.get(id);return ctx.db.insert('commerce_products',{...product,...fields});}
const edge=(from:any,to:any,weight:number)=>({fromProductId:from,toProductId:to,type:'accessory_of' as const,weight,source:'manual' as const,status:'active' as const,createdAt:1,updatedAt:1});

test('unpublished cart products stay counted but cannot ground private descriptions or related recommendations',async()=>{
 const {t,ids}=await fixture();
 await t.run(async ctx=>{await ctx.db.patch(ids.product,{status:'draft',title:'PRIVATE_TITLE',assistantSummary:'PRIVATE_SUMMARY',conversationalAttributes:{private:'PRIVATE_ATTRIBUTE'}});const target=await productCopy(ctx,ids.product,{status:'publish',title:'Accessory',slug:'accessory'});await ctx.db.insert('commerce_product_relations',{...edge(ids.product,target,1),evidence:'PRIVATE_RELATION'});});
 const bundle:any=await t.query(ref('commerce/assistant/queries:contextBundle'),{sessionToken:token});
 expect(JSON.stringify(bundle)).not.toContain('PRIVATE_');expect(bundle.cart.itemCount).toBe(1);expect(bundle.cart.lines[0].quantity).toBe(1);expect(bundle.cart.lines[0].unavailable).toBe(true);expect(bundle.cartCards).toEqual([]);expect(bundle.related).toEqual([]);
 const publicContext:any=await t.query(ref('commerce/storefront:cartContext'),{sessionToken:token});expect(JSON.stringify(publicContext)).not.toContain('PRIVATE_');
 expect(await t.query(ref('commerce/storefront:relatedForProducts'),{productIds:[ids.product]})).toEqual([]);
});

test('withdrawn top relations do not crowd out a lower-ranked public alternative',async()=>{
 const {t,ids}=await fixture();const visible=await t.run(async ctx=>{const hidden=await productCopy(ctx,ids.product,{status:'draft',slug:'hidden'}),visible=await productCopy(ctx,ids.product,{slug:'public-alternative'});await ctx.db.insert('commerce_product_relations',edge(ids.product,hidden,1));await ctx.db.insert('commerce_product_relations',edge(ids.product,visible,.8));return visible;});
 const groups:any=await t.query(ref('commerce/storefront:relatedForProducts'),{productIds:[ids.product,ids.product],perGroup:1});expect(groups[0]?.items.map((i:any)=>i.card.productId)).toEqual([visible]);
});

test('variant selection uses indexed reads without scanning private options and honors selected stock',async()=>{
 const {t,ids}=await fixture();const selected=await t.run(async ctx=>{
  await ctx.db.patch(ids.product,{productType:'variable',trackInventory:true,stockQuantity:0});
  const variant={productId:ids.product,title:'Option',optionSummary:'Option',price:{amount:3400,currencyCode:'USD'},isDefault:true,createdAt:1,updatedAt:1};
  for(let i=0;i<180;i++)await ctx.db.insert('commerce_product_variants',{...variant,status:'private'});
  return ctx.db.insert('commerce_product_variants',{...variant,status:'publish',manageStock:'yes',stockQuantity:7,stockStatus:'instock'});
 });
 const card=await t.run(async ctx=>{
  const wrap=(value:any):any=>new Proxy(value,{get(target,key){if(key==='collect')return ()=>{throw Error('Unbounded variant read');};const fn=Reflect.get(target,key);if(typeof fn!=='function')return fn;return(...args:any[])=>{const next=fn.apply(target,args);return next&&typeof next==='object'&&typeof next.then!=='function'?wrap(next):next;};}});
  const db={get:ctx.db.get.bind(ctx.db),query:(name:any)=>wrap(ctx.db.query(name))};
  return toProductCard({...ctx,db},await ctx.db.get(ids.product));
 });
 expect(card.defaultVariantId).toBe(selected);expect(card.price.amount).toBe(3400);expect(card.inStock).toBe(true);expect(card.stockQuantity).toBe(7);
});

test('relation overflow is explicit rather than an unbounded scan or a silently incomplete ranking',async()=>{
 const {t,ids}=await fixture();await t.run(async ctx=>{const target=await productCopy(ctx,ids.product,{slug:'overflow-target'});for(let i=0;i<1001;i++)await ctx.db.insert('commerce_product_relations',edge(ids.product,target,i/1001));});
 await expect(t.query(ref('commerce/storefront:relatedForProducts'),{productIds:[ids.product]})).rejects.toThrow('recommendations');
});

test('hidden category prefixes cannot hide visible categories or leak into grounding and facets',async()=>{
 const {t,ids}=await fixture();
 const categories=await t.run(async ctx=>{
  const base={name:'HIDDEN_CATEGORY',slug:'hidden',productCount:1,createdAt:1,updatedAt:1,isVisible:false};
  let hidden:any;for(let i=0;i<205;i++)hidden=await ctx.db.insert('commerce_product_categories',{...base,slug:'hidden-'+i});
  const visible=await ctx.db.insert('commerce_product_categories',{...base,name:'Public category',slug:'public',isVisible:true});
  const {isVisible,...legacy}=base;const older=await ctx.db.insert('commerce_product_categories',{...legacy,name:'Legacy public',slug:'legacy'});
  await ctx.db.patch(ids.product,{categoryIds:[hidden,visible,older]});return[visible,older];
 });
 const bundle:any=await t.query(ref('commerce/assistant/queries:contextBundle'),{sessionToken:token});
 expect(bundle.categories.map((c:any)=>c.slug)).toEqual(['public','legacy']);expect(JSON.stringify(bundle)).not.toContain('HIDDEN_CATEGORY');
 const search:any=await t.query(ref('commerce/storefront:searchProducts'),{});expect(JSON.stringify(search)).not.toContain('HIDDEN_CATEGORY');expect(search.items[0].categories.map((c:any)=>c.id)).toEqual(categories);
 const tiles:any=await t.query(ref('commerce/storefront:categoryTiles'),{});expect(tiles.map((c:any)=>c.slug)).toEqual(['public','legacy']);
});

test('legacy public default and fallback variants retain their prior priority',async()=>{
 const {t,ids}=await fixture();const variants=await t.run(async ctx=>{
  await ctx.db.patch(ids.product,{productType:'variable'});
  const base={productId:ids.product,title:'Option',optionSummary:'Option',price:{amount:3400,currencyCode:'USD'},isDefault:false,createdAt:1,updatedAt:1};
  await ctx.db.insert('commerce_product_variants',{...base,status:'private',isDefault:true});
  const fallback=await ctx.db.insert('commerce_product_variants',{...base,status:'publish'});
  const legacy=await ctx.db.insert('commerce_product_variants',{...base,isDefault:true});
  await ctx.db.insert('commerce_product_variants',{...base,status:'publish',isDefault:true});return{fallback,legacy};
 });
 const card=()=>t.run(async ctx=>toProductCard(ctx,await ctx.db.get(ids.product)));
 expect((await card()).defaultVariantId).toBe(variants.legacy);
 await t.run(async ctx=>{for(const v of await ctx.db.query('commerce_product_variants').collect())if(v.isDefault&&v.status!=='private')await ctx.db.patch(v._id,{isDefault:false});});
 expect((await card()).defaultVariantId).toBe(variants.fallback);
 await t.run(async ctx=>{for(const v of await ctx.db.query('commerce_product_variants').collect())await ctx.db.patch(v._id,{status:'private'});});
 expect((await card()).defaultVariantId).toBeNull();expect((await card()).inStock).toBe(false);
});

test('withdrawn cart variants preserve totals without exposing their labels',async()=>{
 const {t,ids}=await fixture();await t.run(async ctx=>{
  const variant=await ctx.db.insert('commerce_product_variants',{productId:ids.product,title:'PRIVATE_VARIANT',optionSummary:'PRIVATE_OPTION',price:{amount:2400,currencyCode:'USD'},isDefault:true,status:'private',createdAt:1,updatedAt:1});
  const item=await ctx.db.query('commerce_cart_items').first();await ctx.db.patch(item!._id,{variantId:variant});
 });
 const bundle:any=await t.query(ref('commerce/assistant/queries:contextBundle'),{sessionToken:token});
 expect(JSON.stringify(bundle)).not.toContain('PRIVATE_');expect(bundle.cart.lines[0].unavailable).toBe(true);expect(bundle.cart.subtotalAmount).toBe(2400);expect(bundle.cartCards).toEqual([]);
});

test('cart grounding fails explicitly beyond the shared line budget',async()=>{
 const {t,ids}=await fixture();await t.run(async ctx=>{for(let i=0;i<160;i++)await ctx.db.insert('commerce_cart_items',{cartId:ids.cart,productId:ids.product,quantity:1,unitPriceAmount:2400,lineTotalAmount:2400,createdAt:1,updatedAt:1});});
 for(const name of ['commerce/assistant/queries:contextBundle','commerce/storefront:cartContext','commerce/storefront:relatedForCart'])await expect(t.query(ref(name),{sessionToken:token})).rejects.toThrow('too large');
});
