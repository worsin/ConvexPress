import { useLocation, useNavigate } from "@tanstack/react-router";

import { MotionTabs } from "@/components/ui/motion-tabs";

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

export function CommerceSettingsTabs() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <MotionTabs
      tabs={[...COMMERCE_SETTINGS_TABS]}
      activeTab={activeTabFor(location.pathname, COMMERCE_SETTINGS_TABS)}
      onTabChange={(to) => void navigate({ to: to as any })}
      className="max-w-full overflow-x-auto"
    />
  );
}

export function ShippingSettingsTabs() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <MotionTabs
      tabs={[...SHIPPING_SETTINGS_TABS]}
      activeTab={activeTabFor(location.pathname, SHIPPING_SETTINGS_TABS)}
      onTabChange={(to) => void navigate({ to: to as any })}
      className="max-w-full overflow-x-auto"
    />
  );
}

export function TaxSettingsTabs() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <MotionTabs
      tabs={[...TAX_SETTINGS_TABS]}
      activeTab={activeTabFor(location.pathname, TAX_SETTINGS_TABS)}
      onTabChange={(to) => void navigate({ to: to as any })}
      className="max-w-full overflow-x-auto"
    />
  );
}
