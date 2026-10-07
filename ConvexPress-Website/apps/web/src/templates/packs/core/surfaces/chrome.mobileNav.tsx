/** Core · chrome.mobileNav — slide-in mobile navigation drawer with focus trap. */
import { MobileNav } from "@/components/layout/MobileNav";
import type { HeaderConfig, ResolvedMenu, SiteIdentity } from "@/lib/layout/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface MobileNavSurfaceData {
  menu: ResolvedMenu | undefined;
  siteIdentity: SiteIdentity | undefined;
  config: HeaderConfig["mobileMenu"];
  userMenu?: HeaderConfig["userMenu"];
  open: boolean;
  onClose: () => void;
}

export default function CoreChromeMobileNav({ data }: SurfaceProps<MobileNavSurfaceData>) {
  return (
    <MobileNav
      menu={data.menu}
      siteIdentity={data.siteIdentity}
      config={data.config}
      userMenu={data.userMenu}
      open={data.open}
      onClose={data.onClose}
    />
  );
}
