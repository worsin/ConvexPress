/** Core · chrome.header — the configurable site header (standard / centered / split layouts). */
import { SiteHeader } from "@/components/layout/SiteHeader";
import type { HeaderConfig, LayoutConfig, ResolvedMenu, SiteIdentity } from "@/lib/layout/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface HeaderSurfaceData {
  siteIdentity: SiteIdentity | undefined;
  /** Menu resolved for the header's configured location. */
  menu: ResolvedMenu | undefined;
  layoutConfig: LayoutConfig;
  headerConfig: HeaderConfig;
}

export default function CoreChromeHeader({ data }: SurfaceProps<HeaderSurfaceData>) {
  return (
    <SiteHeader
      siteIdentity={data.siteIdentity}
      menu={data.menu}
      layoutConfig={data.layoutConfig}
      headerConfig={data.headerConfig}
    />
  );
}
