/**
 * Environment options menu.
 *
 * Holds everything that used to sit in a full-width environment strip:
 * health and contract status, the public website link, site operations,
 * transfer, and site management. Compact by default, complete on demand.
 */

import {
  ExternalLink,
  History,
  MoreHorizontal,
  PackageOpen,
  Settings2,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import { HealthDot } from "./EnvironmentChip";
import { environmentStatusText } from "./environment-presentation";

export function EnvironmentMenu({ className }: { className?: string }) {
  const shell = useControlShell();
  if (!shell) return null;
  const environment = shell.selectedEnvironment;
  const website = shell.selectedWebsite;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Environment options"
        className={cn(
          "app-no-drag inline-flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
          className,
        )}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72">
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
          <DropdownMenuItem
            render={
              <a href={environment.siteOrigin} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink aria-hidden="true" />
            View website
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
        <DropdownMenuItem onClick={() => shell.setOpenPanel("manager")}>
          <Settings2 aria-hidden="true" />
          Manage sites
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
