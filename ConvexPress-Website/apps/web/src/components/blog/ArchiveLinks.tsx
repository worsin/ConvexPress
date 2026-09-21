import {archiveLabel,type ArchiveResult} from "../../templates/sdk/block-data/portable/archiveContracts";
export function ArchiveLinks({items}:{items:ArchiveResult["items"]}){
 return <ol className="cp-archive-list">{items.map(item=><li key={`${item.year}-${item.month??"year"}`}>
  <a href={item.href}><span className="cp-archive-date">{item.month===null?<span className="cp-archive-year">{item.year}</span>:<><span className="cp-archive-month">{archiveLabel(item.year,item.month).replace(` ${item.year}`,"")}</span><span className="cp-archive-year">{item.year}</span></>}</span><span className="cp-archive-open" aria-hidden="true">↗</span><span className="cp-archive-sr"> — Browse {archiveLabel(item.year,item.month)}</span></a>
 </li>)}</ol>;
}
