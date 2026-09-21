import { api } from "@backend/convex/_generated/api";
import type { Doc, Id } from "@backend/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils";

type Brand = Doc<"commerce_product_brands">;
type Draft = { name: string; slug: string; description: string; status: Brand["status"]; sortOrder: string; logoMediaId?: Id<"media"> };
const emptyDraft = (): Draft => ({name:"",slug:"",description:"",status:"draft",sortOrder:"0"});
const draftOf = (brand: Brand): Draft => ({name:brand.name,slug:brand.slug,description:brand.description,status:brand.status,sortOrder:String(brand.sortOrder),logoMediaId:brand.logoMediaId});

export function CommerceBrandManager() {
  const brands = usePaginatedQuery(api.commerce.brands.list, {}, {initialNumItems:24});
  const create = useMutation(api.commerce.brands.create), update = useMutation(api.commerce.brands.update);
  const [selected, setSelected] = useState<Brand | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const select = (brand: Brand | null) => { const next=brand?draftOf(brand):emptyDraft(); setSelected(brand);setDraft(next);setBaseline(next); };
  const change = <K extends keyof Draft>(key:K,value:Draft[K]) => setDraft(current=>({...current,[key]:value}));
  async function save(event: FormEvent) {
    event.preventDefault();
    const sortOrder = Number(draft.sortOrder);
    if (!draft.sortOrder.trim() || !Number.isSafeInteger(sortOrder) || Math.abs(sortOrder)>100000) {toast.error("Display order must be a whole number between -100000 and 100000.");return;}
    setSaving(true);
    try {
      const values={name:draft.name,slug:draft.slug.trim() || undefined,description:draft.description,status:draft.status,sortOrder};
      if(selected) await update({...values,brandId:selected._id,logoMediaId:draft.logoMediaId ?? null});
      else await create({...values,logoMediaId:draft.logoMediaId});
      toast.success(selected?"Brand saved":"Brand created");select(null);
    } catch(error) {toast.error(getErrorMessage(error));} finally {setSaving(false);}
  }
  return <div className="space-y-6">
    <header className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">Brands</h1><p className="max-w-2xl text-sm text-muted-foreground">Organize the makers behind your products. Publish a brand to make it available to visitors; archive it to hide it while keeping existing product assignments.</p></header>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
      <section aria-label="Catalog brands" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b p-4"><h2 className="font-semibold">Catalog brands</h2><Button variant="outline" disabled={saving || dirty || !selected} onClick={()=>select(null)}>New brand</Button></div>
        {brands.status === "LoadingFirstPage" ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading brands…</p> : brands.results.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No brands yet. Add your first maker using the form.</p> : <ul className="divide-y">{brands.results.map(brand=><li key={brand._id}><button type="button" disabled={saving || dirty} onClick={()=>select(brand)} aria-pressed={selected?._id===brand._id} className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:bg-muted"><span className="min-w-0"><span className="block truncate font-medium">{brand.name}</span><span className="block truncate text-sm text-muted-foreground">{brand.slug}</span></span><span className="rounded-full border px-2.5 py-1 text-xs">{brand.status === "publish" ? "Published" : brand.status === "draft" ? "Draft" : "Archived"}</span></button></li>)}</ul>}
        {brands.status !== "Exhausted" && brands.status !== "LoadingFirstPage" && <div className="border-t p-4"><Button variant="outline" disabled={brands.status === "LoadingMore"} onClick={()=>brands.loadMore(24)}>{brands.status === "LoadingMore" ? "Loading…" : "Load more brands"}</Button></div>}
      </section>
      <form onSubmit={save} aria-label={selected?"Edit brand":"New brand"} className="space-y-5 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">{selected?"Edit brand":"New brand"}</h2>
        <fieldset disabled={saving} className="space-y-4">
          <div className="space-y-1.5"><label htmlFor="brand-name" className="text-sm font-medium">Brand name</label><Input id="brand-name" required maxLength={160} value={draft.name} onChange={e=>change("name",e.target.value)} /></div>
          <div className="space-y-1.5"><label htmlFor="brand-slug" className="text-sm font-medium">URL slug</label><Input id="brand-slug" maxLength={120} value={draft.slug} onChange={e=>change("slug",e.target.value)} aria-describedby="brand-slug-help" /><p id="brand-slug-help" className="text-xs text-muted-foreground">Leave blank to generate from the name. Existing links use this slug.</p></div>
          <div className="space-y-1.5"><label htmlFor="brand-description" className="text-sm font-medium">Description</label><Textarea id="brand-description" rows={3} maxLength={3000} value={draft.description} onChange={e=>change("description",e.target.value)} /></div>
          <div className="space-y-2"><p className="text-sm font-medium">Brand logo</p><MediaPicker label="Choose brand logo" allowedTypes={["image"]} selectedId={draft.logoMediaId} onSelect={id=>change("logoMediaId",id)} onClear={()=>change("logoMediaId",undefined)} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label htmlFor="brand-status" className="text-sm font-medium">Visibility</label><select id="brand-status" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.status} onChange={e=>change("status",e.target.value as Brand["status"])}><option value="draft">Draft</option><option value="publish">Published</option><option value="archived">Archived</option></select></div><div className="space-y-1.5"><label htmlFor="brand-order" className="text-sm font-medium">Display order</label><Input id="brand-order" type="number" min={-100000} max={100000} step={1} value={draft.sortOrder} onChange={e=>change("sortOrder",e.target.value)} /></div></div>
          <p className="text-xs text-muted-foreground">Lower display orders appear first. Only published brands appear on the public website.</p>
        </fieldset>
        {dirty && <p role="status" className="text-sm text-muted-foreground">Save or discard your changes before selecting another brand.</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving || !dirty || !draft.name.trim()}>{saving?"Saving…":selected?"Save brand":"Create brand"}</Button><Button type="button" variant="outline" disabled={saving || !dirty} onClick={()=>setDraft(baseline)}>Discard changes</Button></div>
      </form>
    </div>
  </div>;
}
