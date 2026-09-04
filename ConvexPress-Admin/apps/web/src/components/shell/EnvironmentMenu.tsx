/**
 * Environment options menu.
 *
 * Holds everything that used to sit in a full-width environment strip:
 * health and contract status, the public website link, local storefront
 * controls, site operations, transfer, and site management. Compact by
 * default, complete on demand.
 */

import {
  ExternalLink,
  History,
  MonitorPlay,
  MoreHorizontal,
  PackageOpen,
  ServerCog,
  Settings2,
  Square,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useControlShell } from "@/control/ControlShellContext";
import { environmentIdentityLabel } from "@/control/components/EnvironmentBar";
import {
  canRunLocalStorefronts,
  isLoopbackUrl,
  openSite,
  siteProcessKey,
  targetForEnvironment,
  useSiteRunner,
} from "@/lib/site-runner";
import { cn } from "@/lib/utils";
import { HealthDot } from "./EnvironmentChip";
import { LocalStorefrontsDialog } from "./LocalStorefrontsDialog";
import { environmentStatusText } from "./environment-presentation";

export function EnvironmentMenu({ className }: { className?: string }) {
  const shell = useControlShell();
  const runner = useSiteRunner();
  const [storefrontsOpen, setStorefrontsOpen] = useState(false);
  if (!shell) return null;
  const environment = shell.selectedEnvironment;
  const website = shell.selectedWebsite;
  const runnerAvailable = canRunLocalStorefronts();

  const localAddress = environment ? isLoopbackUrl(environment.siteOrigin) : false;
  const devProcess = environment ? runner.byKey.get(environment.instanceKey) ?? null : null;
  const previewProcess = environment
    ? runner.byKey.get(siteProcessKey({ instanceKey: environment.instanceKey, mode: "preview" })) ?? null
    : null;
  const devLive = devProcess?.status === "running" || devProcess?.status === "starting";
  const previewLive = previewProcess?.status === "running" || previewProcess?.status === "starting";

  const viewWebsite = async () => {
    if (!environment) return;
    const target = targetForEnvironment(environment, website);
    const starting = runnerAvailable && localAddress && !devLive;
    const pending = starting ? toast.loading(`Starting ${target.label}…`) : null;
    try {
      const result = await openSite(target);
      if (pending) toast.success(`Storefront running at ${result.url}`, { id: pending });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the website";
      if (pending) toast.error(message, { id: pending });
      else toast.error(message);
    }
  };

  const openPreview = async () => {
    if (!environment) return;
    const target = targetForEnvironment(environment, website, "preview");
    const pending = previewLive ? null : toast.loading(`Starting a local preview of ${target.label}…`);
    try {
      const result = await openSite(target);
      if (pending) toast.success(`Preview running at ${result.url}`, { id: pending });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the preview";
      if (pending) toast.error(message, { id: pending });
      else toast.error(message);
    }
  };

  const stopLocal = async () => {
    if (!environment) return;
    const keys = [devLive ? devProcess?.key : null, previewLive ? previewProcess?.key : null].filter(
      (key): key is string => Boolean(key),
    );
    await Promise.all(keys.map((key) => runner.stop(key)));
    toast.success("Local storefront stopped");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Environment options"
          className={cn(
            "app-no-drag relative inline-flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
            className,
          )}
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
          {(devLive || previewLive) && (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-success shadow-[0_0_0_2px_var(--background)]"
            />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-80">
          {environment ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-3 py-2.5">
                <span
                  aria-label="Active website environment"
                  className="block text-[13px] font-semibold text-foreground"
                >
                  {environmentIdentityLabel(website?.title ?? null, environment)}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <HealthDot environment={environment} />
                  {environmentStatusText(environment)}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                  {environment.siteOrigin}
                </span>
                {runnerAvailable && (devLive || previewLive) && (
                  <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-success">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                    Local server
                    {devLive && devProcess ? ` :${devProcess.port}` : ""}
                    {previewLive && previewProcess ? ` · preview :${previewProcess.port}` : ""}
                  </span>
                )}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-3 py-2.5 text-[12.5px]">
                No environment selected
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          )}
          <DropdownMenuSeparator />
          {environment && (
            <DropdownMenuItem onClick={() => void viewWebsite()}>
              <ExternalLink aria-hidden="true" />
              View website
              {runnerAvailable && localAddress && !devLive && (
                <span className="ml-auto text-[11px] text-muted-foreground">starts server</span>
              )}
            </DropdownMenuItem>
          )}
          {environment && runnerAvailable && (
            <DropdownMenuItem onClick={() => void openPreview()}>
              <MonitorPlay aria-hidden="true" />
              Open local preview
              {previewLive && previewProcess && (
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  :{previewProcess.port}
                </span>
              )}
            </DropdownMenuItem>
          )}
          {environment && runnerAvailable && (devLive || previewLive) && (
            <DropdownMenuItem onClick={() => void stopLocal()}>
              <Square aria-hidden="true" />
              Stop local server
            </DropdownMenuItem>
          )}
          {runnerAvailable && (
            <DropdownMenuItem onClick={() => setStorefrontsOpen(true)}>
              <ServerCog aria-hidden="true" />
              Local storefronts
              {runner.processes.some((p) => p.status === "running") && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {runner.processes.filter((p) => p.status === "running").length} running
                </span>
              )}
            </DropdownMenuItem>
          )}
          {shell.visibility.operations && (
            <DropdownMenuItem onClick={() => shell.setOpenPanel("operations")}>
              <History aria-hidden="true" />
              Site operations
            </DropdownMenuItem>
          )}
          {shell.visibility.handoff && (
            <DropdownMenuItem onClick={() => shell.setOpenPanel("handoff")}>
              <PackageOpen aria-hidden="true" />
              Transfer site
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              shell.openSites(
                website ? { type: "website", id: String(website.websiteId) } : undefined,
              )
            }
          >
            <Settings2 aria-hidden="true" />
            Manage sites
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {runnerAvailable && (
        <LocalStorefrontsDialog open={storefrontsOpen} onOpenChange={setStorefrontsOpen} />
      )}
    </>
  );
}
