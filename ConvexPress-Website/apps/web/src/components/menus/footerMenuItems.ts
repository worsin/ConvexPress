import type { ResolvedMenuItem } from "@/lib/layout/types";

/** Footers have no disclosures: expose the resolved tree in authored order.
 * An orphaned ancestor suppresses its whole branch, as in header navigation.
 * Keep the stored tree intact so the same menu can still drive dropdowns.
 */
export function footerMenuItems(items: readonly ResolvedMenuItem[]): ResolvedMenuItem[] {
  return items.flatMap((item) => item.isOrphaned
    ? []
    : [item, ...footerMenuItems(item.children ?? [])]);
}
