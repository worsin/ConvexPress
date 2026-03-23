/**
 * Sites List
 *
 * Grid of connected WordPress sites with status and actions.
 */

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  GlobeIcon,
  ExternalLinkIcon,
  PlayIcon,
  PauseIcon,
  TrashIcon,
  SettingsIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
  RefreshCcwIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDate } from "@/lib/utils";

interface Site {
  _id: Id<"wordpressSites">;
  name: string;
  siteUrl: string;
  status: "active" | "inactive" | "error";
  siteName?: string;
  wpVersion?: string;
  lastSyncAt?: number;
  lastConnectionTest?: number;
  connectionError?: string;
  activeJob?: boolean;
}

interface SitesListProps {
  sites: Site[];
}

export function SitesList({ sites }: SitesListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sites.map((site) => (
        <SiteCard key={site._id} site={site} />
      ))}
    </div>
  );
}

// ─── Site Card ───────────────────────────────────────────────────────────────

function SiteCard({ site }: { site: Site }) {
  const [showDelete, setShowDelete] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Actions
  const testConnection = useMutation(
    api.wordpressSync.actions.testSiteConnection,
  );
  const startSync = useMutation(api.wordpressSync.actions.startSync);
  const deleteSite = useMutation(api.wordpressSync.mutations.deleteSite);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const result = await testConnection({ siteId: site._id });
      if (result.success) {
        toast.success(`Connected successfully! WordPress ${result.wpVersion}`);
      } else {
        toast.error(result.error || "Connection failed");
      }
    } catch (error) {
      toast.error("Failed to test connection");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleStartSync = async () => {
    try {
      await startSync({ siteId: site._id });
      toast.success("Sync started");
    } catch (error) {
      toast.error("Failed to start sync");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSite({ siteId: site._id });
      toast.success("Site removed");
    } catch (error) {
      toast.error("Failed to remove site");
    }
  };

  return (
    <>
      <Card className="group relative">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0",
                  site.status === "active" && "bg-success/10",
                  site.status === "error" && "bg-destructive/10",
                  site.status === "inactive" && "bg-muted",
                )}
              >
                <GlobeIcon
                  className={cn(
                    "w-4 h-4",
                    site.status === "active" && "text-success",
                    site.status === "error" && "text-destructive",
                    site.status === "inactive" && "text-muted-foreground",
                  )}
                />
              </div>
              <div className="min-w-0">
                <Link
                  to="/tools/wordpress-sync/$siteId"
                  params={{ siteId: site._id }}
                  className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate block"
                >
                  {site.name}
                </Link>
                <a
                  href={site.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate flex items-center gap-1"
                >
                  {new URL(site.siteUrl).hostname}
                  <ExternalLinkIcon className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
            </div>

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link
                    to="/tools/wordpress-sync/$siteId"
                    params={{ siteId: site._id }}
                  >
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    Manage Site
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleTestConnection}>
                  <RefreshCcwIcon className="mr-2 h-4 w-4" />
                  Test Connection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDelete(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <TrashIcon className="mr-2 h-4 w-4" />
                  Remove Site
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Status */}
          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status={site.status} />
            {site.wpVersion && (
              <Badge variant="outline" className="text-xs">
                WP {site.wpVersion}
              </Badge>
            )}
          </div>

          {/* Error message */}
          {site.status === "error" && site.connectionError && (
            <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5 mb-3 line-clamp-2">
              {site.connectionError}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-4">
            <div>
              <span className="text-foreground font-medium">Last sync:</span>{" "}
              {site.lastSyncAt ? formatDate(site.lastSyncAt) : "Never"}
            </div>
            <div>
              <span className="text-foreground font-medium">Last test:</span>{" "}
              {site.lastConnectionTest
                ? formatDate(site.lastConnectionTest)
                : "Never"}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {site.activeJob ? (
              <Link
                to="/tools/wordpress-sync/$siteId"
                params={{ siteId: site._id }}
                className="flex-1"
              >
                <Button variant="outline" className="w-full" size="sm">
                  <RefreshCcwIcon className="mr-2 h-3 w-3 animate-spin" />
                  View Progress
                </Button>
              </Link>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleStartSync}
                disabled={site.status === "error"}
              >
                <PlayIcon className="mr-2 h-3 w-3" />
                Start Sync
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTestingConnection}
            >
              {isTestingConnection ? (
                <RefreshCcwIcon className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCcwIcon className="h-3 w-3" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={`Remove ${site.name}?`}
        message="This will remove the site connection and all ID mappings. Imported content will remain in the database."
        confirmLabel="Remove"
        destructive
      />
    </>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "active" | "inactive" | "error" }) {
  const config = {
    active: {
      icon: CheckCircleIcon,
      label: "Connected",
      className: "bg-success/10 text-success border-success/20",
    },
    inactive: {
      icon: AlertCircleIcon,
      label: "Inactive",
      className: "bg-muted text-muted-foreground border-muted-foreground/20",
    },
    error: {
      icon: XCircleIcon,
      label: "Error",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <Badge variant="outline" className={cn("text-xs gap-1", className)}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}
