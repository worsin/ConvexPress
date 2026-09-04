/**
 * Downloads: digital purchases ready to grab (commerceDigital.queries.getMyDownloads).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { ViewAllLink, rowsForSize } from "../_shared";

interface DownloadRow {
  _id: string;
  isActive: boolean;
  file: { name: string; version: string } | null;
  product: { title: string } | null;
}

function DownloadsWidget({ size }: DashboardWidgetProps) {
  const { to } = useDashboardShell();
  const settings = useSettings();
  const enabled = settings?.plugins?.commerceDigitalEnabled === true;
  const downloads = useQuery(api.commerceDigital.queries.getMyDownloads, enabled ? {} : "skip") as
    | DownloadRow[]
    | undefined;
  if (!enabled) return <WidgetEmpty icon="download" title="Digital products are off" />;
  if (downloads === undefined) return <WidgetSkeleton rows={3} />;
  const active = downloads.filter((row) => row.isActive);
  if (active.length === 0) {
    return <WidgetEmpty icon="download" title="No downloads yet" description="Files from digital purchases appear here." />;
  }
  return (
    <ul role="list" className="divide-y divide-border">
      {active.slice(0, rowsForSize(size, 4)).map((row) => (
        <li key={row._id}>
          <Link
            to={to("/downloads")}
            className="flex items-center gap-2 py-1.5 text-xs transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">{row.file?.name ?? row.product?.title ?? "File"}</span>
              {row.file?.version && <span className="block text-[10px] text-muted-foreground">v{row.file.version}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/downloads")} />;
}

const module: DashboardWidgetModule = {
  id: "downloads",
  Widget: DownloadsWidget,
  Actions,
};

export default module;
