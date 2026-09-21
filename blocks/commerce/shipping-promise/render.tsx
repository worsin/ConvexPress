import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

export default defineDataBlock("commerce/shipping-promise", "commerce.shippingPolicy", ({ data }) => {
  if (data.items.length === 0) return null;
  return <ul className="cp-shipping-promises" aria-label="Store policies">
    {data.items.map((item, index) => <li key={index}>
      <span className="cp-shipping-promise-symbol" aria-hidden="true"><P.Icon name={item.icon} size="lg" /></span>
      <div><P.Heading level={3} size="sm">{item.title}</P.Heading>{item.body && <p>{item.body}</p>}{item.href && <P.Link href={item.href} label={`Read ${item.title.toLowerCase()}`} />}</div>
    </li>)}
  </ul>;
});
