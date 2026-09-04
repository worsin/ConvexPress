/**
 * Settings page loader: the current member, handed to the `dashboard.settings`
 * surface (Core composes components/dashboard/settings/AccountSettingsForm).
 */
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CoreDashboardSettings, { type DashboardSettingsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.settings";
import { Surface } from "@/templates/sdk/Surface";

export function SettingsPage() {
  const { user, isLoading } = useCurrentUser();
  const data: DashboardSettingsSurfaceData = { user: user ?? null, isLoading };
  return <Surface name="dashboard.settings" data={data} fallback={CoreDashboardSettings} />;
}
