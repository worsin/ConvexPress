import { moveToCart } from "../../commerceWishlists/mutations";
import { createSession, updateSession } from "../checkout";
import { getRateContextForSession } from "../../shipping/internals";
import { cartContext } from "../storefront";
import { expect, test } from "bun:test";
import { getMine, addItem, clear, merge, removeDiscountCode } from "../cart";
import { commerceHarness } from "./handlerHarness.test-support";
const invoke=(fn:any,ctx:any,args:any)=>fn._handler(ctx,args);
function fixture(status:string,userId:string|null=null){return commerceHarness({
 commerce_carts:[{_id:"closed",sessionToken:"session",status,userId:userId??undefined,currencyCode:"USD",subtotalAmount:3800,totalAmount:4500,itemCount:1,orderId:"order"}],
 commerce_cart_items:[{_id:"historical-line",cartId:"closed",productId:"mug",quantity:1,unitPriceAmount:3800,lineTotalAmount:3800}],
 commerce_products:[{_id:"mug",title:"Mug",slug:"mug",status:"publish",productType:"simple",basePrice:{amount:3800,currencyCode:"USD"},trackInventory:true,stockQuantity:23}],
 commerce_orders:[{_id:"order",cartId:"closed",sessionToken:"session",totalAmount:4500}],
 commerce_checkout_sessions:[{_id:"checkout",cartId:"closed",sessionToken:"session",status:"completed",orderId:"order"}],
},userId);}
for(const status of ["converted","merged"]){
 test(`${status} cart is hidden and next add starts a separate cart without changing history`,async()=>{
  const ctx=fixture(status);
  expect(await invoke(getMine,ctx,{sessionToken:"session"})).toBeNull();
  expect((await invoke(cartContext,ctx,{sessionToken:"session"})).itemCount).toBe(0);
  await invoke(addItem,ctx,{sessionToken:"session",productId:"mug",quantity:1});
  const current=await invoke(getMine,ctx,{sessionToken:"session"});
  expect(current._id).not.toBe("closed");expect(current.status).toBe("active");expect(current.itemCount).toBe(1);expect(current.items).toHaveLength(1);
  expect(ctx.tables.commerce_carts.filter((cart:any)=>cart.sessionToken==="session")).toHaveLength(1);
  const old=ctx.tables.commerce_carts.find((cart:any)=>cart._id==="closed");expect(old.status).toBe(status);expect(old.orderId).toBe("order");expect(old.totalAmount).toBe(4500);
  expect(ctx.tables.commerce_cart_items.find((line:any)=>line._id==="historical-line").cartId).toBe("closed");
  const nextCheckout=await invoke(createSession,ctx,{sessionToken:"session",email:"guest@example.test"});
  expect(nextCheckout).not.toBe("checkout");
  expect((await invoke(getRateContextForSession,ctx,{sessionToken:"session"})).cart._id).toBe(current._id);
  expect(ctx.tables.commerce_orders[0].sessionToken).toBe("session");expect(ctx.tables.commerce_checkout_sessions[0].sessionToken).toBe("session");
  await invoke(addItem,ctx,{sessionToken:"session",productId:"mug",quantity:1});expect((await invoke(getMine,ctx,{sessionToken:"session"})).itemCount).toBe(2);
 });
 test(`${status} cart cannot be cleared, discounted or resurrected by login merge`,async()=>{
  const ctx=fixture(status,"admin");
  await expect(invoke(clear,ctx,{sessionToken:"session"})).rejects.toThrow();
  await expect(invoke(updateSession,ctx,{sessionToken:"session",email:"changed@example.test"})).rejects.toThrow();
  await expect(invoke(removeDiscountCode,ctx,{sessionToken:"session"})).rejects.toThrow();
  await invoke(merge,ctx,{sessionToken:"session"});
  expect(ctx.tables.commerce_carts[0].status).toBe(status);expect(ctx.tables.commerce_cart_items).toHaveLength(1);
 });
}
test("pending payment remains visible and locked instead of starting a competing cart",async()=>{
 const ctx=fixture("pending_payment");expect((await invoke(getMine,ctx,{sessionToken:"session"}))._id).toBe("closed");
 await expect(invoke(addItem,ctx,{sessionToken:"session",productId:"mug",quantity:1})).rejects.toThrow();expect(ctx.tables.commerce_carts).toHaveLength(1);
});

test("moving a wishlist item after checkout uses the normal fresh-cart pricing and totals path",async()=>{
 const ctx=fixture("converted","admin");
 ctx.tables.settings[0].values.commerceWishlistsEnabled=true;
 ctx.tables.commerce_wishlist_items=[{_id:"wish-item",wishlistId:"wishlist",productId:"mug"}];
 ctx.tables.commerce_wishlists=[{_id:"wishlist",userId:"admin"}];
 ctx.handlers["commerce/cart:addItem"]=addItem;
 await invoke(moveToCart,ctx,{sessionToken:"session",itemId:"wish-item",quantity:1});
 const current=await invoke(getMine,ctx,{sessionToken:"session"});
 expect(current._id).not.toBe("closed");expect(current.itemCount).toBe(1);expect(current.subtotalAmount).toBe(3800);expect(current.items).toHaveLength(1);
 expect(ctx.tables.commerce_carts[0].status).toBe("converted");expect(ctx.tables.commerce_wishlist_items).toHaveLength(0);
});

test("wishlist move rejects another customer's item before touching either cart",async()=>{
 const ctx=fixture("converted","admin");ctx.tables.settings[0].values.commerceWishlistsEnabled=true;
 ctx.tables.commerce_wishlist_items=[{_id:"other-item",wishlistId:"other-list",productId:"mug"}];
 ctx.tables.commerce_wishlists=[{_id:"other-list",userId:"other-user"}];ctx.handlers["commerce/cart:addItem"]=addItem;
 await expect(invoke(moveToCart,ctx,{sessionToken:"session",itemId:"other-item",quantity:1})).rejects.toThrow();
 expect(ctx.tables.commerce_carts).toHaveLength(1);expect(ctx.tables.commerce_wishlist_items).toHaveLength(1);
});
for (const status of ["active", "abandoned"]) {
 test(`${status} carts retain their identity when shopping continues`, async () => {
  const ctx=fixture(status); delete ctx.tables.commerce_carts[0].orderId;
  await invoke(addItem,ctx,{sessionToken:"session",productId:"mug",quantity:1});
  const current=await invoke(getMine,ctx,{sessionToken:"session"});
  expect(current._id).toBe("closed");expect(current.status).toBe("active");expect(current.itemCount).toBe(2);expect(ctx.tables.commerce_carts).toHaveLength(1);
 });
}
