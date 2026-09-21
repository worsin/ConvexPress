import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference as ref} from "convex/server";
import schema from "../../schema";
const modules={"./convex/commerceWishlists/cleanup.ts":()=>import("../cleanup"),"./convex/commerceWishlists/shared.ts":()=>import("../shared"),"./convex/commerce/cart.ts":()=>import("../../commerce/cart"),"./convex/commerceWishlists/pages.ts":()=>import("../pages"),"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/commerceWishlists/queries.ts":()=>import("../queries"),"./convex/commerceWishlists/mutations.ts":()=>import("../mutations"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
export async function fixture(){const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
 const user=async(email:string)=>ctx.db.insert("users",{authSource:"local",email,emailVerified:true,status:"active",createdAt:1,updatedAt:1});const owner=await user("owner@example.invalid"),other=await user("other@example.invalid");
 await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true,commerceWishlistsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:owner});
 await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"test-website",instanceKey:"test-instance",environmentKind:"staging",deploymentOrigin:"https://backend.example.invalid",managementOrigin:"https://management.example.invalid",siteOrigin:"https://site.example.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
 const product=await ctx.db.insert("commerce_products",{title:"Saved mug",slug:"saved-mug",status:"publish",productType:"simple",authorId:owner,categoryIds:[],galleryMediaIds:[],basePrice:{amount:1200,currencyCode:"USD"},trackInventory:false,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1,rawSourceMeta:"private-import-marker"});
 const wishlist=await ctx.db.insert("commerce_wishlists",{userId:owner,name:"Private saved list",isDefault:true,isPublic:false,shareToken:"private-share-token",createdAt:1,updatedAt:1});
 const item=await ctx.db.insert("commerce_wishlist_items",{wishlistId:wishlist,productId:product,notes:"Private gift note",addedAt:1});return {owner,other,product,wishlist,item};});
 const auth=(user:string)=>t.withIdentity({subject:user,tokenIdentifier:`https://convexpress-admin.local|${user}`});return {t,ids,owner:auth(ids.owner),other:auth(ids.other)};}
test("private wishlist reads require the current owner, even when the ID is known",async()=>{
 const {t,ids,owner,other}=await fixture();const query=ref<"query">("commerceWishlists/queries:getWishlist");
 expect(await t.query(query,{wishlistId:ids.wishlist})).toBeNull();expect(await other.query(query,{wishlistId:ids.wishlist})).toBeNull();expect((await owner.query(query,{wishlistId:ids.wishlist}))._id).toBe(ids.wishlist);
 await t.run(ctx=>ctx.db.patch(ids.wishlist,{isPublic:true}));expect(await other.query(query,{wishlistId:ids.wishlist})).toBeNull();
});
test("adding to another account's list refuses before existing-item disclosure or insertion",async()=>{
 const {t,ids,other}=await fixture();const before=await t.run(ctx=>ctx.db.query("commerce_wishlist_items").collect());
 await expect(other.mutation(ref<"mutation">("commerceWishlists/mutations:addItem"),{wishlistId:ids.wishlist,productId:ids.product})).rejects.toThrow();
 expect(await t.run(ctx=>ctx.db.query("commerce_wishlist_items").collect())).toEqual(before);
});
test("inactive owners lose wishlist reads and all item mutations",async()=>{
 const {t,ids,owner}=await fixture();await t.run(ctx=>ctx.db.patch(ids.owner,{status:"inactive"}));
 expect(await owner.query(ref<"query">("commerceWishlists/queries:getWishlist"),{wishlistId:ids.wishlist})).toBeNull();
 await expect(owner.mutation(ref<"mutation">("commerceWishlists/mutations:removeItem"),{itemId:ids.item})).rejects.toThrow();expect(await t.run(ctx=>ctx.db.get(ids.item))).not.toBeNull();
});
test("shared wishlist data excludes private notes, ownership and raw product metadata",async()=>{
 const {t,ids}=await fixture();await t.run(ctx=>ctx.db.patch(ids.wishlist,{isPublic:true}));
 const value=await t.query(ref<"query">("commerceWishlists/queries:getSharedWishlist"),{shareToken:"private-share-token"});
 expect(value.items).toHaveLength(1);for(const secret of ["private-import-marker","Private gift note","userId","rawSourceMeta"])expect(JSON.stringify(value)).not.toContain(secret);
 await t.run(ctx=>ctx.db.patch(ids.product,{status:"draft"}));const hidden=await t.query(ref<"query">("commerceWishlists/queries:getSharedWishlist"),{shareToken:"private-share-token"});expect(hidden.items).toEqual([]);
});
