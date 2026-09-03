import { OperatorFooter } from "@/components/shell/OperatorFooter";

interface SidebarFooterProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Sidebar footer: signed-in identity, theme, and the collapse toggle. */
export function SidebarFooter({ collapsed, onToggle }: SidebarFooterProps) {
  return <OperatorFooter collapsed={collapsed} onToggleCollapse={onToggle} />;
}
