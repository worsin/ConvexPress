import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import cartCTA from "../../../../../../../blocks/commerce/cart-cta/render";
import { prepareBlocks } from "./model";
import { CartSummaryProvider, cartSummaryState, type CartSummaryHost } from "./cart-summary";
const policy = { enabledPlugins: ["commerce"], capabilities: ["viewer.authorization"], disabledBlocks: [] };
const ready: CartSummaryHost = { state: "ready", itemCount: 3, subtotalAmount: 8600, currencyCode: "USD" };
function render(value?: CartSummaryHost, attrs: Record<string, unknown> = {}) {
  const view = prepareBlocks([{ id: "cart", name: "commerce/cart-cta", version: 1, attrs }],
    { "commerce/cart-cta": cartCTA }, policy, { media: {} });
  return new JSDOM(renderToStaticMarkup(value ? <CartSummaryProvider value={value}>{view}</CartSummaryProvider> : view)).window.document;
}
test("basket strip projects real count and subtotal with fixed checkout and basket destinations", () => {
  const doc = render(ready);
  expect(doc.body.textContent).toContain("3 items in your basket.");
  expect(doc.body.textContent).toContain("$86.00");
  expect(doc.querySelector('a[href="/checkout"]')?.textContent).toContain("Continue to checkout");
  expect(doc.querySelector('a[href="/cart"]')?.textContent).toContain("View basket");
  expect(doc.querySelector('dt')?.textContent).toBe("Subtotal");
  expect(doc.body.textContent).toContain("Shipping and taxes calculated at checkout.");
});
test("empty, loading and unavailable states never display a fictional amount or checkout action", () => {
  for (const state of ["empty", "loading", "unavailable"] as const) {
    const doc = render({state}, { emptyText: "Make room for something useful." });
    expect(doc.querySelector('dl')).toBeNull();
    expect(doc.querySelector('a[href="/checkout"]')).toBeNull();
    expect(doc.body.textContent).not.toContain("$0.00");
    if (state === "empty") {
      expect(doc.body.textContent).toContain("Make room for something useful.");
      expect(doc.querySelector('a[href="/products"]')).not.toBeNull();
    }
  }
  expect(render().querySelector('dl')).toBeNull();
});
test("pending payment exposes the basket link without offering a competing checkout", () => {
  const doc=render({...ready,state:"payment-pending"});
  expect(doc.body.textContent).toContain("Payment is in progress");
  expect(doc.querySelector('a[href="/checkout"]')).toBeNull();
  expect(doc.querySelector('a[href="/cart"]')).not.toBeNull();
});
test("authored copy is preserved and escaped, and a free cart is still a valid checkout", () => {
  const title='<script>basket</script>', emptyText='Your list & your pace.\nTake your time.';
  const empty=render({state:"empty"},{title,emptyText});
  expect(empty.querySelector('script')).toBeNull();
  expect(empty.body.textContent).toContain(title);
  expect(empty.body.textContent).toContain(emptyText);
  const free=render({...ready,itemCount:1,subtotalAmount:0});
  expect(free.body.textContent).toContain("1 item in your basket.");
  expect(free.body.textContent).toContain("$0.00");
  expect(free.querySelector('a[href="/checkout"]')).not.toBeNull();
});
test("stale cart values disappear before session settlement and never survive disabled Commerce", () => {
  const input={enabled:true,isReady:true,loading:false,paymentPending:false,cart:{itemCount:3,subtotalAmount:8600,currencyCode:"USD"}};
  expect(cartSummaryState(input)).toEqual(ready);
  for(const patch of [{isReady:false},{loading:true}]) {
    const state=cartSummaryState({...input,...patch});
    expect(state).toEqual({state:"loading"});
    expect(render(state).body.textContent).not.toContain("$86.00");
  }
  expect(cartSummaryState({...input,enabled:false})).toEqual({state:"unavailable"});
  expect(cartSummaryState({...input,cart:null})).toEqual({state:"empty"});
  expect(cartSummaryState({...input,paymentPending:true})).toEqual({...ready,state:"payment-pending"});
});
test("invalid amounts, counts and currency are refused before they reach display formatting", () => {
  const input={enabled:true,isReady:true,loading:false,paymentPending:false};
  for(const patch of [{itemCount:-1},{itemCount:NaN},{subtotalAmount:Infinity},{subtotalAmount:-1},{subtotalAmount:1.5},{currencyCode:"<script>"}]) {
    expect(cartSummaryState({...input,cart:{itemCount:1,subtotalAmount:100,currencyCode:"USD",...patch}})).toEqual({state:"unavailable"});
  }
});
test("block requires the Commerce plugin and authenticated cart-host capability", () => {
  const tree=[{id:"cart",name:"commerce/cart-cta",version:1,attrs:{}}];
  for(const invalid of [{...policy,enabledPlugins:[]},{...policy,capabilities:[]}])
    expect(()=>prepareBlocks(tree,{"commerce/cart-cta":cartCTA},invalid,{media:{}})).toThrow();
});
