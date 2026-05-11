import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Download,
  FileDown,
  Key,
  Copy,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle,
  Monitor,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";

export const Route = createFileRoute("/dashboard/downloads")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardDownloadsPage,
});

// ─── Formatters ────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(ts: number) {
  const now = Date.now();
  const diff = ts - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `${days} days left`;
}

// ─── Download Card ────────────────────────────────────────────────────────

function DownloadCard({
  download,
}: {
  download: {
    _id: string;
    token: string;
    downloadCount: number;
    maxDownloads?: number;
    expiresAt?: number;
    isExpired: boolean;
    isLimitReached: boolean;
    isActive: boolean;
    file: {
      _id: string;
      name: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      version: string;
    } | null;
    product: {
      _id: string;
      title: string;
    } | null;
    order: {
      _id: string;
      orderNumber?: string;
    } | null;
  };
}) {
  const generateDownloadUrl = useAction(
    (api as any).commerceDigital.actions.generateDownloadUrl,
  );
  const [downloading, setDownloading] = useState(false);

  const canDownload =
    download.isActive && !download.isExpired && !download.isLimitReached;

  async function handleDownload() {
    if (!canDownload) return;
    setDownloading(true);
    try {
      const result = await generateDownloadUrl({ token: download.token });
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
    } finally {
      setDownloading(false);
    }
  }

  const file = download.file;
  const product = download.product;

  if (!file || !product) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {product.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {file.name} -- v{file.version}
          </p>
        </div>
        {canDownload ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            <CheckCircle className="h-3 w-3" />
            Available
          </span>
        ) : download.isExpired ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
            <Clock className="h-3 w-3" />
            Expired
          </span>
        ) : download.isLimitReached ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            Limit Reached
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Inactive
          </span>
        )}
      </div>

      {/* Details */}
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <FileDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">File</p>
            <p className="text-sm font-medium text-foreground">
              {file.fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.fileSize)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Download className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Downloads</p>
            <p className="text-sm font-medium text-foreground">
              {download.downloadCount}
              {download.maxDownloads
                ? ` / ${download.maxDownloads}`
                : ""}
            </p>
            {download.maxDownloads && (
              <p className="text-xs text-muted-foreground">
                {download.maxDownloads - download.downloadCount} remaining
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expires</p>
            <p className="text-sm font-medium text-foreground">
              {download.expiresAt
                ? formatRelativeDate(download.expiresAt)
                : "Never"}
            </p>
            {download.expiresAt && (
              <p className="text-xs text-muted-foreground">
                {formatDate(download.expiresAt)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Order reference */}
      {download.order && (
        <div className="mx-5 mb-4 rounded-xl bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          Order: {download.order.orderNumber || download.order._id}
        </div>
      )}

      {/* Download action */}
      <div className="border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!canDownload || downloading}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Starting download..." : "Download"}
        </button>
      </div>
    </div>
  );
}

// ─── License Key Card ─────────────────────────────────────────────────────

function LicenseKeyCard({
  licenseKey,
}: {
  licenseKey: {
    _id: string;
    licenseKey: string;
    keyType: string;
    status: string;
    maxActivations?: number;
    activeActivations: number;
    expiresAt?: number;
    isExpired: boolean;
    product: {
      _id: string;
      title: string;
    } | null;
  };
}) {
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function copyKey() {
    void navigator.clipboard.writeText(licenseKey.licenseKey);
    toast.success("License key copied to clipboard");
  }

  const product = licenseKey.product;
  if (!product) return null;

  const statusStyles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    assigned: "bg-blue-100 text-blue-800",
    expired: "bg-muted text-muted-foreground",
    revoked: "bg-red-100 text-red-800",
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {product.title}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[licenseKey.status] ?? "bg-muted text-muted-foreground"}`}
            >
              {licenseKey.status}
            </span>
            <span className="text-xs text-muted-foreground">
              {licenseKey.keyType}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-4">
          {/* License key display */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-foreground">
              {showKey
                ? licenseKey.licenseKey
                : licenseKey.licenseKey.replace(
                    /[A-Za-z0-9]/g,
                    "\u2022",
                  )}
            </div>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              {showKey ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              onClick={copyKey}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Copy key"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>

          {/* Key details */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Activations
                </p>
                <p className="text-sm font-medium text-foreground">
                  {licenseKey.activeActivations}
                  {licenseKey.maxActivations
                    ? ` / ${licenseKey.maxActivations}`
                    : " / unlimited"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm font-medium capitalize text-foreground">
                  {licenseKey.keyType}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expires</p>
                <p className="text-sm font-medium text-foreground">
                  {licenseKey.expiresAt
                    ? licenseKey.isExpired
                      ? "Expired"
                      : formatDate(licenseKey.expiresAt)
                    : "Never"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

function DashboardDownloadsPage() {
  const settings = useSettings();
  const digitalEnabled = settings?.plugins?.commerceDigitalEnabled === true;
  const downloads = useQuery(
    (api as any).commerceDigital.queries.getMyDownloads,
    digitalEnabled ? {} : "skip",
  ) as
    | Array<{
        _id: string;
        token: string;
        downloadCount: number;
        maxDownloads?: number;
        expiresAt?: number;
        isExpired: boolean;
        isLimitReached: boolean;
        isActive: boolean;
        file: {
          _id: string;
          name: string;
          fileName: string;
          fileSize: number;
          mimeType: string;
          version: string;
        } | null;
        product: {
          _id: string;
          title: string;
        } | null;
        order: {
          _id: string;
          orderNumber?: string;
        } | null;
      }>
    | undefined;

  const licenseKeys = useQuery(
    (api as any).commerceDigital.queries.getMyLicenseKeys,
    digitalEnabled ? {} : "skip",
  ) as
    | Array<{
        _id: string;
        licenseKey: string;
        keyType: string;
        status: string;
        maxActivations?: number;
        activeActivations: number;
        expiresAt?: number;
        isExpired: boolean;
        product: {
          _id: string;
          title: string;
        } | null;
      }>
    | undefined;

  const [activeTab, setActiveTab] = useState<"downloads" | "licenses">(
    "downloads",
  );

  const activeDownloads =
    downloads?.filter(
      (d) => d.isActive && !d.isExpired && !d.isLimitReached,
    ).length ?? 0;

  const activeLicenses =
    licenseKeys?.filter(
      (k) => k.status === "active" || k.status === "assigned",
    ).length ?? 0;

  return (
    <PublicPluginGate pluginId="commerceDigital">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-sm font-medium text-foreground">
            Downloads & License Keys
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Access your purchased digital products and manage your
            license keys.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("downloads")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "downloads"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Download className="mr-2 inline h-4 w-4" />
            Downloads
            {downloads !== undefined && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                {activeDownloads}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("licenses")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "licenses"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Key className="mr-2 inline h-4 w-4" />
            License Keys
            {licenseKeys !== undefined && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                {activeLicenses}
              </span>
            )}
          </button>
        </div>

        {/* Downloads tab */}
        {activeTab === "downloads" && (
          <>
            {downloads === undefined ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-48 animate-pulse rounded-2xl bg-muted"
                  />
                ))}
              </div>
            ) : downloads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <Download className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  You don't have any downloads yet.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Downloads will appear here after you purchase a digital
                  product.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                  {activeDownloads} active download
                  {activeDownloads === 1 ? "" : "s"} out of{" "}
                  {downloads.length} total
                </div>

                {/* Download cards */}
                {downloads.map((download) => (
                  <DownloadCard key={download._id} download={download} />
                ))}
              </div>
            )}
          </>
        )}

        {/* License Keys tab */}
        {activeTab === "licenses" && (
          <>
            {licenseKeys === undefined ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-32 animate-pulse rounded-2xl bg-muted"
                  />
                ))}
              </div>
            ) : licenseKeys.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <Key className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  You don't have any license keys yet.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  License keys will appear here when you purchase a
                  product that requires one.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                  {activeLicenses} active license
                  {activeLicenses === 1 ? "" : "s"} out of{" "}
                  {licenseKeys.length} total
                </div>

                {/* License key cards */}
                {licenseKeys.map((key) => (
                  <LicenseKeyCard key={key._id} licenseKey={key} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PublicPluginGate>
  );
}
