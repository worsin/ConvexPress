/**
 * Downloads loader: digital-products gate, the downloads and license-key
 * queries, and protected streaming downloads (plus clipboard copy), handed
 * to the `dashboard.downloads` surface.
 */
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { useDownloadPurchase } from "@/hooks/useDownloadPurchase";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import CoreDashboardDownloads, {
  type DashboardDownloadEntry,
  type DashboardDownloadsSurfaceData,
  type DashboardLicenseKeyEntry,
} from "@/templates/packs/core/surfaces/dashboard.downloads";
import { Surface } from "@/templates/sdk/Surface";

export function DashboardDownloadsPage() {
  const settings = useSettings();
  const digitalEnabled = settings?.plugins?.commerceDigitalEnabled === true;
  const downloads = useQuery(
    (api as any).commerceDigital.queries.getMyDownloads,
    digitalEnabled ? {} : "skip",
  ) as DashboardDownloadEntry[] | undefined;

  const licenseKeys = useQuery(
    (api as any).commerceDigital.queries.getMyLicenseKeys,
    digitalEnabled ? {} : "skip",
  ) as DashboardLicenseKeyEntry[] | undefined;

  const downloadsHost = useDownloadPurchase();
  async function download(token: string) {
    try {
      await downloadsHost.download(token);
      toast.success("Download requested");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    }
  }

  function copyLicenseKey(licenseKey: string) {
    void navigator.clipboard.writeText(licenseKey);
    toast.success("License key copied to clipboard");
  }

  const data: DashboardDownloadsSurfaceData = {
    downloads,
    licenseKeys,
    actions: { download, copyLicenseKey },
  };

  return (
    <PublicPluginGate pluginId="commerceDigital">
      <Surface name="dashboard.downloads" data={data} fallback={CoreDashboardDownloads} />
    </PublicPluginGate>
  );
}
