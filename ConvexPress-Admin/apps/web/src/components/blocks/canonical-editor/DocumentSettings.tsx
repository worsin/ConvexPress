import {useEffect,useRef,useState} from 'react';
import {useConvex,usePaginatedQuery} from 'convex/react';
import {api} from '@backend/convex/_generated/api';
import type {Id} from '@backend/convex/_generated/dataModel';
import type {FunctionReturnType} from 'convex/server';
type DocumentMetadata=FunctionReturnType<typeof api.canonicalDocuments.getMetadata>;
import {useCan} from '@/hooks/useCan';
import {Button} from '@/components/ui/button';
import {MediaPicker} from '@/components/media/MediaPicker';

type Term=DocumentMetadata['terms'][number];
export function DocumentSettings({postId,onClose,onDirtyChange}:{postId:Id<'posts'>;onClose:()=>void;onDirtyChange:(dirty:boolean)=>void}){
 const convex=useConvex();const alive=useRef(true);const [base,setBase]=useState<DocumentMetadata|null>(null);const [error,setError]=useState('');
 useEffect(()=>{alive.current=true;void convex.query(api.canonicalDocuments.getMetadata,{postId}).then(value=>{if(alive.current)setBase(value);},()=>{if(alive.current)setError('Document settings could not be opened. Close and try again after checking your connection and permissions.');});return()=>{alive.current=false;};},[convex,postId]);
 return <section aria-label="Document settings" className="mx-auto max-w-3xl border border-border bg-card p-5 space-y-4">
  <h2 className="text-lg font-semibold">Document settings</h2>
  {error?<><p role="alert">{error}</p><Button onClick={onClose}>Close settings</Button></>:base?<SettingsForm base={base} onClose={onClose} onDirtyChange={onDirtyChange}/>:<p role="status">Opening document settings…</p>}
 </section>;
}
function SettingsForm({base,onClose,onDirtyChange}:{base:DocumentMetadata;onClose:()=>void;onDirtyChange:(dirty:boolean)=>void}){
 const convex=useConvex(),can=useCan();
 const [excerpt,setExcerpt]=useState(base.excerpt),[image,setImage]=useState(base.featuredImageId),[comments,setComments]=useState(base.commentStatus),[terms,setTerms]=useState(base.terms);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const alive=useRef(true),busy=useRef(false);
 const termKey=(values:Term[])=>values.map(t=>t.id).sort().join('|');
 const termsChanged=termKey(terms)!==termKey(base.terms);
 const dirty=excerpt!==base.excerpt || image!==base.featuredImageId || comments!==base.commentStatus || termsChanged;
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onDirtyChange(false);};},[onDirtyChange]);
 const save=async()=>{
  if(busy.current || uncertain || !dirty)return;busy.current=true;setSaving(true);setError('');
  try{
   await convex.mutation(api.canonicalDocuments.updateMetadata,{postId:base.postId,expectedRevision:base.revision,expectedSettingsDigest:base.settingsDigest,
    ...(excerpt!==base.excerpt?{excerpt}:{}),...(image!==base.featuredImageId?{featuredImageId:image}:{}),
    ...(comments!==base.commentStatus?{commentStatus:comments}:{}),...(termsChanged?{termIds:terms.map(t=>t.id)}:{})});
   if(alive.current){onDirtyChange(false);onClose();}
  }catch(e){if(alive.current){const code=(e as {data?:{code?:string;message?:string}})?.data?.code;
   setUncertain(!code);setError(code==='CONFLICT'?'This document changed while settings were open. Your edits are kept here. Copy any changes you need, then close and reopen settings to review the current document.':code?(e as {data:{message?:string}}).data.message??'The update was refused. Review your settings and permissions.':'The save acknowledgement was not received. Close and reopen settings to verify the saved values before trying again.');
  }}finally{busy.current=false;if(alive.current)setSaving(false);}
 };
 const toggle=(term:Term)=>setTerms(current=>current.some(t=>t.id===term.id)?current.filter(t=>t.id!==term.id):[...current,term]);
 return <>
  <p className="text-sm text-muted-foreground">Edit the summary, cover image and discussion settings for this {base.type}.</p>
  <fieldset disabled={saving || uncertain} className="space-y-5">
   <div><label htmlFor="document-excerpt" className="block text-sm font-medium mb-2">Excerpt</label><textarea id="document-excerpt" value={excerpt} maxLength={1000} onChange={e=>setExcerpt(e.target.value)} rows={4} className="w-full border border-input bg-background p-3"/><p className="text-xs text-muted-foreground">A short summary for listings. {excerpt.length}/1000 characters.</p></div>
   <div><h3 className="text-sm font-medium mb-2">Featured image</h3>{can('media.read')?<MediaPicker label="Choose featured image" allowedTypes={['image']} selectedId={image??undefined} onSelect={setImage} onClear={()=>setImage(null)}/>:<p className="text-sm">Media library access is required to choose an image.</p>}{image&&<Button type="button" variant="outline" onClick={()=>setImage(null)}>Remove featured image</Button>}</div>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={comments==='open'} onChange={e=>setComments(e.target.checked?'open':'closed')}/>Allow comments</label>
   {base.type==='post'&&<>
    <div className="space-y-2"><h3 className="text-sm font-medium">Selected categories and tags</h3>{terms.length===0?<p className="text-sm text-muted-foreground">No categories or tags selected.</p>:terms.map(term=><label key={term.id} className="flex gap-2 text-sm"><input type="checkbox" checked onChange={()=>toggle(term)} disabled={!can('taxonomy.unassign')}/>{term.taxonomy==='category'?'Category':'Tag'}: {term.name}</label>)}</div>
    {can('taxonomy.assign')?<div className="grid gap-4 sm:grid-cols-2"><TermChoices postId={base.postId} taxonomy="category" selected={terms} onToggle={toggle} canRemove={can('taxonomy.unassign')}/><TermChoices postId={base.postId} taxonomy="tag" selected={terms} onToggle={toggle} canRemove={can('taxonomy.unassign')}/></div>:<p className="text-sm text-muted-foreground">Taxonomy assignment permission is required to add categories or tags.</p>}
   </>}
  </fieldset>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" disabled={saving} onClick={onClose}>{dirty?'Discard settings changes':'Close settings'}</Button><Button disabled={saving || !dirty || uncertain} onClick={()=>void save()}>{saving?'Saving settings…':'Save document settings'}</Button></div>
 </>;
}
function TermChoices({postId,taxonomy,selected,onToggle,canRemove}:{postId:Id<'posts'>;taxonomy:'category'|'tag';selected:Term[];onToggle:(term:Term)=>void;canRemove:boolean}){
 const {results,status,loadMore}=usePaginatedQuery(api.canonicalDocuments.termOptions,{postId,taxonomy},{initialNumItems:20});
 return <fieldset className="space-y-2"><legend className="text-sm font-medium">{taxonomy==='category'?'Categories':'Tags'}</legend>
 {results.map(term=>{const checked=selected.some(t=>t.id===term.id);return <label key={term.id} className="flex gap-2 text-sm"><input type="checkbox" checked={checked} disabled={checked&&!canRemove} onChange={()=>onToggle({id:term.id as Id<'terms'>,name:term.name,taxonomy:taxonomy==='tag'?'post_tag':'category'})}/>{term.name}</label>;})}
 {status==='LoadingFirstPage'||status==='LoadingMore'?<p role="status" className="text-sm">Loading choices…</p>:status==='CanLoadMore'?<Button variant="outline" type="button" onClick={()=>loadMore(20)}>More {taxonomy==='category'?'categories':'tags'}</Button>:results.length===0?<p className="text-sm text-muted-foreground">No {taxonomy==='category'?'categories':'tags'} yet. Create them in Posts, then reopen settings.</p>:null}
 </fieldset>;
}
