/** Core · shop.catalog — the built-in catalog with the boutique / marketplace variants. */
import { ShopCatalog } from "@/components/shop/ShopCatalog";
import type { SurfaceProps } from "@/templates/sdk/types";

export default function CoreShopCatalog({ variant }: SurfaceProps<Record<string, never>>) {
  return <ShopCatalog variant={variant} />;
}
