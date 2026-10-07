import type { ReactNode } from "react";
import type { HeaderConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

/** Pack-owned content arranged according to the portable header layout control. */
export function HeaderMainRow({ style, heightClass, brand, navigation, actions, mobileToggle, search }: {
  style: HeaderConfig["layout"]["style"];
  heightClass: string;
  brand: ReactNode;
  navigation?: ReactNode;
  actions: ReactNode;
  mobileToggle: ReactNode;
  search?: ReactNode;
}) {
  if (style === "standard") return (
    <div data-slot="header-main-row" className={cn("flex min-w-0 items-center justify-between gap-3 md:gap-4", heightClass)}>
      <div className="flex min-w-0 items-center gap-3">{mobileToggle}{brand}</div>
      {navigation && <div className="hidden min-w-0 flex-1 justify-center lg:flex">{navigation}</div>}
      {search}
      {actions}
    </div>
  );

  return (
    <>
      <div data-slot="header-main-row" className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-3", heightClass)}>
        <div className="flex min-w-0 items-center gap-3">{mobileToggle}{style === "split" && navigation}</div>
        <div className="min-w-0 max-w-full justify-self-center">{brand}</div>
        <div className="flex min-w-0 justify-end">{actions}</div>
      </div>
      {search && <div className="hidden pb-2 md:block">{search}</div>}
      {style === "centered" && navigation && <div className="hidden justify-center pb-2 lg:flex">{navigation}</div>}
    </>
  );
}
