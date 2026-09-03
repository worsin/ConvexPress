/**
 * Standalone frame — the shell shown while no isolated site admin is mounted
 * (nothing selected, switching, or session unavailable). It reuses the exact
 * sidebar chrome and topbar the site admin uses so the interface never jumps.
 */

import { useCallback, useState, type ReactNode } from "react";

import { EnvironmentChip } from "@/components/shell/EnvironmentChip";
import { EnvironmentMenu } from "@/components/shell/EnvironmentMenu";
import { EnvironmentSwitch } from "@/components/shell/EnvironmentSwitch";
import { ShellTopbar } from "@/components/shell/ShellTopbar";
import { SidebarChrome } from "@/components/shell/SidebarChrome";
import { useControlShell } from "@/control/ControlShellContext";
import { environmentIdentityLabel } from "@/control/components/EnvironmentBar";
import { LS_KEY_SIDEBAR_COLLAPSED } from "@/lib/admin-shell/constants";

function readCollapsed() {
  try {
    return localStorage.getItem(LS_KEY_SIDEBAR_COLLAPSED) === "true";
  } catch {
    return false;
  }
}

export function StandaloneFrame({ children }: { children: ReactNode }) {
  const shell = useControlShell();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = useCallback(() => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(LS_KEY_SIDEBAR_COLLAPSED, String(!value));
      } catch {
        // storage unavailable
      }
      return !value;
    });
  }, []);

  const website = shell?.selectedWebsite ?? null;
  const environment = shell?.selectedEnvironment ?? null;

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-background text-foreground">
      <SidebarChrome
        ariaLabel="Control navigation"
        collapsed={collapsed}
        onToggleCollapse={toggle}
        className="hidden md:flex"
      >
        {!collapsed && (
          <p className="px-4 pt-3 text-[12.5px] leading-5 text-muted-foreground">
            Pick a website to load its navigation here.
          </p>
        )}
      </SidebarChrome>
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellTopbar
          activeEnvironment={
            environment ? environmentIdentityLabel(website?.title ?? null, environment) : null
          }
          left={
            website ? (
              <>
                <span className="truncate text-[13.5px] font-medium text-ink-2">
                  {website.title}
                </span>
                {environment && <EnvironmentChip environment={environment} size="sm" />}
              </>
            ) : (
              <span className="text-[13.5px] text-muted-foreground">No environment selected</span>
            )
          }
          right={
            <>
              <EnvironmentSwitch className="hidden sm:flex" />
              <EnvironmentMenu />
            </>
          }
        />
        <main className="grid min-h-0 flex-1 place-items-center overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
