import type { ReactNode } from "react";
import type { FieldGuideAttrs } from "./schema";
const ink = {foreground:'text-foreground',primary:'text-primary',muted:'text-muted-foreground'};
const alignment = {left:'text-left',center:'text-center',right:'text-right'};
const gap = ['gap-0','gap-1','gap-2','gap-3','gap-4','gap-5','gap-6','gap-7','gap-8'];
export function FieldGuideView({attrs,image}:{attrs:FieldGuideAttrs;image?:ReactNode}) {
 return <section className={`grid ${gap[attrs.spacing]} ${alignment[attrs.alignment]} ${ink[attrs.ink]}`}>
  {attrs.heading && <h2 className={`text-3xl ${attrs.font==='display'?'font-display':'font-sans'}`}>{attrs.heading}</h2>}{image}
  {attrs.showDetails && <><p className="whitespace-pre-line leading-7">{attrs.body}</p><dl className="divide-y divide-border">{attrs.items.slice(0,attrs.count).map((item,index)=><div key={index} className="flex justify-between gap-5 py-3"><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>{attrs.note!==null && <p className="text-sm text-muted-foreground">{attrs.note}</p>}</>}
  {attrs.link.label && attrs.link.href && <a href={attrs.link.href} target={attrs.link.newTab?'_blank':undefined} rel={attrs.link.newTab?'noopener noreferrer':undefined} className="underline underline-offset-4">{attrs.link.label}</a>}
 </section>;
}
