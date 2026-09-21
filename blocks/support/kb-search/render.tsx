import { useId } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/utilities.css";
import "./render.css";
export default defineDataBlock("support/kb-search", "support.search", ({ attrs, data }) => {
 const id=useId();
 return <section className="cp-kb-search" aria-label="Knowledge base search">
  <div className="cp-kb-search-intro"><P.Eyebrow>The help library</P.Eyebrow><P.Heading level={2} size="lg">A good place to find an answer.</P.Heading></div>
  {data.available ? <>
   <form className="cp-library-search-form cp-kb-search-form" role="search" aria-label="Search help articles" method="get" action="/help/search">
    <label htmlFor={id}>{data.category ? `Search ${data.category.name}` : "Search help articles"}</label>
    <div><input id={id} name="q" type="search" placeholder={attrs.placeholder} maxLength={500} required />
     {data.category&&<input type="hidden" name="category" value={data.category.slug}/>}
     <button className="cp-library-utility-control" type="submit">Find an answer <span aria-hidden="true">↗</span></button>
    </div>
   </form>
   {data.articles.length>0&&<div className="cp-kb-reading"><P.Eyebrow>Helpful places to start</P.Eyebrow><ol>{data.articles.map((article,index)=><li key={article.id}>
    <span className="cp-kb-reading-number" aria-hidden="true">{String(index+1).padStart(2,"0")}</span><div><P.Link href={article.href} label={article.title}/>{article.excerpt&&<P.Text size="sm" tone="muted">{article.excerpt}</P.Text>}</div><span className="cp-kb-reading-arrow" aria-hidden="true">↗</span>
   </li>)}</ol></div>}
  </> : <P.Text tone="muted">Help search is not available here right now.</P.Text>}
 </section>;
});
