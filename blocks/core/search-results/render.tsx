import {useId} from "react";
import {defineDataBlock} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import {useBlockPageHref,useBlockSearchForm} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import "./render.css";
const labels={post:"Story",page:"Page",product:"Product",course:"Course",event:"Event"};
function SearchIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>;}
export default defineDataBlock("core/search-results","content.search",({attrs,data,blockId})=>{
 const id=useId(),form=useBlockSearchForm(),pageHref=useBlockPageHref(blockId),next=data.nextCursor?pageHref(data.nextCursor):null,first=data.cursor?pageHref(null):null;
 return <section className="cp-search-results" aria-label="Site search" data-search-state={data.state}>
  <header className="cp-search-heading"><span className="cp-search-eyebrow">Explore the site</span><h2>{data.query?<>Results for <span>“{data.query}”</span></>:"What are you looking for?"}</h2></header>
  <form className="cp-search-form" method="get" action={form?.action} role="search" aria-label="Search this page’s content collection">
   <label className="cp-search-label" htmlFor={id}>Search this site</label>
   {form?.hidden.map(([name,value],index)=><input key={`${name}-${index}`} type="hidden" name={name} value={value}/>)}
   <div className="cp-search-input"><SearchIcon/><input id={id} key={data.query} type="search" name="q" defaultValue={data.query} maxLength={500} placeholder="A topic, a product, a new idea…" disabled={!form}/><button type="submit" disabled={!form}>Search <span aria-hidden="true">↗</span></button></div>
  </form>
  {data.items.length>0?<><p className="cp-search-count" role="status">{data.items.length} {data.items.length===1?"result":"results"} on this page{data.nextCursor?" · More to explore":""}</p><ol className="cp-search-list">
   {data.items.map(item=><li key={`${item.kind}:${item.id}`} className="cp-search-item"><article>
    <div className="cp-search-meta"><span className="cp-search-kind">{labels[item.kind]}</span>{item.author&&<span>{item.author}</span>}</div>
    <h3><a href={item.href}>{item.title||"Untitled"}<span className="cp-search-arrow" aria-hidden="true">↗</span></a></h3>
    {item.excerpt&&<p className="cp-search-excerpt">{item.excerpt}</p>}
    <span className="cp-search-path" aria-hidden="true">{item.href}</span>
   </article></li>)}
  </ol></>:<div className="cp-search-empty" role="status"><span className="cp-search-empty-icon"><SearchIcon/></span><h3>{data.state==="idle"?"Start with a little curiosity.":data.nextCursor?"Keep exploring.":data.cursor?"You’ve reached the end.":"No matches this time."}</h3><p>{data.state==="idle"?"Search stories, pages, products, courses and events from one place.":data.nextCursor?"There are more matches to check. Continue to the next page.":data.cursor?"Try another term to discover something different.":attrs.emptyMessage}</p></div>}
  {(first||next)&&<nav className="cp-search-pagination" aria-label="Search results pagination">{first?<a href={first}>← First results</a>:<span/>}{next&&<a href={next}>Next results <span aria-hidden="true">→</span></a>}</nav>}
 </section>;
});
