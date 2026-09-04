/**
 * Downloads loader: digital-products gate, the downloads and license-key
 * queries, and the generateDownloadUrl action (plus clipboard copy), handed
 * to the `dashboard.downloads` surface.
 */
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
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

  const generateDownloadUrl = useAction(
    (api as any).commerceDigital.actions.generateDownloadUrl,
  );

  async function download(token: string) {
    try {
      const result = await generateDownloadUrl({ token });
      if (!result.success) {
        toast.error(result.error ?? "Download failed");
        return;
      }

      // Open the download URL in a new tab
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.fileName || "download";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Download started");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Download failed",
      );
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
