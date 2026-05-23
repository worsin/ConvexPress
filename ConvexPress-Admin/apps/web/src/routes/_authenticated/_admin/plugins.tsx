import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Puzzle, Power, PowerOff } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { useCan } from "@/hooks/useCan";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { getPluginDefinition, getPluginParent } from "@/lib/plugins/registry";

export const Route = createFileRoute("/_authenticated/_admin/plugins")({
  component: PluginsPage,
});

function PluginsPage() {
  const { isLoading } = useAuth();
  const canManageOptions = useCan("manage_options");
  const { isLoading: isPluginsLoading, plugins, values } = usePluginSettings();
  const updateSection = useMutation(api.settings.mutations.updateSection);

  if (isLoading || isPluginsLoading) {
    return null;
  }

  if (!canManageOptions) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Puzzle className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-2 text-lg font-semibold">Access Denied</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Only administrators can manage feature extensions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Extensions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enable or disable feature extensions. Disabled extensions are hidden
          from navigation and blocked at their admin routes.
        </p>
      </div>

      <div className="grid gap-4">
        {plugins.map((plugin) => {
          const parentId = getPluginParent(plugin.id);
          const parent = parentId ? getPluginDefinition(parentId) : null;
          const parentEnabled = parent ? Boolean(values[parent.settingsKey]) : true;
          const nextValues = {
            ...values,
            [plugin.settingsKey]: !plugin.enabled,
          };
          if (!plugin.enabled && parent) {
            nextValues[parent.settingsKey] = true;
          }
          if (plugin.id === "commerce" && plugin.enabled) {
            nextValues.commerceDigitalEnabled = false;
            nextValues.commerceReviewsEnabled = false;
            nextValues.commerceWishlistsEnabled = false;
            nextValues.commerceBundlesEnabled = false;
            nextValues.commerceReturnsEnabled = false;
            nextValues.commerceSubscriptionsEnabled = false;
          }

          return (
            <section
              key={plugin.id}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <plugin.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-medium text-foreground">
                        {plugin.title}
                      </h2>
                      <span
                        className={
                          plugin.enabled
                            ? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                            : "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {plugin.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {plugin.description}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Routes: {plugin.routePrefixes.join(", ")}
                    </p>
                    {parent && !parentEnabled ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Enabling this extension will also enable {parent.title}.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0">
                  <Button
                    variant={plugin.enabled ? "outline" : "default"}
                    onClick={() =>
                      void updateSection({
                        section: "plugins",
                        values: nextValues,
                      })
                    }
                  >
                    {plugin.enabled ? (
                      <>
                        <PowerOff className="mr-1 h-4 w-4" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Power className="mr-1 h-4 w-4" />
                        Enable
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
