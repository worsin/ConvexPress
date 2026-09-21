import { createContext, useContext, type ReactNode } from "react";
export interface CollectionCartHost {
  ready: boolean;
  busy: string | null;
  add(productId: string, title: string): Promise<boolean>;
}
const CollectionCart = createContext<CollectionCartHost | null>(null);
export function CollectionCartProvider({value,children}:{value:CollectionCartHost;children:ReactNode}) {
  return <CollectionCart value={value}>{children}</CollectionCart>;
}
export function useCollectionCart() { return useContext(CollectionCart); }
