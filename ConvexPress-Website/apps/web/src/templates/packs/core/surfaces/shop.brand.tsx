import type { SurfaceProps } from "@/templates/sdk/types";
import type { PublicBrand } from "@/templates/sdk/block-data/portable/brandContracts";
import type { FeaturedProductsResult } from "@/templates/sdk/block-data/portable/productContracts";
import * as P from "@/templates/sdk/primitives";
import { ProductCard } from "@/components/shop/product/CanonicalProductCard";
import "./shop.brand.css";

export interface BrandCatalogData {
  brand:PublicBrand; products:FeaturedProductsResult["items"]; loading:boolean;
  hasPrevious:boolean; hasNext:boolean; onPrevious:()=>void; onNext:()=>void;
}
export default function BrandCatalog({data}:SurfaceProps<BrandCatalogData>){
  return <section className="cp-brand-catalog" aria-label={`${data.brand.name} products`}>
    <header className="cp-brand-catalog-intro">
      <P.Eyebrow>Meet the maker</P.Eyebrow>
      {data.brand.logo && <img className="cp-brand-catalog-logo" src={data.brand.logo.src} alt={data.brand.logo.alt} decoding="async"/>}
      <P.Heading level={1} size="display">{data.brand.name}</P.Heading>
      {data.brand.description && <p className="cp-brand-catalog-description">{data.brand.description}</p>}
      <P.Link href="/products" label="Explore the full shop"/>
    </header>
    {data.loading?<p role="status">Loading products…</p>:data.products.length?<div className="cp-brand-catalog-grid">{data.products.map(product=><ProductCard key={product.id} product={{...product,rating:null,cart:null}} showPrice showSaleBadge showAddToCart={false}/>)}</div>:<p className="cp-brand-catalog-empty" role="status">{data.hasNext || data.hasPrevious ? "No available products in this part of the collection. Continue browsing to see more." : "No products are available from this maker right now."}</p>}
    {(data.hasPrevious||data.hasNext) && <nav className="cp-brand-catalog-pagination" aria-label="Brand products"><button type="button" onClick={data.onPrevious} disabled={!data.hasPrevious||data.loading}>← Previous products</button><button type="button" onClick={data.onNext} disabled={!data.hasNext||data.loading}>Next products →</button></nav>}
  </section>;
}
