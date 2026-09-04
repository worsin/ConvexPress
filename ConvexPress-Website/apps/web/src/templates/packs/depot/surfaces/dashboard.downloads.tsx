/**
 * Depot · dashboard.downloads — purchased files and license keys in two
 * tabs, each a dense `DataTable`: downloads (product / file, size, tabular
 * count, expiry, order, status badge, download button) and license keys
 * (product, type, activations, expiry, status, masked key with show / copy).
 * Download URL generation and clipboard copies come from the loader.
 */
import { Copy, Download, Key } from "lucide-react";
import { useState } from "react";

import type { DashboardDownloadEntry, DashboardDownloadsSurfaceData, DashboardLicenseKeyEntry } from "@/templates/packs/core/surfaces/dashboard.downloads";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Chip, DataTable, EmptyState, Td, Th, Toolbar } from "../parts";
import { DashboardPageHeader, StatusBadge, TableSkeleton, dateOrDash } from "../parts/extra-dashboard";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, index)).toFixed(1)} ${sizes[index]}`;
}

function formatRelativeDate(ts: number) {
  const days = Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `${days} days left`;
}

export default function DepotDashboardDownloads({ data }: SurfaceProps<DashboardDownloadsSurfaceData>) {
  const { downloads, licenseKeys, actions } = data;
  const [activeTab, setActiveTab] = useState<"downloads" | "licenses">("downloads");

  const activeDownloads = downloads?.filter((download) => download.isActive && !download.isExpired && !download.isLimitReached).length ?? 0;
  const activeLicenses = licenseKeys?.filter((key) => key.status === "active" || key.status === "assigned").length ?? 0;

  return (
    <div data-slot="dashboard-downloads" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader eyebrow="Shop" title="Downloads & license keys" description="Access your purchased digital products and manage your license keys." />

      <Toolbar label="Downloads sections">
        <Chip active={activeTab === "downloads"} onClick={() => setActiveTab("downloads")} role="tab" aria-selected={activeTab === "downloads"}>
          <Download className="size-3.5" aria-hidden="true" />
          Downloads
          {downloads !== undefined ? <span className="tabular-nums opacity-70">{activeDownloads}</span> : null}
        </Chip>
        <Chip active={activeTab === "licenses"} onClick={() => setActiveTab("licenses")} role="tab" aria-selected={activeTab === "licenses"}>
          <Key className="size-3.5" aria-hidden="true" />
          License keys
          {licenseKeys !== undefined ? <span className="tabular-nums opacity-70">{activeLicenses}</span> : null}
        </Chip>
      </Toolbar>

      {activeTab === "downloads" ? (
        downloads === undefined ? (
          <TableSkeleton rows={3} />
        ) : downloads.length === 0 ? (
          <EmptyState title="You don't have any downloads yet." description="Downloads will appear here after you purchase a digital product." />
        ) : (
          <>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              {activeDownloads} active download{activeDownloads === 1 ? "" : "s"} out of {downloads.length} total
            </p>
            <DataTable caption="Downloads">
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>File</Th>
                  <Th className="text-right">Downloads</Th>
                  <Th>Expires</Th>
                  <Th>Order</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Action</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {downloads.map((download) => (
                  <DownloadRow key={download._id} download={download} onDownload={actions.download} />
                ))}
              </tbody>
            </DataTable>
          </>
        )
      ) : licenseKeys === undefined ? (
        <TableSkeleton rows={3} />
      ) : licenseKeys.length === 0 ? (
        <EmptyState title="You don't have any license keys yet." description="License keys will appear here when you purchase a product that requires one." />
      ) : (
        <>
          <p className="text-[13px] tabular-nums text-muted-foreground">
            {activeLicenses} active license{activeLicenses === 1 ? "" : "s"} out of {licenseKeys.length} total
          </p>
          <DataTable caption="License keys">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Type</Th>
                <Th className="text-right">Activations</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
                <Th>Key</Th>
              </tr>
            </thead>
            <tbody>
              {licenseKeys.map((key) => (
                <LicenseKeyRow key={key._id} licenseKey={key} onCopy={actions.copyLicenseKey} />
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </div>
  );
}

function DownloadRow({ download, onDownload }: { download: DashboardDownloadEntry; onDownload: (token: string) => Promise<void> }) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = download.isActive && !download.isExpired && !download.isLimitReached;
  const file = download.file;
  const product = download.product;
  if (!file || !product) return null;

  async function handleDownload() {
    if (!canDownload) return;
    setDownloading(true);
    try {
      await onDownload(download.token);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <Td className="min-w-40">
        <p className="font-semibold text-foreground">{product.title}</p>
        <p className="text-xs text-muted-foreground">
          {file.name} · v{file.version}
        </p>
      </Td>
      <Td className="min-w-40">
        <p className="text-foreground">{file.fileName}</p>
        <p className="text-xs tabular-nums text-muted-foreground">{formatBytes(file.fileSize)}</p>
      </Td>
      <Td align="right">
        <span className="font-semibold text-foreground">
          {download.downloadCount}
          {download.maxDownloads ? ` / ${download.maxDownloads}` : ""}
        </span>
        {download.maxDownloads ? <span className="block text-xs text-muted-foreground">{download.maxDownloads - download.downloadCount} remaining</span> : null}
      </Td>
      <Td className="whitespace-nowrap">
        <span className="text-foreground">{download.expiresAt ? formatRelativeDate(download.expiresAt) : "Never"}</span>
        {download.expiresAt ? <span className="block text-xs tabular-nums text-muted-foreground">{dateOrDash(download.expiresAt)}</span> : null}
      </Td>
      <Td className="whitespace-nowrap tabular-nums text-muted-foreground">{download.order ? download.order.orderNumber || download.order._id : "—"}</Td>
      <Td>
        <StatusBadge status={canDownload ? "available" : download.isExpired ? "expired" : download.isLimitReached ? "limit_reached" : "inactive"} label={canDownload ? "Available" : download.isExpired ? "Expired" : download.isLimitReached ? "Limit reached" : "Inactive"} />
      </Td>
      <Td align="right">
        <Button size="sm" onClick={() => void handleDownload()} disabled={!canDownload || downloading}>
          <Download className="size-3.5" aria-hidden="true" />
          {downloading ? "Starting..." : "Download"}
        </Button>
      </Td>
    </tr>
  );
}

function LicenseKeyRow({ licenseKey, onCopy }: { licenseKey: DashboardLicenseKeyEntry; onCopy: (key: string) => void }) {
  const [showKey, setShowKey] = useState(false);
  const product = licenseKey.product;
  if (!product) return null;

  return (
    <tr className="border-t border-border align-top">
      <Td className="min-w-40 font-semibold text-foreground">{product.title}</Td>
      <Td className="capitalize text-muted-foreground">{licenseKey.keyType}</Td>
      <Td align="right" className="text-foreground">
        {licenseKey.activeActivations}
        {licenseKey.maxActivations ? ` / ${licenseKey.maxActivations}` : " / unlimited"}
      </Td>
      <Td className="whitespace-nowrap text-muted-foreground">{licenseKey.expiresAt ? (licenseKey.isExpired ? "Expired" : dateOrDash(licenseKey.expiresAt)) : "Never"}</Td>
      <Td>
        <StatusBadge status={licenseKey.status} />
      </Td>
      <Td className="min-w-64">
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-xs text-foreground">{showKey ? licenseKey.licenseKey : licenseKey.licenseKey.replace(/[A-Za-z0-9]/g, "•")}</code>
          <Button size="sm" variant="secondary" onClick={() => setShowKey(!showKey)} aria-pressed={showKey}>
            {showKey ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onCopy(licenseKey.licenseKey)} title="Copy key" aria-label="Copy key" className="px-2">
            <Copy className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </Td>
    </tr>
  );
}
