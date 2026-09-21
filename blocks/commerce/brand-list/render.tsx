import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

export default defineDataBlock("commerce/brand-list","commerce.brands",({data})=>{
  if(!data.items.length)return null;
  return <ul className="cp-brand-list" aria-label="Shop by brand">{data.items.map(brand=><li key={brand.id}>
    <a className="cp-brand-link" href={brand.href} aria-label={`Shop ${brand.name}`}>
      <span className="cp-brand-mark">{brand.logo?<img src={brand.logo.src} alt="" loading="lazy" decoding="async"/>:<span className="cp-brand-wordmark" aria-hidden="true">{brand.name}</span>}</span>
      <span className="cp-brand-caption"><P.Text size="sm">{brand.name}</P.Text><span className="cp-brand-arrow" aria-hidden="true">↗</span></span>
    </a>
  </li>)}</ul>;
});
