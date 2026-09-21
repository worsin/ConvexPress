import { useMemo, type ReactNode } from "react";
import { useAssistantConfig } from "../../../hooks/useAssistantConfig";
import { ShoppingAssistantProvider } from "./shopping-assistant";
/** Same public configuration and catalog entry point as ShopShell. */
export function ProductionShoppingAssistantProvider({children}:{children:ReactNode}) {
  const config=useAssistantConfig();
  const value=useMemo(()=>({enabled:config.enabled,catalogEnabled:config.routes.catalog!==false,mobileAvailable:config.mobileMode!=="hidden",
    displayName:config.displayName,tagline:config.tagline,starterPrompts:config.starterPrompts}),[config]);
  return <ShoppingAssistantProvider value={value}>{children}</ShoppingAssistantProvider>;
}
