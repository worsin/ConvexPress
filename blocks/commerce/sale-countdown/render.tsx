import { useEffect, useMemo, useState } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { remainingTime } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/countdown";
import { resolvePrice } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/commercePricing";
import { usePriceTime } from "../../../ConvexPress-Website/apps/web/src/components/shop/product/usePriceTime";
import { ProductCard } from "../../blocks/product-collection/render";
import "./render.css";

/** Only this small clock ticks. Product cards wake at price/deadline boundaries. */
function Deadline({ target }: { target: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer !== undefined) clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      if (current < target && document.visibilityState !== "hidden")
        timer = setTimeout(refresh, Math.min(1000, target - current));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [target]);
  const left = now === null ? null : remainingTime(target, now);
  const date = new Date(target).toISOString();
  return <div className="cp-sale-deadline">
    <p className="cp-sale-date">Campaign ends <time dateTime={date}>{date.replace("T", " ").replace(/\.000Z$/, " UTC")}</time></p>
    {left && !left.expired && <dl className="cp-sale-clock" data-long-days={left.days >= 1000 ? "true" : undefined} aria-label="Time remaining">
      {([["Days", left.days], ["Hours", left.hours], ["Minutes", left.minutes], ["Seconds", left.seconds]] as const).map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{String(value).padStart(2, "0")}</dd></div>)}
    </dl>}
  </div>;
}

export default defineDataBlock("commerce/sale-countdown", "commerce.productCollection", ({ attrs, data }) => {
  const target = attrs.target ? Date.parse(attrs.target) : undefined;
  const prices = useMemo(() => data.items.flatMap(item => item.pricing ? [{
    price: item.pricing.price, salePrice: item.pricing.salePrice,
    salePriceFrom: item.pricing.salePriceFrom ?? undefined, salePriceTo: item.pricing.salePriceTo ?? undefined,
  }] : []), [data.items]);
  // Use the server's pricing instant for hydration; never invent a sale from an
  // authored title/deadline. The settled browser clock removes expired cards.
  const now = usePriceTime(prices, data.items.find(item => item.pricing)?.pricing?.pricedAt ?? 0, target);
  const ended = target !== undefined && now >= target;
  const products = ended ? [] : data.items.filter(item => {
    const p = item.pricing;
    if (!p) return false;
    const price = resolvePrice(p.price, p.salePrice, {
      salePriceFrom: p.salePriceFrom ?? undefined, salePriceTo: p.salePriceTo ?? undefined,
    }, now);
    return price.saleActive && price.amount < p.price.amount;
  });
  return <div className="cp-sale-countdown cp-product-collection" data-columns="3" data-sale-state={ended ? "ended" : products.length ? "active" : "empty"}>
    <div className="cp-sale-header">
      <div className="cp-sale-intro"><P.Eyebrow>Selected offers</P.Eyebrow>{attrs.title && <P.Heading>{attrs.title}</P.Heading>}</div>
      {!ended && products.length > 0 && target !== undefined && <Deadline target={target} />}
    </div>
    <div role="status" aria-live="polite" aria-atomic="true" className="cp-sale-status">
      {ended ? <><P.Heading level={3} size="md">This campaign has ended.</P.Heading><P.Text tone="muted">There is always more to discover in the shop.</P.Text></> : !products.length && <><P.Heading level={3} size="md">No offers right now.</P.Heading><P.Text tone="muted">Explore the collection at your own pace.</P.Text></>}
    </div>
    {products.length > 0 && <div className="cp-collection-grid">{products.map(product => <ProductCard key={product.id} product={product} showPrice showSaleBadge showAddToCart={false} />)}</div>}
    <div className="cp-sale-footer"><P.Link href="/products" label="Explore the shop" /><P.Text size="sm" tone="muted">Current prices and availability are shown on each product.</P.Text></div>
  </div>;
});
