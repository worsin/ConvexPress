import {Link} from '@tanstack/react-router';
import {usePaginatedQuery,useQuery} from 'convex/react';
import {api} from '@backend/convex/_generated/api';
import type {Id} from '@backend/convex/_generated/dataModel';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
/** Paginated choices preserve the selected category even outside the loaded page. */
export function EventCategorySelect({value,onChange}:{value:string;onChange:(value:string)=>void}) {
 const {results,status,loadMore}=usePaginatedQuery(api.extensions.events.categories.list,{}, {initialNumItems:25});
 const selected=useQuery(api.extensions.events.categories.get,value?{id:value as Id<'extension_event_categories'>}:'skip');
 return <div className="space-y-2"><Label htmlFor="event-category">Event category</Label>
  <select id="event-category" value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
   <option value="">No category</option>
   {value&&!results.some(row=>row._id===value)&&<option value={value}>{selected===undefined?'Loading selected category…':selected?.name??'Category unavailable'}</option>}
   {results.map(row=><option key={row._id} value={row._id}>{row.name}</option>)}
  </select>
  {status==='LoadingFirstPage'&&<p role="status" className="text-xs text-muted-foreground">Loading categories…</p>}
  {(status==='CanLoadMore'||status==='LoadingMore')&&<Button type="button" variant="outline" size="sm" disabled={status==='LoadingMore'} onClick={()=>loadMore(25)}>{status==='LoadingMore'?'Loading…':'Load more categories'}</Button>}
  <p className="text-xs text-muted-foreground">Group events for your calendar and featured gatherings. <Link to="/events/categories" className="underline underline-offset-4">Manage event categories</Link></p>
 </div>;
}
