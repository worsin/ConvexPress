/**
 * "Goes with this" / "Goes with your cart": relation-graph neighbours grouped
 * by purpose, each with the store's own reason. Used on product pages, the
 * cart page and (trimmed) inside the cart drawer.
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useEffect, useRef } from "react";

import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { cn } from "@/lib/utils";
import { ProductMiniCard, type ProductCardData } from "./ProductMiniCard";

export interface RelatedGroup {
  key: string;
  label: string;
  items: Array<{ card: ProductCardData; reason: string | null; weight: number; forProductId: string; type: string }>;
}

export function useRelatedGroups(input: { productIds?: string[]; fromCart?: boolean; perGroup?: number }) {
  const { sessionToken } = useCommerceSessionToken();
  const anyApi = api as any;
  const config = useAssistantConfig();
  const enabledGroups = new Set(Object.entries(config.groups).filter(([, on]) => on).map(([key]) => key));
  const forProducts = useQuery(
    anyApi.commerce.storefront.relatedForProducts,
    input.productIds?.length ? { productIds: input.productIds, perGroup: input.perGroup ?? config.cardsPerGroup } : "skip",
  ) as RelatedGroup[] | undefined;
  const forCart = useQuery(
    anyApi.commerce.storefront.relatedForCart,
    input.fromCart && sessionToken ? { sessionToken, perGroup: input.perGroup ?? config.cardsPerGroup } : "skip",
  ) as RelatedGroup[] | undefined;
  const groups = (input.fromCart ? forCart : forProducts)?.filter((group) => enabledGroups.has(group.key));
  return { groups, loading: (input.fromCart ? forCart : forProducts) === undefined && (input.fromCart || Boolean(input.productIds?.length)) };
}

export function RelatedProducts({
  productIds,
  fromCart,
  perGroup,
  surface,
  title,
  layout = "grid",
  limitGroups,
  onNavigate,
  className,
}: {
  productIds?: string[];
  fromCart?: boolean;
  perGroup?: number;
  surface: "product_page" | "cart_page" | "drawer";
  title?: string;
  layout?: "grid" | "row";
  limitGroups?: number;
  onNavigate?: () => void;
  className?: string;
}) {
  const { groups, loading } = useRelatedGroups({ productIds, fromCart, perGroup });
  const { sessionToken } = useCommerceSessionToken();
  const logEvent = useMutation((api as any).commerce.assistant.mutations.logEvent);
  const logged = useRef<string>("");

  const visible = (groups ?? []).slice(0, limitGroups ?? groups?.length ?? 0);

  useEffect(() => {
    if (!sessionToken || !visible.length) return;
    const ids = visible.flatMap((group) => group.items.map((item) => item.card.productId));
    const key = ids.join(",");
    if (key === logged.current) return;
    logged.current = key;
    void logEvent({ sessionToken, surface, event: "impression", productIds: ids }).catch(() => undefined);
  }, [logEvent, sessionToken, surface, visible]);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }
  if (!visible.length) return null;

  return (
    <section data-slot="related-products" className={cn("space-y-5", className)}>
      {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
      {visible.map((group) => (
        <div key={group.key} className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</h3>
          <div className={cn("grid gap-2", layout === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
            {group.items.map((item) => (
              <ProductMiniCard
                key={`${group.key}-${item.card.productId}`}
                product={item.card}
                rationale={item.reason}
                onNavigate={() => {
                  if (sessionToken) void logEvent({ sessionToken, surface, event: "click", productIds: [item.card.productId], groupKey: group.key }).catch(() => undefined);
                  onNavigate?.();
                }}
                onAdded={() => {
                  if (sessionToken) void logEvent({ sessionToken, surface, event: "add", productIds: [item.card.productId], groupKey: group.key }).catch(() => undefined);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
