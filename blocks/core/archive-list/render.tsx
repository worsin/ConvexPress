import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { useBlockPageHref } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import {ArchiveLinks} from "../../../ConvexPress-Website/apps/web/src/components/blog/ArchiveLinks";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineDataBlock("core/archive-list","content.archive",({data,blockId})=>{
 const href=useBlockPageHref(blockId),first=data.cursor?href(null):null,next=data.nextCursor?href(data.nextCursor):null;
 return <section className="cp-archive" aria-label="Browse the archive">
  <header className="cp-archive-header"><P.Eyebrow>From the archive</P.Eyebrow><P.Heading level={2} size="lg">Worth returning to.</P.Heading><P.Text tone="muted">Find a moment. Follow a story.</P.Text></header>
  {data.items.length?<ArchiveLinks items={data.items}/>:<P.Text tone="muted">{data.nextCursor?"Continue browsing to find earlier stories.":"The archive is waiting for its first story."}</P.Text>}
  {(first||next)&&<nav className="cp-archive-pagination" aria-label="Archive list pagination">{first&&<P.Link href={first} label="Back to newest"/>}{next&&<P.Link href={next} label="Earlier dates →"/>}</nav>}
 </section>;
});
