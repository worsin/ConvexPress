import { createContext, useContext, type ReactNode } from "react";
import { blockPageHref } from "../block-data/portable/postGridContracts";

// The host supplies its actual route, including independent grids and search state.
// Saved content cannot choose a pagination destination or execute navigation code.
const PaginationContext = createContext<string | null>(null);
export function BlockPaginationProvider({ href, children }: { href: string; children: ReactNode }) {
  return <PaginationContext.Provider value={href}>{children}</PaginationContext.Provider>;
}
export function useBlockPageHref(blockId: string | undefined) {
  const href = useContext(PaginationContext);
  return (cursor: string | null): string | null =>
    href && blockId ? blockPageHref(href, blockId, cursor) : null;
}


/** A new term resets cursors while preserving unrelated page URL state. */
export function useBlockSearchForm(){
 const href=useContext(PaginationContext);
 if(!href||!/^\/(?!\/)[^\s\\]*$/u.test(href))return null;
 const url=new URL(href,"https://search.invalid");
 return {action:url.pathname,hidden:[...url.searchParams].filter(([key])=>key!=="q"&&key!=="blockPages")};
}
