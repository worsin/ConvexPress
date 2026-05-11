/**
 * Updates Page - /admin/updates
 *
 * Dual update system:
 * 1. App-content updater (git-based) — primary, checks GitHub for new commits
 * 2. Shell updater (electron-updater) — secondary, for binary/Electron changes
 *
 * Only functional inside Electron. In browser, shows a simple message.
 */

import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ArrowUpCircle,
  Info,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { isElectron, getElectronBridge } from "@/lib/electron";

export const Route = createFileRoute("/_authenticated/_admin/updates")({
  component: UpdatesPage,
});

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "error";

interface UpdateInfo {
  version?: string;
  releaseNotes?: string;
  releaseName?: string;
}

function UpdatesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/updates">
      <UpdatesContent />
    </RoutePermissionGuard>
  );
}

function UpdatesContent() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState("...");

  const electronActive = isElectron();
  const bridge = getElectronBridge();

  // Read version from Electron on mount
  useEffect(() => {
    if (bridge?.app?.getVersion) {
      bridge.app
        .getVersion()
        .then((v: string) => setCurrentVersion(v))
        .catch(() => setCurrentVersion("unknown"));
    } else {
      setCurrentVersion("dev");
    }
  }, [bridge]);

  // Listen for update events from both update systems
  useEffect(() => {
    if (!bridge?.on) return;

    const unsubs: (() => void)[] = [];

    // App-content updater events (primary system)
    unsubs.push(
      bridge.on("app-update:available", (...args: unknown[]) => {
        const result = args[0] as
          | { updateAvailable?: boolean; remoteSha?: string }
          | undefined;
        if (result?.updateAvailable) {
          setStatus("available");
          setUpdateInfo({ version: result.remoteSha?.slice(0, 7) ?? "new" });
          setError(null);
          toast.info("A new version is available");
        } else {
          setStatus("up-to-date");
        }
      })
    );

    unsubs.push(
      bridge.on("app-update:progress", (...args: unknown[]) => {
        const progress = args[0] as
          | { phase?: string; message?: string; percent?: number }
          | undefined;
        if (!progress) return;
        if (progress.phase === "complete") {
          setStatus("downloaded");
          toast.success("Update installed! Restart to apply.");
        } else if (progress.phase === "error") {
          setStatus("error");
          setError(progress.message ?? "Update failed");
        } else {
          setStatus("downloading");
          if (progress.message) {
            setUpdateInfo((prev) => ({
              ...prev,
              releaseName: progress.message,
            }));
          }
        }
      })
    );

    unsubs.push(
      bridge.on("app-update:check-error", (...args: unknown[]) => {
        const msg = (args[0] as string) ?? "Update check failed";
        setStatus("error");
        setError(msg);
      })
    );

    // Shell updater events (secondary -- electron-updater for binary updates)
    unsubs.push(
      bridge.on("app:update-available", (...args: unknown[]) => {
        const info = args[0] as UpdateInfo;
        setStatus("downloading");
        setUpdateInfo(info);
        setError(null);
        toast.info(`Shell update ${info.version} is downloading...`);
      })
    );

    unsubs.push(
      bridge.on("app:update-downloaded", (...args: unknown[]) => {
        const info = args[0] as UpdateInfo;
        setStatus("downloaded");
        setUpdateInfo(info);
        toast.success(`Update ${info.version} ready to install`);
      })
    );

    unsubs.push(
      bridge.on("app:update-error", (...args: unknown[]) => {
        const msg = args[0] as string;
        // Only set error if not already showing a successful state
        setStatus((s) =>
          s === "downloading" || s === "downloaded" ? s : "error"
        );
        setError(msg);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [bridge]);

  async function handleCheckForUpdates() {
    if (!electronActive || !bridge) {
      toast.error("Updates are only available in the desktop app");
      return;
    }

    setStatus("checking");
    setError(null);
    setUpdateInfo(null);

    try {
      // Try app-content updater first (primary system)
      const result = (await bridge.invoke("app-update:check")) as {
        updateAvailable?: boolean;
      } | null;
      if (result === null) {
        // Updater not initialized or manifest missing -- try shell updater
        if (bridge.app?.checkForUpdates) {
          setStatus("checking");
          await bridge.app.checkForUpdates();
          // Give shell updater 8 seconds to respond
          setTimeout(() => {
            setStatus((s) => (s === "checking" ? "up-to-date" : s));
          }, 8000);
        } else {
          setStatus("error");
          setError(
            "Update system not available. This may be a development build."
          );
        }
      } else if (result && !result.updateAvailable) {
        setStatus("up-to-date");
      }
      // If updateAvailable, the event listener will handle it
    } catch (err: unknown) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to check for updates"
      );
    }
  }

  function handleRestart() {
    bridge?.invoke("app:quit");
  }

  async function handleInstallUpdate() {
    if (!bridge) return;
    try {
      // Try app-content updater first
      await bridge.invoke("app-update:install");
    } catch {
      // Fall back to shell updater
      if (bridge.app?.installUpdate) {
        try {
          await bridge.app.installUpdate();
        } catch (err: unknown) {
          toast.error(
            err instanceof Error ? err.message : "Failed to install update"
          );
        }
      }
    }
  }

  // Browser mode -- updates not applicable
  if (!electronActive) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Updates</h1>
          <p className="text-xs text-muted-foreground">
            Software update management
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Monitor className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Web Deployment
              </p>
              <p className="text-xs text-muted-foreground">
                Updates are managed via your deployment pipeline. This page is
                only available in the desktop app.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Updates</h1>
        <p className="text-xs text-muted-foreground">
          Check for and install application updates
        </p>
      </div>

      {/* Current Version Card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Info className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                ConvexPress
              </h2>
              <p className="text-xs text-muted-foreground">
                Version {currentVersion}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
            Desktop
          </span>
        </div>
      </div>

      {/* Update Status Card */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Software Update
        </h3>

        {/* Status Display */}
        {status === "idle" && (
          <p className="text-sm text-muted-foreground">
            Click the button below to check for updates.
          </p>
        )}

        {status === "checking" && (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-foreground">Checking for updates...</p>
          </div>
        )}

        {status === "up-to-date" && (
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-foreground">
                You're up to date
              </p>
              <p className="text-xs text-muted-foreground">
                ConvexPress {currentVersion} is the latest version.
              </p>
            </div>
          </div>
        )}

        {status === "available" && updateInfo && (
          <div className="flex items-center gap-3">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Update available: {updateInfo.version}
              </p>
              {updateInfo.releaseName && (
                <p className="text-xs text-muted-foreground">
                  {updateInfo.releaseName}
                </p>
              )}
            </div>
          </div>
        )}

        {status === "downloading" && (
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 animate-pulse text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {updateInfo?.releaseName ?? "Updating..."}
              </p>
              <p className="text-xs text-muted-foreground">
                The update is being installed.
              </p>
            </div>
          </div>
        )}

        {status === "downloaded" && (
          <div className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/10 p-4">
            <div>
              <p className="text-sm font-medium text-amber-600">
                Update installed
              </p>
              <p className="text-xs text-muted-foreground">
                Restart to apply the latest version.
              </p>
            </div>
            <button
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Restart Now
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Update check failed
                </p>
                <p className="text-xs text-muted-foreground">
                  {error || "An unknown error occurred."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {status === "downloaded" ? (
            <button
              onClick={handleRestart}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ArrowUpCircle className="h-4 w-4" />
              Restart Now
            </button>
          ) : status === "available" ? (
            <button
              onClick={handleInstallUpdate}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Install Update
            </button>
          ) : (
            <button
              onClick={handleCheckForUpdates}
              disabled={status === "checking" || status === "downloading"}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                status === "up-to-date"
                  ? "border border-border bg-transparent text-foreground hover:bg-muted"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {status === "checking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {status === "checking"
                ? "Checking..."
                : status === "up-to-date"
                  ? "Check Again"
                  : "Check for Updates"}
            </button>
          )}
        </div>
      </div>

      {/* Release Notes */}
      {updateInfo?.releaseNotes && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What's New
          </h3>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
            {updateInfo.releaseNotes}
          </pre>
        </div>
      )}

      {/* Auto-Update Info */}
      <p className="text-center text-xs text-muted-foreground">
        Updates are checked automatically every 4 hours. You'll be notified when
        an update is available.
      </p>
    </div>
  );
}
