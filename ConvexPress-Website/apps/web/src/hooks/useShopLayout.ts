/** Shop choices follow the active template pack and live Customizer draft. */
import { useSearch } from "@tanstack/react-router";
import { useTemplate } from "@/templates/sdk/useTemplate";
import { useTemplateSettings, useDraftVariants } from "@/templates/sdk/useTemplateSettings";
import { resolveShopLayout, type ShopLayout } from "@/lib/commerce/shop-layout";
export { SHOP_LAYOUT_IDS, PRODUCT_LAYOUT_IDS, type ShopLayoutId, type ProductLayoutId, type ShopLayout } from "@/lib/commerce/shop-layout";

export function useShopLayout(): ShopLayout {
  const template = useTemplate();
  const settings = useTemplateSettings();
  const draftVariants = useDraftVariants();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  return resolveShopLayout(
    { ...template.config.variants, ...draftVariants },
    settings.values.shop ?? {},
    search,
    template.previewing || settings.drafting,
  );
}
