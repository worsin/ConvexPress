import {useEffect,useRef,useState} from "react";
import {defineDataBlock} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import {useBlockPageHref} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import type {TaggedMediaResult} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/taggedMediaContracts";
import "./render.css";
const imageAttributes=({src,alt,width,height}:TaggedMediaResult["items"][number]["image"])=>({src,alt,width,height});
function Gallery({items}:{items:TaggedMediaResult["items"]}){
 const [active,setActive]=useState<number|null>(null),[failed,setFailed]=useState<Set<string>>(()=>new Set());
 const modal=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement|null>(null),selected=active===null?null:items[active];
 useEffect(()=>{const dialog=modal.current;if(active!==null&&dialog&&!dialog.open)dialog.showModal();},[active]);
 useEffect(()=>{if(active===null)return;const root=document.documentElement,previous=root.style.overflow;root.style.overflow="hidden";return()=>{root.style.overflow=previous;};},[active]);
 useEffect(()=>{const dialog=modal.current;return()=>dialog?.close();},[]);
 const close=()=>{modal.current?.close();setActive(null);trigger.current?.focus();};
 const move=(direction:number)=>setActive(value=>value===null?null:(value+direction+items.length)%items.length);
 const credit=(item:TaggedMediaResult["items"][number])=>item.creditUrl?<a href={item.creditUrl} target="_blank" rel="noopener noreferrer">{item.credit} <span aria-hidden="true">↗</span></a>:<span>{item.credit}</span>;
 return <>
  <div className="cp-ugc-grid">{items.map((item,index)=><figure className="cp-ugc-frame" key={item.id}>
   <button className="cp-ugc-photo" type="button" disabled={failed.has(item.id)} aria-haspopup="dialog" aria-label={`View photograph: ${item.image.alt}`} onClick={event=>{trigger.current=event.currentTarget;setActive(index);}}>
    {failed.has(item.id)?<span className="cp-ugc-image-error" role="status">This photograph could not be loaded.</span>:<img {...imageAttributes(item.image)} loading="lazy" decoding="async" onError={()=>setFailed(value=>new Set(value).add(item.id))}/>}
    {!failed.has(item.id)&&<span className="cp-ugc-expand" aria-hidden="true">↗</span>}
   </button>
   <figcaption><div className="cp-ugc-credit"><span className="cp-ugc-index" aria-hidden="true">{String(index+1).padStart(2,"0")}</span>{credit(item)}</div>{item.caption&&<p>{item.caption}</p>}</figcaption>
  </figure>)}</div>
  <dialog ref={modal} className="cp-ugc-dialog" aria-label="Community photograph" onClose={()=>{setActive(null);trigger.current?.focus();}} onKeyDown={event=>{
   if(event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.key==="ArrowRight"||event.key==="ArrowLeft"){event.preventDefault();move(event.key==="ArrowRight"?1:-1);}
   if(event.key==="Tab"){const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')],first=controls[0],last=controls.at(-1),focused=event.currentTarget.ownerDocument.activeElement;if(first&&last&&(event.shiftKey?focused===first:focused===last)){event.preventDefault();(event.shiftKey?last:first).focus();}}
  }}>
   <div className="cp-ugc-dialog-bar"><span>From the community</span><button type="button" autoFocus onClick={close} aria-label="Close photograph">Close <span aria-hidden="true">×</span></button></div>
   {selected&&<figure className="cp-ugc-selected"><img {...imageAttributes(selected.image)}/><figcaption>{credit(selected)}{selected.caption&&<p>{selected.caption}</p>}</figcaption></figure>}
   <div className="cp-ugc-dialog-bar"><button type="button" aria-label="Previous photograph" disabled={items.length<2} onClick={()=>move(-1)}>← Previous</button><span role="status">{active===null?"":`${active+1} / ${items.length}`}</span><button type="button" aria-label="Next photograph" disabled={items.length<2} onClick={()=>move(1)}>Next →</button></div>
  </dialog>
 </>;
}
export default defineDataBlock("core/ugc-grid","media.tagged",({data,blockId})=>{
 const href=useBlockPageHref(blockId),next=data.nextCursor?href(data.nextCursor):null,first=data.cursor?href(null):null;
 if(!data.tag)return <section className="cp-ugc" aria-label="Community images"><p className="cp-ugc-empty" role="status">Community photographs are not available here yet.</p></section>;
 return <section className="cp-ugc" aria-label={data.tag.name}>
  <header className="cp-ugc-header"><div><span className="cp-ugc-eyebrow">From the community</span><h2>{data.tag.name}</h2></div><p>Small moments.<br/>{" "}A shared point of view.</p></header>
  {data.items.length?<Gallery key={JSON.stringify([data.cursor,data.items])} items={data.items}/>:<p className="cp-ugc-empty" role="status">{data.nextCursor?"More community photographs are available to explore.":"The next moment is still to come."}</p>}
  {(first||next)&&<nav className="cp-ugc-pagination" aria-label="Community image pagination">{first?<a href={first}>← First photographs</a>:<span/>}{next&&<a href={next}>More moments <span aria-hidden="true">→</span></a>}</nav>}
 </section>;
});
