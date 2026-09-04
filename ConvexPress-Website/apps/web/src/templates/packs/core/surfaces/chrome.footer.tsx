/** Core · chrome.footer — the admin-configured footer (rows builder or legacy columns). */
import { SiteFooter } from "@/components/layout/SiteFooter";
import type { FooterConfig, SiteIdentity } from "@/lib/layout/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface FooterSurfaceData {
  /** "minimal" shows only the copyright row (dashboard); "full" renders the configured footer. */
  variant: "full" | "minimal";
  siteIdentity: SiteIdentity | undefined;
  footerConfig: FooterConfig;
}

export default function CoreChromeFooter({ data }: SurfaceProps<FooterSurfaceData>) {
  return <SiteFooter variant={data.variant} siteIdentity={data.siteIdentity} footerConfig={data.footerConfig} />;
}
