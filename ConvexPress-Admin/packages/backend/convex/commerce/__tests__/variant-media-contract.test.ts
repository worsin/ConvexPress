import { expect, test } from "bun:test";
import { commerceHarness } from "./handlerHarness.test-support";
import { updateVariant } from "../products";
test("removing a variant image clears its optional media field", async () => {
 const ctx=commerceHarness({commerce_products:[{_id:"product1",title:"Product",slug:"product",status:"draft",basePrice:{amount:100,currencyCode:"USD"}}],commerce_product_variants:[{_id:"variant1",productId:"product1",title:"One",price:{amount:100,currencyCode:"USD"},featuredMediaId:"media1",status:"active"}]});
 await (updateVariant as any)._handler(ctx,{variantId:"variant1",featuredMediaId:null});
 expect(ctx.tables.commerce_product_variants[0].featuredMediaId).toBeUndefined();
});
