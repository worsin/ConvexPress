/**
 * Shopping assistant configuration, straight from admin settings
 * (`commerce.assistant`, exposed through settings.getPublic). Nothing about
 * the rail's behaviour is hardcoded here; these defaults only cover a site
 * whose settings predate the section.
 */

import { useMemo } from "react";

import { useSettings } from "@/contexts/SettingsContext";

export interface AssistantConfig {
  enabled: boolean;
  displayName: string;
  tagline: string;
  placement: "left" | "right";
  railWidthPx: number;
  autoOpen: "firstSearch" | "always" | "never";
  routes: { search: boolean; catalog: boolean; product: boolean; cart: boolean; checkout: boolean };
  mobileMode: "sheet" | "hidden";
  maxPicks: number;
  cardsPerGroup: number;
  groups: { accessory: boolean; consumable: boolean; maintenance: boolean; upgrade: boolean; similar: boolean };
  promptChips: "auto" | "curated" | "off";
  curatedPrompts: string[];
  starterPrompts: string[];
  proactiveTips: boolean;
  memoryEnabled: boolean;
  disclosureText: string;
  searchFacets: boolean;
  drawerRecommendations: boolean;
  freeShippingThresholdMinor: number;
}

const FALLBACK: AssistantConfig = {
  enabled: true,
  displayName: "Shop assistant",
  tagline: "Knows your cart. Suggests what fits.",
  placement: "left",
  railWidthPx: 320,
  autoOpen: "firstSearch",
  routes: { search: true, catalog: true, product: true, cart: true, checkout: false },
  mobileMode: "sheet",
  maxPicks: 5,
  cardsPerGroup: 2,
  groups: { accessory: true, consumable: true, maintenance: true, upgrade: true, similar: true },
  promptChips: "auto",
  curatedPrompts: [],
  starterPrompts: ["Help me choose the right one", "What goes with what's in my cart?"],
  proactiveTips: true,
  memoryEnabled: true,
  disclosureText: "Suggestions are generated from your cart and your search. Prices and stock are live.",
  searchFacets: true,
  drawerRecommendations: true,
  freeShippingThresholdMinor: 0,
};

export function useAssistantConfig(): AssistantConfig {
  const settings = useSettings();
  const raw = (settings as { assistantConfig?: Partial<AssistantConfig> | null } | null)?.assistantConfig;
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  return useMemo(() => {
    const merged: AssistantConfig = {
      ...FALLBACK,
      ...raw,
      routes: { ...FALLBACK.routes, ...raw?.routes },
      groups: { ...FALLBACK.groups, ...raw?.groups },
    };
    if (!commerceEnabled) merged.enabled = false;
    merged.railWidthPx = Math.min(480, Math.max(260, Number(merged.railWidthPx) || 320));
    return merged;
  }, [raw, commerceEnabled]);
}
