import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, LayoutTemplate } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import {
  SETTINGS_GROUP_ORDER,
  SETTINGS_GROUPS,
  SETTINGS_REGISTRY,
  groupSettingsRegistry,
  type SettingsSaveMode,
  type SettingsSurfaceDefinition,
} from "@/lib/settings/registry";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/settings/")({
  component: SettingsOverviewPage,
});

function SettingsOverviewPage() {
  const { isLoading, isEnabled } = usePluginSettings();
  const grouped = groupSettingsRegistry();
  const missingCount = SETTINGS_REGISTRY.filter(
    (entry) => entry.status === "missing",
  ).length;
  const manualCount = SETTINGS_REGISTRY.filter(
    (entry) => entry.saveMode !== "autosave" && entry.status === "live",
  ).length;
  const autosaveCount = SETTINGS_REGISTRY.filter(
    (entry) => entry.saveMode === "autosave" && entry.status === "live",
  ).length;

  return (
    <div className="space-y-8 pb-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Settings Hub
          </h1>
          <p className="max-w-4xl text-sm text-muted-foreground">
            This is the canonical registry of admin settings surfaces. Cards
            marked as missing represent runtime settings that still need a
            first-class admin page. Cards marked as external still live outside
            the consolidated `/settings` area and should be migrated into this
            hub over time.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {SETTINGS_REGISTRY.length} tracked surfaces
          </Badge>
          <Badge variant="secondary">
            {autosaveCount} autosave
          </Badge>
          <Badge variant="outline">
            {manualCount} still manual
          </Badge>
          <Badge variant={missingCount > 0 ? "destructive" : "secondary"}>
            {missingCount} missing
          </Badge>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              Migration target
            </p>
            <p className="text-muted-foreground">
              Save buttons should disappear from normal settings surfaces.
              Autosave is already the standard on the core sections; the rest of
              the registry is now mapped so those pages can be migrated in
              order.
            </p>
          </div>
        </div>
      </div>

      {SETTINGS_GROUP_ORDER.map((groupId) => {
        const entries = grouped.get(groupId) ?? [];
        if (entries.length === 0) return null;

        return (
          <section key={groupId} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">
                {SETTINGS_GROUPS[groupId].title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {SETTINGS_GROUPS[groupId].description}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => (
                <SettingsSurfaceCard
                  key={entry.id}
                  entry={entry}
                  isLoading={isLoading}
                  pluginEnabled={
                    entry.pluginId ? isEnabled(entry.pluginId) : undefined
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SettingsSurfaceCard({
  entry,
  isLoading,
  pluginEnabled,
}: {
  entry: SettingsSurfaceDefinition;
  isLoading: boolean;
  pluginEnabled?: boolean;
}) {
  const Icon = entry.icon ?? LayoutTemplate;
  const sectionsLabel =
    entry.sections.length > 0 ? entry.sections.join(", ") : "No dedicated section";

  const card = (
    <Card
      className={cn(
        "h-full border-border transition-colors",
        entry.route
          ? "hover:border-primary/40 hover:bg-muted/20"
          : "border-dashed bg-muted/15",
      )}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <div>
              <CardTitle>{entry.title}</CardTitle>
            </div>
          </div>
          {entry.route ? (
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant={
              entry.status === "missing"
                ? "destructive"
                : entry.saveMode === "autosave"
                  ? "secondary"
                  : "outline"
            }
          >
            {getSaveModeLabel(entry.saveMode, entry.status)}
          </Badge>
          <Badge variant={entry.location === "central" ? "secondary" : "outline"}>
            {entry.location === "central" ? "Centralized" : "External surface"}
          </Badge>
          {entry.pluginId ? (
            <Badge
              variant={
                isLoading ? "outline" : pluginEnabled ? "secondary" : "outline"
              }
            >
              {isLoading
                ? "Plugin loading"
                : pluginEnabled
                  ? "Plugin enabled"
                  : "Plugin disabled"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <CardDescription>{entry.description}</CardDescription>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Route:</span>{" "}
            <span className="font-mono">
              {entry.route ?? "Missing settings page"}
            </span>
          </div>
          <div>
            <span className="font-medium text-foreground">Sections:</span>{" "}
            <span className="font-mono">{sectionsLabel}</span>
          </div>
        </div>

        {entry.notes ? (
          <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {entry.notes}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!entry.route) {
    return card;
  }

  return (
    <Link to={entry.route as any} className="block h-full">
      {card}
    </Link>
  );
}

function getSaveModeLabel(
  saveMode: SettingsSaveMode,
  status: SettingsSurfaceDefinition["status"],
) {
  if (status === "missing") return "Missing page";
  if (saveMode === "autosave") return "Autosave";
  if (saveMode === "mixed") return "Mixed behavior";
  return "Manual save";
}
