import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Puzzle } from "lucide-react";

import { usePluginSettings } from "@/hooks/usePluginSettings";
import type { AdminPluginId } from "@/lib/plugins/registry";
import Loader from "@/components/loader";

interface PluginGuardProps {
  pluginId: AdminPluginId;
  children: ReactNode;
}

export function PluginGuard({ pluginId, children }: PluginGuardProps) {
  const { isLoading, plugins, isEnabled } = usePluginSettings();
  const plugin = plugins.find((entry) => entry.id === pluginId);

  if (isLoading) {
    return <Loader />;
  }

  if (!isEnabled(pluginId)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Puzzle className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-2 text-lg font-semibold">
          {plugin?.title ?? "Extension"} Disabled
        </h1>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">
          This feature is installed but currently disabled. Re-enable it from the
          Extensions screen to make it available in the admin again.
        </p>
        <Link
          to="/plugins"
          className="inline-flex items-center px-4 py-2 text-sm font-medium border border-input bg-card hover:bg-accent transition-colors"
        >
          Manage Extensions
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
