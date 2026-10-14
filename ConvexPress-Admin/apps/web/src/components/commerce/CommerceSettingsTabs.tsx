import { useLocation, useNavigate } from "@tanstack/react-router";

import { MotionTabs } from "@/components/ui/motion-tabs";
import { usePluginSettings } from "@/hooks/usePluginSettings";

const COMMERCE_SETTINGS_TABS = [
  { id: "/commerce/settings", label: "General" },
  { id: "/commerce/settings/shipping", label: "Shipping" },
  { id: "/commerce/settings/tax", label: "Tax" },
] as const;

const SHIPPING_SETTINGS_TABS = [
  { id: "/commerce/settings/shipping", label: "Overview" },
  { id: "/commerce/settings/shipping/zones", label: "Zones" },
  { id: "/commerce/settings/shipping/classes", label: "Classes" },
  { id: "/commerce/settings/shipping/packages", label: "Packages" },
  { id: "/commerce/settings/shipping/locations", label: "Locations" },
  { id: "/commerce/settings/shipping/rules", label: "Rules" },
  { id: "/commerce/settings/shipping/test-rates", label: "Test Rates" },
] as const;

const TAX_SETTINGS_TABS = [
  { id: "/commerce/settings/tax", label: "Rules" },
  { id: "/commerce/settings/tax/classes", label: "Classes" },
] as const;

function activeTabFor(
  pathname: string,
  tabs: ReadonlyArray<{ id: string; label: string }>,
) {
  const byLength = [...tabs].sort((a, b) => b.id.length - a.id.length);
  return byLength.find((tab) => pathname === tab.id || pathname.startsWith(`${tab.id}/`))?.id ?? tabs[0]?.id;
}

/** Tabs whose ids are route paths; a change navigates to the chosen one. */
function RouteTabs<T extends string>({ tabs }: { tabs: ReadonlyArray<{ id: T; label: string }> }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <MotionTabs
      tabs={[...tabs]}
      activeTab={activeTabFor(location.pathname, tabs)}
      onTabChange={(id) => {
        const tab = tabs.find((entry) => entry.id === id);
        if (tab) void navigate({ to: tab.id });
      }}
      className="max-w-full overflow-x-auto"
    />
  );
}

/** General, plus Shipping and Tax while the storefront (physical goods) is on. */
export function CommerceSettingsTabs() {
  const { isEnabled } = usePluginSettings();
  const tabs = isEnabled("commerceStorefront")
    ? COMMERCE_SETTINGS_TABS
    : COMMERCE_SETTINGS_TABS.filter((tab) => tab.id === "/commerce/settings");
  return <RouteTabs tabs={tabs} />;
}

export function ShippingSettingsTabs() {
  return <RouteTabs tabs={SHIPPING_SETTINGS_TABS} />;
}

export function TaxSettingsTabs() {
  return <RouteTabs tabs={TAX_SETTINGS_TABS} />;
}
