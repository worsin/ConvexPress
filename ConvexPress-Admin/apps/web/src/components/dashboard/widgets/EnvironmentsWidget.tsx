/**
 * Dashboard System - Environments Widget (standalone shell only)
 *
 * Lists the selected website's environments with health, contract state,
 * and their Convex origin, and lets the operator open another one directly.
 * Reads from the control shell; renders nothing in single-site mode.
 */

import { ArrowRight } from "lucide-react";

import { HealthDot } from "@/components/shell/EnvironmentChip";
import {
  environmentDisplayName,
  environmentStatusText,
  isLiveEnvironment,
  originHostname,
} from "@/components/shell/environment-presentation";
import { useControlShell } from "@/control/ControlShellContext";
import { cn } from "@/lib/utils";

function EnvironmentsWidget() {
  const shell = useControlShell();
  if (!shell) return null;

  if (!shell.selectedWebsite || shell.websiteEnvironments.length === 0) {
    return (
      <div className="px-[18px] py-4 text-[13px] text-muted-foreground">
        This website has no environments attached yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {shell.websiteEnvironments.map((environment) => {
        const id = String(environment.instanceId);
        const current = id === shell.selection.instanceId;
        const live = isLiveEnvironment(environment);
        return (
          <div
            key={id}
            className="grid grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-border px-[18px] py-[11px] first:border-t-0 sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_70px]"
          >
            <span
              className={cn(
                "flex items-center gap-2.5 text-[13.5px] font-semibold",
                live ? "text-live" : "text-foreground",
              )}
            >
              <HealthDot environment={environment} />
              {environmentDisplayName(environment)}
            </span>
            <span className="truncate font-mono text-[12px] text-ink-2">
              {originHostname(environment.deploymentOrigin)}
            </span>
            <span className="hidden truncate text-[12.5px] text-muted-foreground sm:block">
              {environmentStatusText(environment)}
            </span>
            {current ? (
              <span className="justify-self-end text-[12.5px] font-medium text-muted-foreground">
                Open
              </span>
            ) : (
              <button
                type="button"
                onClick={() => shell.selectEnvironment(id)}
                className="inline-flex items-center gap-1 justify-self-end text-[12.5px] font-medium text-ink-2 hover:text-foreground"
              >
                Open <ArrowRight aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default EnvironmentsWidget;
