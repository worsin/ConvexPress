import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { ProductCard } from "../../blocks/product-collection/render";
import "./render.css";

/** History selection and authorization belong to the current request's host. */
export default defineDataBlock("commerce/recently-viewed", "commerce.productCollection", ({ attrs, data }) => (
  <div className="cp-recently-viewed cp-product-collection" data-columns="3" data-history-state={data.items.length ? "ready" : "empty"}>
    <div className="cp-history-header">
      <div><P.Eyebrow>A second look</P.Eyebrow>{attrs.title && <P.Heading>{attrs.title}</P.Heading>}</div>
      <P.Text size="sm" tone="muted">Pick up where your curiosity left off.</P.Text>
    </div>
    {data.items.length ? <ol className="cp-history-grid" aria-label="Recently viewed products, newest first">
      {data.items.map((product, index) => <li key={product.id}>
        <span className="cp-history-position" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <ProductCard product={product} showPrice showSaleBadge showAddToCart={false} />
      </li>)}
    </ol> : <div className="cp-history-empty">
      <span className="cp-history-mark" aria-hidden="true">↶</span>
      <div><P.Heading level={3} size="md">Your discoveries belong here.</P.Heading><P.Text tone="muted">Explore the shop. Available products you visit will appear here for another look.</P.Text></div>
    </div>}
    <div className="cp-history-footer"><P.Link href="/products" label="Keep exploring" /></div>
  </div>
));
