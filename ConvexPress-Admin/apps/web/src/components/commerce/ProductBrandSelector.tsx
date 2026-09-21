import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { Button } from "@/components/ui/button";

export function ProductBrandSelector({value,onChange}:{value?:Id<"commerce_product_brands">;onChange:(value:Id<"commerce_product_brands">|undefined)=>void}) {
  const brands=usePaginatedQuery(api.commerce.brands.list,{}, {initialNumItems:24});
  const selected=useQuery(api.commerce.brands.get,value?{brandId:value}:"skip");
  const options=brands.results.filter(brand=>brand.status !== "archived" || brand._id === value);
  const hasSelected=options.some(brand=>brand._id === value);
  return <div className="space-y-2">
    <label htmlFor="product-brand" className="block text-sm font-semibold">Brand</label>
    <select id="product-brand" value={value ?? ""} onChange={event=>onChange((event.target.value || undefined) as Id<"commerce_product_brands">|undefined)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" aria-describedby="product-brand-help">
      <option value="">No brand</option>
      {value && !hasSelected && <option value={value}>{selected?.name ?? (selected === undefined ? "Loading selected brand…" : "Missing brand — preserved until changed")}{selected?.status === "archived" ? " (archived)" : ""}</option>}
      {options.map(brand=><option key={brand._id} value={brand._id}>{brand.name}{brand.status === "publish" ? "" : ` (${brand.status})`}</option>)}
    </select>
    <p id="product-brand-help" className="text-sm text-muted-foreground">Choose a maker for this product. Draft brands stay hidden from visitors.</p>
    {brands.status !== "Exhausted" && <Button type="button" variant="outline" size="sm" disabled={brands.status !== "CanLoadMore"} onClick={()=>brands.loadMore(24)}>{brands.status === "CanLoadMore" ? "Load more brands" : "Loading brands…"}</Button>}
  </div>;
}
