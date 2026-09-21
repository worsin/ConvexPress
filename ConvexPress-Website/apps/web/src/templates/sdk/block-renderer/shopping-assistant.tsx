import { createContext, useContext, type ReactNode } from "react";
/** The host supplies public configuration. Renderers neither query Convex nor
 * assume an assistant is available when the host has not provided one. */
export interface ShoppingAssistantHost {
  enabled: boolean;
  catalogEnabled: boolean;
  mobileAvailable: boolean;
  displayName: string;
  tagline: string;
  starterPrompts: readonly string[];
}
const ShoppingAssistant = createContext<ShoppingAssistantHost | null>(null);
export function ShoppingAssistantProvider({value,children}:{value:ShoppingAssistantHost;children:ReactNode}) {
  return <ShoppingAssistant value={value}>{children}</ShoppingAssistant>;
}
export function useShoppingAssistant() { return useContext(ShoppingAssistant); }
export function assistantQuestionUrl(prompt: string) { return `/products?ask=${encodeURIComponent(prompt)}`; }
