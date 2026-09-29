import type { CanonicalBlockInstance } from './generated/types';
import type { DataEntry } from './contracts';
import type { RenderResources } from './renderResources';
import { authoredBlockSearchText, proseText } from './searchText';
import { announcementWindow, countdownExpired, authoredCollectionCards, supportedMediaType, type MediaKind } from './libraryPresentation';

/** Only these authored alternatives need current data. Never resolve a search
 * block in order to construct its own corpus. The public resolver remains the
 * authority for visitor state and source availability. */
export function librarySearchNeedsData(name: string) {
 return ['core/account-teaser','core/form','core/table-of-contents','commerce/product-hero','commerce/bundle-offer','blocks/product-collection'].includes(name);
}
/** Re-evaluate even a currently hidden alternative when its first boundary arrives. */
export function librarySearchRecheckAt(node: CanonicalBlockInstance, now: number): number | undefined {
 const times = node.name==='core/announcement-bar'
  ? [node.attrs.schedule?.startsAt,node.attrs.schedule?.endsAt]
  : node.name==='core/countdown' ? [node.attrs.target] : [];
 const future=times.filter((value):value is string=>Boolean(value)).map(Date.parse).filter(time=>Number.isFinite(time)&&time>now);
 return future.length?Math.min(...future):undefined;
}
interface Context { now: number; resources: RenderResources; data?: DataEntry }
export function currentLibrarySearchText(node: CanonicalBlockInstance, context: Context): string {
 const entry=context.data;
 const asset=(id: string,kind: MediaKind)=>{
  const value=Object.prototype.hasOwnProperty.call(context.resources.media,id)?context.resources.media[id]:undefined;
  if(!value || !supportedMediaType(kind,value.mimeType))throw Error('Selected search media cannot render');
 };
 return authoredBlockSearchText(node.name,node.attrs,attrs=>{
  const block={...node,attrs} as CanonicalBlockInstance;
  switch(block.name){
   case 'core/announcement-bar': {
    const a=block.attrs,starts=a.schedule?.startsAt?Date.parse(a.schedule.startsAt):null,ends=a.schedule?.endsAt?Date.parse(a.schedule.endsAt):null;
    if(starts!==null&&ends!==null&&starts>=ends)throw Error('Invalid announcement schedule');
    return announcementWindow(starts,ends,context.now)?a:{};
   }
   case 'core/countdown': return {...block.attrs,expiredText:block.attrs.target&&countdownExpired(Date.parse(block.attrs.target),context.now)?block.attrs.expiredText:''};
   case 'core/account-teaser': {
    if(entry?.resolver!=='site.viewer')throw Error('Missing current viewer data');
    return entry.data.state==='signed-in'?{signedInText:block.attrs.signedInText}:{signedOutText:block.attrs.signedOutText};
   }
   case 'core/audio': case 'core/file-download': {
    if(!block.attrs.media)return {};
    asset(block.attrs.media.id,block.name==='core/audio'?'audio':'file');return block.attrs;
   }
   case 'core/before-after': {
    const a=block.attrs;if(!a.before&&!a.after)return {};
    if(!a.before||!a.after)throw Error('Incomplete comparison');
    asset(a.before.id,'image');asset(a.after.id,'image');return a;
   }
   case 'core/logo-cloud': return {...block.attrs,logos:block.attrs.logos.map(logo=>{if(logo.mediaId)asset(logo.mediaId,'image');return logo.mediaId?{...logo,name:''}:logo;})};
   case 'reference/field-guide': {
    const a=block.attrs;
    return {...a,body:a.showDetails?(block.treatment?a.body:proseText(a.body)):'',note:a.showDetails?a.note:null,items:a.showDetails?a.items.slice(0,a.count):[]};
   }
   case 'blocks/product-collection': {
    if(entry?.resolver!=='commerce.productCollection')throw Error('Missing current collection data');
    const a=block.attrs,visible=(cards:typeof a.products)=>cards.map(card=>({...card,price:a.showPrice?card.price:''}));
    // All group panels are reachable through the rendered tabs, like Accordion
    // and Tabs bodies. Omit groups absent from the actual public resolver result.
    return {...a,products:visible(authoredCollectionCards(a)),groups:entry.data.groups.map(group=>({...a.groups[group.index],products:visible(authoredCollectionCards(a,group.index))}))};
   }
   case 'core/form': {
    if(entry?.resolver!=='forms.form')throw Error('Missing current form data');return entry.data.form?block.attrs:{};
   }
   case 'core/table-of-contents': {
    if(entry?.resolver!=='content.headings')throw Error('Missing current heading data');return entry.data.items.some(item=>item.level<=block.attrs.depth)?block.attrs:{};
   }
   case 'commerce/product-hero': {
    if(entry?.resolver!=='commerce.productCollection')throw Error('Missing current product data');return entry.data.items.length?block.attrs:{};
   }
   case 'commerce/bundle-offer': {
    if(entry?.resolver!=='commerce.bundle')throw Error('Missing current bundle data');return entry.data.bundle?block.attrs:{};
   }
   default:return block.attrs;
  }
 });
}
