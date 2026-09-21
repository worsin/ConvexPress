import { useEffect, useRef } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { useBlockPageHref } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import { observeSectionReveal } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives/reveal";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

function Stars({rating}:{rating:number}) {
  return <span className="cp-review-stars" role="img" aria-label={`${rating} out of 5 stars`}>
    {[1,2,3,4,5].map(star=><svg key={star} viewBox="0 0 24 24" aria-hidden="true" className={star<=rating?"is-filled":""}><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z"/></svg>)}
  </span>;
}
const month=new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric",timeZone:"UTC"});
export default defineDataBlock("core/reviews","commerce.reviews",({attrs,data,blockId})=>{
  const root=useRef<HTMLDivElement>(null),pageHref=useBlockPageHref(blockId);
  useEffect(()=>root.current?observeSectionReveal(root.current):undefined,[]);
  const next=data.nextCursor?pageHref(data.nextCursor):null,first=data.cursor?pageHref(null):null;
  const summary=data.summary,heading=data.product?`Reviews of ${data.product.title}`:"Customer reviews";
  return <div className="cp-reviews" ref={root}>
    <header className="cp-reviews-header"><P.Stack gap="sm"><P.Text size="sm" tone="muted">Shared experiences</P.Text><P.Heading level={2} size="lg">{heading}</P.Heading></P.Stack>
      {data.product && <P.Link href={data.product.href} label="View product →"/>}
    </header>
    {data.availability==="unavailable"?<P.Text tone="muted">{attrs.source==="product" && !attrs.product?"Choose a product to display its reviews.":"Reviews are unavailable right now."}</P.Text>:
    <div className="cp-reviews-layout">
      <aside className="cp-reviews-summary" aria-label="Rating summary">
        {summary && summary.count>0?<>
          <p className="cp-reviews-average"><span>{summary.average.toFixed(1)}</span><span>out of 5</span></p>
          <P.Text>{summary.scope==="product"?`${summary.count} approved ${summary.count===1?"product review":"product reviews"}`:`${summary.count} ${summary.count===1?"review":"reviews"} on this page`}</P.Text>
          <ol className="cp-reviews-distribution" aria-label="Rating distribution">
            {[5,4,3,2,1].map(star=><li key={star}><span>{star} star</span><span className="cp-reviews-track" aria-hidden="true"><span style={{transform:`scaleX(${summary.distribution[star-1]!/summary.count})`}}/></span><span>{summary.distribution[star-1]}</span></li>)}
          </ol>
          <P.Text size="sm" tone="muted">{summary.scope==="product"?"Rating includes all approved reviews for this product.":"Rating is based on the reviews displayed here."}</P.Text>
        </>:<P.Text tone="muted">{summary===null?"The rating summary is updating.":"No ratings on this page yet."}</P.Text>}
        {attrs.minRating>1 && <p className="cp-reviews-filter">Showing {attrs.minRating} stars {attrs.minRating<5?"and up":"only"}</p>}
      </aside>
      <div className="cp-reviews-main">
        {data.items.length?<div className="cp-reviews-grid">{data.items.map(item=><article className="cp-review-card" key={item.id}>
          <div className="cp-review-card-top"><Stars rating={item.rating}/><time dateTime={new Date(item.createdAt).toISOString()}>{month.format(item.createdAt)}</time></div>
          <div className="cp-review-words">{item.title && <P.Heading level={3} size="sm">{item.title}</P.Heading>}
            {item.body && <p>{item.body}{item.bodyTruncated?"…":""}</p>}
            {item.bodyTruncated && <span className="cp-review-excerpt">Review excerpt</span>}
          </div>
          <footer className="cp-review-author"><span className="cp-review-initial" aria-hidden="true">{Array.from(item.author)[0]?.toLocaleUpperCase("en-US")}</span><div><P.Text size="sm">{item.author}</P.Text>{item.verifiedPurchase && <span className="cp-review-verified"><span aria-hidden="true">✓</span> Verified purchase</span>}</div></footer>
          {data.source==="site" && <div className="cp-review-product"><P.Link href={item.product.href} label={`${item.product.title} →`}/></div>}
        </article>)}</div>:<P.Text tone="muted">{data.nextCursor?"No matching reviews on this page. Continue to see more.":attrs.minRating>1?"No reviews match this rating filter yet.":"No reviews to share yet."}</P.Text>}
        {(first||next) && <nav className="cp-reviews-pagination" aria-label="Review pagination">{first && <P.Link href={first} label="Back to first reviews"/>}{next && <P.Link href={next} label="More reviews →"/>}</nav>}
      </div>
    </div>}
  </div>;
});
