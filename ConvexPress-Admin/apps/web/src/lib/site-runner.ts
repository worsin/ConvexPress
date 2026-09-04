/**
 * Local storefront runner (renderer side).
 *
 * One ConvexPress-Website checkout serves every site. In the desktop app the
 * main process can start that checkout once per environment instance, each on
 * its own loopback port and Convex target. "View website" obeys the
 * environment's site address: a loopback address launches the storefront on
 * that port before opening it; any other address simply opens.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ControlEnvironment, ControlWebsite } from "@/control/ControlShellContext";
import { getElectronBridge, isElectron } from "@/lib/electron";

export type SiteRunnerMode = "dev" | "preview";

export interface SiteRunnerTarget {
  instanceKey: string;
  label: string;
  convexUrl: string;
  convexSiteUrl?: string;
  siteUrl?: string;
  adminAppUrl?: string;
  clerkPublishableKey?: string;
  mode?: SiteRunnerMode;
}

export type SiteProcessStatus = "starting" | "running" | "stopping" | "stopped" | "failed";

export interface SiteProcessState {
  key: string;
  instanceKey: string;
  label: string;
  mode: SiteRunnerMode;
  status: SiteProcessStatus;
  port: number;
  url: string;
  convexUrl: string;
  pid: number | null;
  startedAt: number | null;
  exitCode: number | null;
  error: string | null;
  lastLogLine: string | null;
}

export interface SiteRunnerConfigView {
  websiteRepoPath: string | null;
  source: "config" | "env" | "sibling" | "none";
  configuredPath: string | null;
  ports: Record<string, number>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"]);

export function isLoopbackUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function siteProcessKey(target: Pick<SiteRunnerTarget, "instanceKey" | "mode">): string {
  return target.mode === "preview" ? `${target.instanceKey}#preview` : target.instanceKey;
}

/** The runner can only act inside the desktop app. */
export function canRunLocalStorefronts(): boolean {
  return isElectron() && !!getElectronBridge()?.siteRunner;
}

function adminAppUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.origin;
}

/** Build the runner target for a control-plane environment. */
export function targetForEnvironment(
  environment: ControlEnvironment,
  website: ControlWebsite | null,
  mode: SiteRunnerMode = "dev",
): SiteRunnerTarget {
  const envLabel = environment.label || environment.kind;
  return {
    instanceKey: environment.instanceKey,
    label: website ? `${website.title} — ${envLabel}` : envLabel,
    convexUrl: environment.deploymentOrigin,
    convexSiteUrl: environment.managementOrigin,
    siteUrl: environment.siteOrigin,
    adminAppUrl: adminAppUrl(),
    clerkPublishableKey:
      (environment as { clerkPublishableKey?: string | null }).clerkPublishableKey ?? undefined,
    mode,
  };
}

/** Build the runner target for a single-site admin (no control plane). */
export function targetForSingleSite(input: {
  siteTitle: string;
  siteUrl: string | undefined;
  convexUrl: string;
  convexSiteUrl?: string;
  clerkPublishableKey?: string | null;
  mode?: SiteRunnerMode;
}): SiteRunnerTarget {
  return {
    instanceKey: "single-site",
    label: input.siteTitle,
    convexUrl: input.convexUrl,
    convexSiteUrl: input.convexSiteUrl,
    siteUrl: input.siteUrl,
    adminAppUrl: adminAppUrl(),
    clerkPublishableKey: input.clerkPublishableKey ?? undefined,
    mode: input.mode ?? "dev",
  };
}

/**
 * Open a site the way "View website" should: through the runner when the
 * address is local and we are in the desktop app, otherwise as a plain link.
 */
export async function openSite(target: SiteRunnerTarget): Promise<{ launched: boolean; url: string }> {
  const bridge = getElectronBridge();
  const wantsRunner = target.mode === "preview" || isLoopbackUrl(target.siteUrl);
  if (bridge?.siteRunner && wantsRunner) {
    const result = await bridge.siteRunner.open(target);
    return { launched: result.launched, url: result.url };
  }
  const url = target.siteUrl;
  if (!url) throw new Error("This environment has no site address yet.");
  if (bridge?.siteRunner) {
    await bridge.siteRunner.openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return { launched: false, url };
}

/** Live view of every local storefront process plus runner configuration. */
export function useSiteRunner() {
  const enabled = canRunLocalStorefronts();
  const [processes, setProcesses] = useState<SiteProcessState[]>([]);
  const [config, setConfig] = useState<SiteRunnerConfigView | null>(null);

  const refresh = useCallback(async () => {
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner) return;
    const [list, cfg] = await Promise.all([
      bridge.siteRunner.list(),
      bridge.siteRunner.getConfig(),
    ]);
    setProcesses(list);
    setConfig(cfg);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const bridge = getElectronBridge();
    const unsubscribe = bridge?.siteRunner?.onChanged((state) => {
      setProcesses((current) => {
        const next = current.filter((entry) => entry.key !== state.key);
        next.push(state);
        next.sort((a, b) => a.label.localeCompare(b.label));
        return next;
      });
    });
    return () => unsubscribe?.();
  }, [enabled, refresh]);

  const byKey = useMemo(() => new Map(processes.map((entry) => [entry.key, entry])), [processes]);

  const start = useCallback(async (target: SiteRunnerTarget) => {
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner) throw new Error("Local storefronts need the desktop app.");
    return bridge.siteRunner.start(target);
  }, []);

  const stop = useCallback(async (key: string) => {
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner) return null;
    return bridge.siteRunner.stop(key);
  }, []);

  const restart = useCallback(async (target: SiteRunnerTarget) => {
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner) throw new Error("Local storefronts need the desktop app.");
    return bridge.siteRunner.restart(target);
  }, []);

  const forget = useCallback(async (key: string) => {
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner) return;
    setProcesses(await bridge.siteRunner.forget(key));
  }, []);

  const logs = useCallback(async (key: string) => {
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner) return [];
    return bridge.siteRunner.logs(key);
  }, []);

  const setWebsiteRepoPath = useCallback(
    async (websiteRepoPath: string | null) => {
      const bridge = getElectronBridge();
      if (!bridge?.siteRunner) return;
      await bridge.siteRunner.setConfig({ websiteRepoPath });
      await refresh();
    },
    [refresh],
  );

  const pickWebsiteRepo = useCallback(async () => {
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner) return;
    const result = await bridge.siteRunner.pickRepo();
    if (!result.cancelled) await refresh();
  }, [refresh]);

  return {
    enabled,
    processes,
    byKey,
    config,
    refresh,
    start,
    stop,
    restart,
    forget,
    logs,
    setWebsiteRepoPath,
    pickWebsiteRepo,
  };
}
