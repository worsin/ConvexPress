import { useMemo, type ReactNode } from "react";
import { useCart } from "../../../hooks/useCart";
import { CollectionCartProvider } from "./collection-cart";
/** Uses the same session and cart mutations as the storefront's product page. */
export function ProductionCollectionCartProvider({children}:{children:ReactNode}) {
  const cart = useCart();
  const value = useMemo(() => ({ready:cart.enabled && cart.isReady, busy:cart.busyProductId,
    add:(productId:string,title:string)=>cart.add(productId,{quantity:1,label:title}),
  }),[cart.enabled,cart.isReady,cart.busyProductId,cart.add]);
  return <CollectionCartProvider value={value}>{children}</CollectionCartProvider>;
}
