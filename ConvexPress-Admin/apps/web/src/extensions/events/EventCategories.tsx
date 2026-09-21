import {getErrorMessage} from "@/lib/utils";
import {useUnsavedChangesWarning} from "@/hooks/useUnsavedChangesWarning";
import {useState} from 'react';
import {useMutation,usePaginatedQuery,useQuery} from 'convex/react';
import {api} from '@backend/convex/_generated/api';
import type {Doc} from '@backend/convex/_generated/dataModel';
import {toast} from 'sonner';
import {PageHeader} from '@/components/shell/PageHeader';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
export function EventCategories(){
 const {results,status,loadMore}=usePaginatedQuery(api.extensions.events.categories.list,{}, {initialNumItems:25});
 const create=useMutation(api.extensions.events.categories.create),update=useMutation(api.extensions.events.categories.update),remove=useMutation(api.extensions.events.categories.remove);
 const [editing,setEditing]=useState<Doc<'extension_event_categories'>|null>(null),[name,setName]=useState(''),[slug,setSlug]=useState(''),[saving,setSaving]=useState(false),[deleting,setDeleting]=useState(false);
 const current=useQuery(api.extensions.events.categories.get,editing?{id:editing._id}:'skip');
 const dirty=name!==(editing?.name??'')||slug!==(editing?.slug??'');
 useUnsavedChangesWarning({isDirty:dirty,enabled:!saving});
 const conflict=!!editing&&current!==undefined&&current?.updatedAt!==editing.updatedAt&&!saving;
 const choose=(row:Doc<'extension_event_categories'>|null)=>{setEditing(row);setName(row?.name??'');setSlug(row?.slug??'');setDeleting(false);};
 const save=async()=>{setSaving(true);try{if(editing)await update({id:editing._id,expectedUpdatedAt:editing.updatedAt,name,slug});else await create({name,slug});toast.success(editing?'Category saved.':'Category created.');choose(null);}catch(error){toast.error(getErrorMessage(error, 'Could not save the category.'));}finally{setSaving(false);}};
 const destroy=async()=>{if(!editing)return;setSaving(true);try{await remove({id:editing._id,expectedUpdatedAt:editing.updatedAt});choose(null);toast.success('Category deleted.');}catch(error){toast.error(getErrorMessage(error, 'Could not delete the category.'));setDeleting(false);}finally{setSaving(false);}};
 return <div className="space-y-6"><PageHeader title="Event categories" meta={['Organize gatherings for your calendars and featured events.']} />
  <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
   <section aria-label="Event category list" className="overflow-hidden rounded-lg border">
    <div className="flex items-center justify-between gap-3 border-b bg-muted/40 p-4"><h2 className="font-medium">Categories</h2><Button variant="outline" size="sm" disabled={saving||dirty} onClick={()=>choose(null)}>New category</Button></div>
    <ul className="divide-y">{results.map(row=><li key={row._id}><button type="button" disabled={saving||dirty} onClick={()=>choose(row)} aria-pressed={editing?._id===row._id} className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="min-w-0"><span className="block break-words font-medium">{row.name}</span><span className="text-xs text-muted-foreground">{row.slug}</span></span><span className="text-xs text-muted-foreground">Edit</span></button></li>)}</ul>
    {status==='LoadingFirstPage'?<p role="status" className="p-6">Loading categories…</p>:!results.length&&<p className="p-6 text-sm text-muted-foreground">No categories yet. Start with a group such as workshops, dinners, or open studios.</p>}
    {(status==='CanLoadMore'||status==='LoadingMore')&&<div className="border-t p-4"><Button variant="outline" disabled={status==='LoadingMore'||saving} onClick={()=>loadMore(25)}>{status==='LoadingMore'?'Loading…':'Load more categories'}</Button></div>}
   </section>
   <form aria-label={editing?'Edit event category':'New event category'} onSubmit={e=>{e.preventDefault();void save();}} className="space-y-5 rounded-lg border bg-card p-5">
    <h2 className="font-medium">{editing?'Edit category':'New category'}</h2>{dirty&&<p className="text-xs text-muted-foreground">Save or cancel your changes before choosing another category.</p>}
    {conflict&&<div role="alert" className="space-y-2 rounded-md border p-3 text-sm"><p>{current?'This category changed in another editor.':'This category was deleted.'}</p><Button type="button" variant="outline" size="sm" onClick={()=>choose(current??null)}>Reload category</Button></div>}
    <fieldset disabled={saving||conflict} className="space-y-5">
     <div className="space-y-2"><Label htmlFor="category-name">Name</Label><Input id="category-name" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></div>
     <div className="space-y-2"><Label htmlFor="category-slug">Slug</Label><Input id="category-slug" required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e=>setSlug(e.target.value)} aria-describedby="category-slug-help" /><p id="category-slug-help" className="text-xs text-muted-foreground">Lowercase words separated by hyphens, such as open-studio.</p></div>
     <div className="flex flex-wrap gap-2"><Button type="submit">{saving?'Saving…':editing?'Save category':'Create category'}</Button>{(editing||dirty)&&<Button type="button" variant="outline" onClick={()=>choose(null)}>Cancel</Button>}</div>
     {editing&&!deleting&&<Button type="button" variant="ghost" className="text-destructive" onClick={()=>setDeleting(true)}>Delete category</Button>}
     {editing&&deleting&&<div className="space-y-3 rounded-md border border-destructive/30 p-3"><p className="text-sm">Delete “{editing.name}”? Categories in use must be removed from their events first.</p><div className="flex gap-2"><Button type="button" variant="destructive" onClick={()=>void destroy()}>Confirm deletion</Button><Button type="button" variant="outline" onClick={()=>setDeleting(false)}>Keep category</Button></div></div>}
    </fieldset>
   </form>
  </div>
 </div>;
}
