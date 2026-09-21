import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { productOptionHref } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/productOptionsContracts";
import "./render.css";

export default defineDataBlock("commerce/variant-picker-teaser", "commerce.productOptions", ({data}) => {
 const product=data.product;
 if(!product)return <div className="cp-option-teaser-empty" data-options-state="empty"><P.Eyebrow>From the collection</P.Eyebrow><P.Heading>Find your next favorite.</P.Heading><P.Text tone="muted">This product is not available right now.</P.Text><P.Link href="/products" label="Explore the shop"/></div>;
 return <article className="cp-option-teaser" data-options-state={data.groups.length?"ready":"no-options"}>
  <a href={product.href} className="cp-option-teaser-image" aria-label={`View ${product.title}`}>
   {product.image?<img src={product.image.src} alt={product.image.alt} loading="lazy" decoding="async"/>:<span aria-hidden="true" className="cp-option-teaser-initial">{Array.from(product.title.trim())[0]||"✳"}</span>}
   <span className="cp-option-teaser-image-caption" aria-hidden="true">A closer look <span>↗</span></span>
  </a>
  <div className="cp-option-teaser-content">
   <P.Eyebrow>Make it yours</P.Eyebrow><P.Heading>{product.title}</P.Heading>
   {data.groups.length?<><P.Text tone="muted">Choose a detail. Find your fit.</P.Text>
    {data.groups.map(group=><div className="cp-option-teaser-group" key={group.id}>
     <div className="cp-option-teaser-label"><span>{group.name}</span><span>{group.values.length} {group.values.length===1?"option":"options"}</span></div>
     <ul className="cp-option-teaser-choices" aria-label={`${group.name} options for ${product.title}`}>
      {group.values.map(value=><li key={value.id}><a href={productOptionHref(product.href,group.id,value.id)} aria-label={`View ${product.title} in ${group.name}: ${value.label}`}><span>{value.label}</span><span aria-hidden="true">↗</span></a></li>)}
     </ul>
    </div>)}
   </>:<P.Text tone="muted">See the product page for details and availability.</P.Text>}
   <a className="cp-option-teaser-details" href={product.href}>View product <span aria-hidden="true">↗</span></a>
  </div>
 </article>;
});
