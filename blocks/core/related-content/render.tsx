import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { useBlockPageHref } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

export default defineDataBlock("core/related-content","content.related",({data,blockId})=>{
  const pageHref=useBlockPageHref(blockId);
  const next=data.nextCursor ? pageHref(data.nextCursor) : null, first=data.cursor ? pageHref(null) : null;
  return <div className="cp-related">
    <header className="cp-related-header"><P.Stack gap="sm">
      <P.Text size="sm" tone="muted">Keep exploring</P.Text>
      <P.Heading level={2} size="lg">{data.type==="post"?"Follow your curiosity":"More to explore"}</P.Heading>
    </P.Stack><P.Text tone="muted">{data.type==="post"?"More stories, connected by a common thread.":"Discover connected pages and nearby destinations."}</P.Text></header>
    {data.items.length ? <div className="cp-related-grid">{data.items.map((item,index)=><article className="cp-related-card" key={item.id}>
      {item.image && <div className="cp-related-image"><P.Image media={item.image} aspect="4/3"/></div>}
      <div className="cp-related-copy"><span className="cp-related-number" aria-hidden="true">{String(index+1).padStart(2,"0")}</span>
        <P.Stack gap="md"><P.Heading level={3} size="md"><P.Link href={item.href} label={item.title}/></P.Heading>
          {item.excerpt && <P.Text tone="muted">{item.excerpt}</P.Text>}
        </P.Stack><span className="cp-related-arrow" aria-hidden="true">↗</span>
      </div>
    </article>)}</div> : <P.Text tone="muted">{data.nextCursor?"No matches in this section. Continue exploring for more.":"No related content to show yet."}</P.Text>}
    {(first || next) && <nav className="cp-related-pagination" aria-label="Related content pagination">
      {first && <P.Link href={first} label="Back to first results"/>}
      {next && <P.Link href={next} label="Explore more →"/>}
    </nav>}
  </div>;
});
