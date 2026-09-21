/**
 * Aster · dashboard.downloads — purchased digital files and license keys
 * behind a small-caps tab line. Each entry is a rule-separated row with a
 * display title, a status pill, a stat row and the pill action. Download URL
 * generation and clipboard copies come from the loader.
 */
import { useState } from "react";

import type { DashboardDownloadEntry, DashboardDownloadsSurfaceData, DashboardLicenseKeyEntry } from "@/templates/packs/core/surfaces/dashboard.downloads";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, EmptyState, SmallCaps } from "../parts";
import { PageHeading, Row, RowList, RowSkeleton, Stat, StatGrid, StatusPill, TabLine, TextAction, dashDate } from "../parts/extra-dashboard";

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

export default function AsterDashboardDownloads({ data }: SurfaceProps<DashboardDownloadsSurfaceData>) {
  const { downloads, licenseKeys, actions } = data;
  const [activeTab, setActiveTab] = useState<"downloads" | "licenses">("downloads");

  const activeDownloads = downloads?.filter((entry) => entry.isActive && !entry.isExpired && !entry.isLimitReached).length ?? 0;
  const activeLicenses = licenseKeys?.filter((key) => key.status === "active" || key.status === "assigned").length ?? 0;

  return (
    <div data-slot="dashboard-downloads" className="flex flex-col gap-10">
      <PageHeading eyebrow="Library" title="Downloads & license keys" lede="Access your purchased digital products and manage your license keys." />

      <TabLine
        tabs={[
          { key: "downloads", label: "Downloads", count: downloads !== undefined ? activeDownloads : undefined },
          { key: "licenses", label: "License keys", count: licenseKeys !== undefined ? activeLicenses : undefined },
        ]}
        current={activeTab}
        onChange={(key) => setActiveTab(key as "downloads" | "licenses")}
      />

      {activeTab === "downloads" ? (
        downloads === undefined ? (
          <RowSkeleton rows={2} />
        ) : downloads.length === 0 ? (
          <EmptyState eyebrow="No downloads yet" title="Downloads will appear here after you purchase a digital product." />
        ) : (
          <div className="flex flex-col gap-6">
            <SmallCaps as="p" className="tabular-nums">
              {activeDownloads} active download{activeDownloads === 1 ? "" : "s"} of {downloads.length} total
            </SmallCaps>
            <RowList aria-label="Downloads">
              {downloads.map((download) => (
                <DownloadRow key={download._id} download={download} onDownload={actions.download} />
              ))}
            </RowList>
          </div>
        )
      ) : licenseKeys === undefined ? (
        <RowSkeleton rows={2} />
      ) : licenseKeys.length === 0 ? (
        <EmptyState eyebrow="No license keys yet" title="License keys will appear here when you purchase a product that requires one." />
      ) : (
        <div className="flex flex-col gap-6">
          <SmallCaps as="p" className="tabular-nums">
            {activeLicenses} active license{activeLicenses === 1 ? "" : "s"} of {licenseKeys.length} total
          </SmallCaps>
          <RowList aria-label="License keys">
            {licenseKeys.map((key) => (
              <LicenseKeyRow key={key._id} licenseKey={key} onCopy={actions.copyLicenseKey} />
            ))}
          </RowList>
        </div>
      )}
    </div>
  );
}

function DownloadRow({ download, onDownload }: { download: DashboardDownloadEntry; onDownload: (token: string) => Promise<void> }) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = download.isActive && !download.isExpired && !download.isLimitReached;

  async function handleDownload() {
    if (!canDownload) return;
    setDownloading(true);
    try {
      await onDownload(download.token);
    } finally {
      setDownloading(false);
    }
  }

  const { file, product } = download;
  if (!file || !product) return null;

  return (
    <Row className="gap-5 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-display text-xl leading-snug text-foreground">{product.title}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <SmallCaps className="normal-case tracking-normal">{file.name}</SmallCaps>
            <Dot />
            <SmallCaps className="tabular-nums">v{file.version}</SmallCaps>
            {download.order ? (
              <>
                <Dot />
                <SmallCaps>Order {download.order.orderNumber || download.order._id}</SmallCaps>
              </>
            ) : null}
          </p>
        </div>
        {canDownload ? <StatusPill tone="primary" label="Available" /> : download.isExpired ? <StatusPill tone="destructive" label="Expired" /> : download.isLimitReached ? <StatusPill label="Limit reached" /> : <StatusPill label="Inactive" />}
      </div>

      <StatGrid>
        <Stat label="File" value={<span className="break-all text-sm">{file.fileName}</span>} hint={formatBytes(file.fileSize)} />
        <Stat label="Downloads" value={<span className="tabular-nums">{download.downloadCount}{download.maxDownloads ? ` / ${download.maxDownloads}` : ""}</span>} hint={download.maxDownloads ? `${download.maxDownloads - download.downloadCount} remaining` : undefined} />
        <Stat label="Expires" value={download.expiresAt ? formatRelativeDate(download.expiresAt) : "Never"} hint={download.expiresAt ? dashDate(download.expiresAt) : undefined} />
      </StatGrid>

      <div>
        <Button variant="primary" className="h-10 px-5" onClick={() => void handleDownload()} disabled={!canDownload || downloading}>
          {downloading ? "Starting download..." : "Download"}
        </Button>
      </div>
    </Row>
  );
}

function LicenseKeyRow({ licenseKey, onCopy }: { licenseKey: DashboardLicenseKeyEntry; onCopy: (key: string) => void }) {
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const product = licenseKey.product;
  if (!product) return null;

  return (
    <Row className="gap-5 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-display text-xl leading-snug text-foreground">{product.title}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusPill status={licenseKey.status} />
            <SmallCaps className="capitalize">{licenseKey.keyType}</SmallCaps>
          </p>
        </div>
        <TextAction onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? "Hide details" : "Show details"}
        </TextAction>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SmallCaps as="span">License key</SmallCaps>
              <p className="break-all border-b border-border pb-2 font-mono text-sm text-foreground" aria-live="polite">
                {showKey ? licenseKey.licenseKey : licenseKey.licenseKey.replace(/[A-Za-z0-9]/g, "•")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-5 pb-2">
              <TextAction tone="foreground" onClick={() => setShowKey((value) => !value)}>
                {showKey ? "Hide" : "Show"}
              </TextAction>
              <TextAction tone="foreground" onClick={() => onCopy(licenseKey.licenseKey)} title="Copy key">
                Copy
              </TextAction>
            </div>
          </div>

          <StatGrid>
            <Stat label="Activations" value={<span className="tabular-nums">{licenseKey.activeActivations}{licenseKey.maxActivations ? ` / ${licenseKey.maxActivations}` : " / unlimited"}</span>} />
            <Stat label="Type" value={<span className="capitalize">{licenseKey.keyType}</span>} />
            <Stat label="Expires" value={licenseKey.expiresAt ? (licenseKey.isExpired ? "Expired" : dashDate(licenseKey.expiresAt)) : "Never"} />
          </StatGrid>
        </div>
      ) : null}
    </Row>
  );
}

function Dot() {
  return (
    <span className="text-muted-foreground/60" aria-hidden="true">
      ·
    </span>
  );
}
