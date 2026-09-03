/**
 * Environment switch — a small segmented pill listing the selected website's
 * environments (Live, Staging, Beta…). Lives in the topbar so switching a
 * database never grows the header. Live is filled oxblood and named.
 */

import { useControlShell } from "@/control/ControlShellContext";
import { cn } from "@/lib/utils";
import { HealthDot } from "./EnvironmentChip";
import {
  environmentDisplayName,
  environmentStatusText,
  isLiveEnvironment,
} from "./environment-presentation";

export function EnvironmentSwitch({ className }: { className?: string }) {
  const shell = useControlShell();
  if (!shell || !shell.selectedWebsite || shell.websiteEnvironments.length === 0) {
    return null;
  }
  const selectedId = shell.selection.instanceId;

  return (
    <div
      role="group"
      aria-label="Environment"
      aria-busy={shell.pending || undefined}
      className={cn(
        "app-no-drag flex max-w-[min(48vw,420px)] items-center gap-0.5 overflow-x-auto rounded-[11px] border border-border bg-surface-2 p-[3px]",
        className,
      )}
    >
      {shell.websiteEnvironments.map((environment) => {
        const id = String(environment.instanceId);
        const selected = id === selectedId;
        const live = isLiveEnvironment(environment);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            data-environment-kind={environment.kind}
            title={environmentStatusText(environment)}
            onClick={() => shell.selectEnvironment(id)}
            className={cn(
              "flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink-2 transition-colors",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              selected && !live && "bg-card text-foreground shadow-soft",
              selected && live && "bg-live-soft font-semibold text-live",
            )}
          >
            <HealthDot environment={environment} />
            {environmentDisplayName(environment)}
          </button>
        );
      })}
    </div>
  );
}
