import { Link } from "@tanstack/react-router";
export interface ArchiveContinuationData { firstHref:string|null;nextHref:string|null;message?:string;label?:string;firstLabel?:string;nextLabel?:string }
/** Templates choose placement. These links never invent totals or page numbers. */
export function ArchiveContinuation({data}:{data:ArchiveContinuationData}) {
  if(!data.message&&!data.firstHref&&!data.nextHref)return null;
  return <div className="flex flex-col gap-4 border-t border-border pt-6" data-slot="archive-continuation">
    {data.message && <p role="status" className="text-sm text-muted-foreground">{data.message}</p>}
    {(data.firstHref||data.nextHref)&&<nav aria-label={data.label??"Archive pagination"} className="flex flex-wrap items-center justify-between gap-4">
      {data.firstHref&&<Link to={data.firstHref} className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{data.firstLabel??"Back to newest"}</Link>}
      {data.nextHref&&<Link to={data.nextHref} className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{data.nextLabel??"Older stories →"}</Link>}
    </nav>}
  </div>;
}
