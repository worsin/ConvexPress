/** Core · shop.product — the five built-in product page layouts. */
import { PRODUCT_LAYOUTS } from "@/components/shop/product/ProductLayouts";
import type { ProductDetail, ProductPageState } from "@/components/shop/product/useProductPage";
import { useShopLayout, type ProductLayoutId } from "@/hooks/useShopLayout";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface ProductSurfaceData {
  product: ProductDetail;
  state: ProductPageState;
}

export default function CoreShopProduct({ data, variant }: SurfaceProps<ProductSurfaceData>) {
  // An explicit template variant wins; otherwise the Shop layouts setting decides.
  const layout = useShopLayout();
  const id = (variant && variant in PRODUCT_LAYOUTS ? variant : layout.productLayout) as ProductLayoutId;
  const Layout = PRODUCT_LAYOUTS[id] ?? PRODUCT_LAYOUTS.classic;
  return (
    <div data-product-layout={id} className="mx-auto w-full max-w-[1440px]">
      <Layout product={data.product} state={data.state} />
    </div>
  );
}
