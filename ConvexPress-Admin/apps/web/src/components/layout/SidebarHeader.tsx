import { SidebarBrandRow } from "@/components/shell/SidebarChrome";

interface SidebarHeaderProps {
  collapsed: boolean;
}

/** Brand row at the top of the sidebar. Shared chrome lives in SidebarChrome. */
export function SidebarHeader({ collapsed }: SidebarHeaderProps) {
  return <SidebarBrandRow collapsed={collapsed} />;
}
