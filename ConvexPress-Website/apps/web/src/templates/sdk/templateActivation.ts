import type { Values } from "./draftModel";

interface ActivatableTemplate { active: string; variants: Record<string, string>; settings: Record<string, Values> }

const shopVariants = { catalogVariant: "shop.catalog", productVariant: "shop.product" } as const;

/** Keep legacy surface selectors in sync with each template's saved shop fields. */
export function activateTemplate<T extends ActivatableTemplate>(current: T, packId: string): T {
  const next = structuredClone(current);
  if (current.active === packId) return next;
  for (const [field, surface] of Object.entries(shopVariants)) {
    // Preserve a legacy selection before leaving a pack that predates the Customizer.
    const previous = current.variants[surface];
    if (previous && next.settings[current.active]?.shop?.[field] === undefined) {
      const settings = next.settings[current.active] ??= {};
      (settings.shop ??= {})[field] = previous;
    }
    delete next.variants[surface];
    const saved = next.settings[packId]?.shop?.[field];
    if (typeof saved === "string" && saved) next.variants[surface] = saved;
  }
  next.active = packId;
  return next;
}
