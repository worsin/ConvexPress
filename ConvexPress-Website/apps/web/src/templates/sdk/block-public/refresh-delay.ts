import type {PublicCanonicalDocument} from '../block-data/portable/publicDocumentContracts';
/** Time does not invalidate a Convex subscription. Refresh time-sensitive data
 * at its next boundary, with a bounded fallback for clock/network skew. */
export function publicDocumentRefreshDelay(value:PublicCanonicalDocument,now:number):number|null {
 if(!value||value.state!=='ready')return null;
 const deadlines:number[]=[];
 let timed=false;
 for(const entry of Object.values(value.data.dataByBlock)) {
  if((entry.resolver==='forms.form'||entry.resolver==='forms.contact')) { timed=true; if(entry.data.nextChangeAt!==null) deadlines.push(entry.data.nextChangeAt); }
  else if(entry.resolver==='events.list') { timed=true; deadlines.push(entry.data.endsAt+1); }
  else if(entry.resolver==='events.next') { timed=true; if(entry.data.event) deadlines.push(entry.data.event.startsAt+1); }
  else if(entry.resolver==='events.upcoming') { timed=true; deadlines.push(...entry.data.items.map(item=>item.startsAt+1)); }
 }
 if(!timed)return null;
 const next=Math.min(now+60_000,...deadlines.filter(deadline=>deadline>now));
 return Math.max(1000,Math.min(60_000,next-now));
}
