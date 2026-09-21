import type { BlockInstance } from "../src/templates/sdk/block-renderer/model";
import { demoProducts } from "./products-adapter";

/** Authoring specimens only: no saved content or production catalog is changed. */
export function productSourceSpecimen(instance: BlockInstance, source: string): BlockInstance {
  if (source === "example") return instance;
  const attrs = instance.attrs && typeof instance.attrs === "object" ? instance.attrs : {};
  if (instance.name === "commerce/product-showcase") return {
    ...instance, attrs: { ...attrs, source, categorySlug: "studio", productSlugs: ["demo-product-notebook", "demo-product-mug"] },
  };
  if (instance.name !== "blocks/product-collection") return instance;
  const authored = source === "authored" || source === "maximum";
  const products = authored ? [{ title: source === "maximum" ? "W".repeat(160) : "The studio edition", summary: source === "maximum" ? "W".repeat(400) : "An independently authored collection card.", href: "/studio-edition", price: source === "maximum" ? "W".repeat(60) : "$24", badge: source === "maximum" ? "W".repeat(60) : "Studio exclusive", mediaId: "", imageAlt: "" }] : [];
  return { ...instance, attrs: { ...attrs,
    mode: authored ? "manual" : source, categorySlug: "studio", tagSlug: "gift",
    productIds: authored ? [] : demoProducts.map(product => product.id), products,
    showAddToCart: true, showRating: true,
    groups: [
      { label: "Kitchen", productIds: ["demo-product-mug", "demo-product-pair"], products: [] },
      { label: "Studio edition", productIds: [], products },
      { label: "Unavailable selection", productIds: ["missing-product"], products: [{ title: "Must not replace unavailable products", summary: "", href: "", price: "", badge: "", mediaId: "", imageAlt: "" }] },
    ],
  } };
}
