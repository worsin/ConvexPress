/**
 * Local storefronts dialog.
 *
 * Every storefront process the desktop app has started from the shared
 * ConvexPress-Website checkout: which site and database it serves, its port,
 * its status, and its recent output. Also where the checkout lives.
 */

import { ExternalLink, FolderOpen, RefreshCw, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useControlShell } from "@/control/ControlShellContext";
import {
  openSite,
  targetForEnvironment,
  useSiteRunner,
  type SiteProcessState,
  type SiteProcessStatus,
} from "@/lib/site-runner";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<SiteProcessStatus, string> = {
  running: "bg-success-soft text-success",
  starting: "bg-warning-soft text-warning",
  stopping: "bg-warning-soft text-warning",
  stopped: "bg-surface-2 text-muted-foreground border border-border",
  failed: "bg-live-soft text-destructive",
};

const STATUS_LABEL: Record<SiteProcessStatus, string> = {
  running: "Running",
  starting: "Starting",
  stopping: "Stopping",
  stopped: "Stopped",
  failed: "Failed",
};

function StatusPill({ status }: { status: SiteProcessStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em]",
        STATUS_TONE[status],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full bg-current",
          (status === "starting" || status === "stopping") && "animate-pulse",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function ProcessRow({
  process,
  selected,
  onSelect,
  onStop,
  onRestart,
  onForget,
  onOpen,
}: {
  process: SiteProcessState;
  selected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onRestart: () => void;
  onForget: () => void;
  onOpen: () => void;
}) {
  const live = process.status === "running" || process.status === "starting";
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        selected ? "border-line-strong bg-card shadow-soft" : "border-border bg-surface-2/60 hover:bg-surface-2",
      )}
    >
      <button type="button" className="min-w-0 text-left" onClick={onSelect}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-foreground">{process.label}</span>
          {process.mode === "preview" && (
            <span className="shrink-0 rounded-md bg-primary-soft px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">
              Preview
            </span>
          )}
          <StatusPill status={process.status} />
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11.5px] text-muted-foreground">
          {process.url} → {process.convexUrl}
        </span>
        {process.error && (
          <span className="mt-0.5 block truncate text-[12px] text-destructive">{process.error}</span>
        )}
      </button>
      <span className="flex shrink-0 items-center gap-1">
        {live && (
          <Button size="icon-sm" variant="ghost" aria-label={`Open ${process.label}`} onClick={onOpen}>
            <ExternalLink />
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label={`Restart ${process.label}`} onClick={onRestart}>
          <RefreshCw />
        </Button>
        {live ? (
          <Button size="icon-sm" variant="ghost" aria-label={`Stop ${process.label}`} onClick={onStop}>
            <Square />
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${process.label}`} onClick={onForget}>
            <Trash2 />
          </Button>
        )}
      </span>
    </li>
  );
}

export function LocalStorefrontsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shell = useControlShell();
  const runner = useSiteRunner();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const selected = selectedKey ? runner.byKey.get(selectedKey) ?? null : null;

  useEffect(() => {
    if (!open) return;
    void runner.refresh();
  }, [open, runner.refresh]);

  useEffect(() => {
    if (!open || !selectedKey) return;
    let cancelled = false;
    const load = async () => {
      const lines = await runner.logs(selectedKey);
      if (!cancelled) setLogLines(lines);
    };
    void load();
    const timer = window.setInterval(load, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, selectedKey, runner.logs, selected?.lastLogLine]);

  const environmentsByKey = new Map(
    (shell?.context.environments ?? []).map((environment) => [environment.instanceKey, environment]),
  );

  const restart = async (process: SiteProcessState) => {
    const environment = environmentsByKey.get(process.instanceKey);
    if (!environment) {
      toast.error("That environment is no longer in scope, so it cannot be restarted from here.");
      return;
    }
    const website = shell?.context.websites.find(
      (entry) => String(entry.websiteId) === String(environment.websiteId),
    ) ?? null;
    try {
      await runner.restart(targetForEnvironment(environment, website, process.mode));
      toast.success(`Restarted ${process.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restart failed");
    }
  };

  const openProcess = async (process: SiteProcessState) => {
    const environment = environmentsByKey.get(process.instanceKey);
    const website = environment
      ? shell?.context.websites.find(
          (entry) => String(entry.websiteId) === String(environment.websiteId),
        ) ?? null
      : null;
    try {
      if (environment) {
        await openSite(targetForEnvironment(environment, website, process.mode));
      } else {
        await openSite({ instanceKey: process.instanceKey, label: process.label, convexUrl: process.convexUrl, siteUrl: process.url });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the site");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Local storefronts</DialogTitle>
          <DialogDescription>
            One ConvexPress-Website checkout, started once per environment. Each process has its own
            port and its own database.
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="eyebrow">Website checkout</span>
              <span className="mt-0.5 block truncate font-mono text-[12px] text-foreground">
                {runner.config?.websiteRepoPath ?? "Not found — choose the ConvexPress-Website folder"}
              </span>
              {runner.config?.source === "sibling" && (
                <span className="text-[11.5px] text-muted-foreground">Found next to this app.</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => void runner.pickWebsiteRepo()}>
                <FolderOpen data-icon="inline-start" /> Choose folder
              </Button>
              {runner.config?.configuredPath && (
                <Button size="sm" variant="ghost" onClick={() => void runner.setWebsiteRepoPath(null)}>
                  Use default
                </Button>
              )}
            </div>
          </div>
        </section>

        {runner.processes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
            No storefront is running. Use "View website" on an environment whose site address is
            local, or "Open local preview", to start one.
          </p>
        ) : (
          <ul className="grid gap-2">
            {runner.processes.map((process) => (
              <ProcessRow
                key={process.key}
                process={process}
                selected={selectedKey === process.key}
                onSelect={() => setSelectedKey(process.key)}
                onStop={() => void runner.stop(process.key)}
                onRestart={() => void restart(process)}
                onForget={() => void runner.forget(process.key)}
                onOpen={() => void openProcess(process)}
              />
            ))}
          </ul>
        )}

        {selected && (
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="eyebrow">Output · {selected.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {selected.pid ? `pid ${selected.pid}` : ""}
              </span>
            </div>
            <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-[11.5px] leading-5 text-ink-2">
              {logLines.length ? logLines.join("\n") : "No output yet."}
            </pre>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
