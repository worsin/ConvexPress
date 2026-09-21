import type {DateArchiveResult} from "@/lib/blog/date-archive";
import {dateArchiveHref} from "@/lib/blog/date-archive";
import {archiveLabel} from "@/templates/sdk/block-data/portable/archiveContracts";
import * as P from "@/templates/sdk/primitives";
import {canonicalPreviewPackParts} from "@/templates/sdk/block-preview/pack-parts";
import {ArchiveLinks} from "./ArchiveLinks";
import "../../../../../../blocks/core/archive-list/render.css";
import "../../../../../../blocks/core/related-content/render.css";
export interface BlogArchiveSurfaceData{archive:NonNullable<DateArchiveResult>}
export function DateArchiveSurface({data,packId}:{data:BlogArchiveSurfaceData;packId:string}){
 const value=data.archive,title=value.year===null?"From the archive":archiveLabel(value.year,value.month);
 return <P.PrimitiveProvider packId={packId} registry={canonicalPreviewPackParts}><section className="cp-archive" data-slot="archive-page">
  <header className="cp-archive-header"><P.Eyebrow>{value.year===null?"The collected stories":"A moment in time"}</P.Eyebrow><P.Heading level={1} size="display">{title}</P.Heading>
   <P.Text tone="muted">{value.year===null?"A place for every story. Browse by month, then see where it takes you.":`Stories published in ${title}.`}</P.Text>
   {value.year!==null&&<P.Link href="/archive" label="← Browse all dates"/>}
  </header>
  {value.groups.length>0&&<ArchiveLinks items={value.groups}/>}
  {value.items.length>0&&<div className="cp-related-grid">{value.items.map(post=><article className="cp-related-card" key={post.id}>
   {post.image&&<div className="cp-related-image"><P.Image media={post.image} aspect="4/3"/></div>}
   <div className="cp-related-copy"><P.Stack gap="md"><P.Heading level={2} size="md"><P.Link href={post.href} label={post.title}/></P.Heading>{post.excerpt&&<P.Text tone="muted">{post.excerpt}</P.Text>}</P.Stack><span className="cp-related-arrow" aria-hidden="true">↗</span></div>
  </article>)}</div>}
  {(value.resetRequired||!value.groups.length&&!value.items.length)&&<p role="status">{value.resetRequired?"The archive has changed. Return to the first results.":value.nextCursor?"Continue browsing to find more stories.":"No stories are available for this selection."}</p>}
  {(value.cursor||value.nextCursor)&&<nav className="cp-archive-pagination" aria-label="Date archive pagination">
   {value.cursor&&<P.Link href={dateArchiveHref(value.year,value.month)} label="Back to first results"/>}
   {value.nextCursor&&<P.Link href={dateArchiveHref(value.year,value.month,value.nextCursor)} label="Continue browsing →"/>}
  </nav>}
 </section></P.PrimitiveProvider>;
}
