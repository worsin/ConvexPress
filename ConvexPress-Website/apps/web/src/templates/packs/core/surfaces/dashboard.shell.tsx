/**
 * Core · dashboard.shell — the frame around every customer dashboard page.
 *
 * Full mode (Dashboard plugin enabled): sidebar / topbar / both per
 * `dashboardConfig`, mobile drawer, search, notification bell, theme toggle
 * and the profile menu. Compact mode (plugin disabled): the site header and
 * footer around a tabbed account page. Navigation, badges and the member
 * arrive through `data`; the loader (dashboard/DashboardShell.tsx) also
 * provides DashboardShellContext so widgets can read the same values.
 */
import type { ReactNode } from "react";

import { AccountLayout } from "@/dashboard/AccountLayout";
import type { NavItem } from "@/dashboard/nav";
import { FullShell } from "@/dashboard/shell/FullShell";
import type { DashboardConfig } from "@/lib/layout/types";
import type { UserProfile } from "@/lib/dashboard/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardShellSurfaceData {
  /** Resolved `dashboardConfig` (defaults merged). */
  config: DashboardConfig;
  /** True when the Dashboard plugin is disabled and the compact account frame renders. */
  compact: boolean;
  /** Sidebar navigation: assigned menu, else registry pages, else the settings-driven fallback. */
  sidebarNav: NavItem[];
  topbarNav: NavItem[];
  profileNav: NavItem[];
  /** Whether the sidebar came from an admin-assigned menu. */
  sidebarFromMenu: boolean;
  /** Live badge counters keyed by source ("notifications.unread", "orders.active", …). */
  badges: Record<string, number> | null;
  /** Unread notification count (from `badges`). */
  unreadCount: number;
  /** The signed-in member; null until the profile query answers. */
  user: UserProfile | null;
  /** Builds an href under the configured base path. */
  to: (path?: string) => string;
  children: ReactNode;
}

export default function CoreDashboardShell({ data }: SurfaceProps<DashboardShellSurfaceData>) {
  if (data.compact) return <AccountLayout>{data.children}</AccountLayout>;
  return <FullShell>{data.children}</FullShell>;
}
