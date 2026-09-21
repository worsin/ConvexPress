import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { useCartSummary } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/cart-summary";
import { formatMoney } from "../../../ConvexPress-Website/apps/web/src/lib/commerce/format";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

export default defineBlock("commerce/cart-cta", ({ attrs }) => {
  const cart = useCartSummary();
  const populated = cart.state === "ready" || cart.state === "payment-pending";
  return <div className="cp-cart-cta-layout"><div className="cp-cart-cta" data-cart-state={cart.state}>
    <div className="cp-cart-cta-intro">
      <P.Eyebrow>Your selection</P.Eyebrow>
      {attrs.title && <P.Heading>{attrs.title}</P.Heading>}
      <div className="cp-cart-cta-status" role="status" aria-live="polite" aria-atomic="true">
        {cart.state === "loading" ? "Loading your basket…" : cart.state === "empty" ? attrs.emptyText :
          cart.state === "unavailable" ? "View your basket to continue shopping." :
          cart.state === "payment-pending" ? "Payment is in progress. View your basket for the latest status." :
          populated ? `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"} in your basket.` : ""}
      </div>
    </div>
    {populated && <div className="cp-cart-cta-total">
      <P.Stat label="Subtotal" value={formatMoney(cart.subtotalAmount, cart.currencyCode)}
        detail="Shipping and taxes calculated at checkout." />
    </div>}
    <div className="cp-cart-cta-actions">
      {cart.state === "ready" ? <>
        <P.Button label="Continue to checkout" href="/checkout" />
        <P.Link label="View basket" href="/cart" />
      </> : cart.state === "empty" ? <P.Button label="Explore the shop" href="/products" /> :
        <P.Link label="View basket" href="/cart" />}
    </div>
  </div></div>;
});
