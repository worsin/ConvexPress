/**
 * Scope types shared by the control shell, the site switcher, and the site
 * manager panel. The four-select scope grid was replaced by the sidebar
 * `SiteSwitcher` (organization › business › website) plus the topbar
 * `EnvironmentSwitch`.
 */

export interface ScopeSelection {
  organizationId: string | null;
  businessId: string | null;
  websiteId: string | null;
  instanceId: string | null;
}

export interface ScopeContext {
  organizations: Array<{ organizationId: string; name: string }>;
  businesses: Array<{
    businessId: string;
    organizationId: string;
    name: string;
  }>;
  websites: Array<{
    websiteId: string;
    businessId: string;
    title: string;
    isDefault: boolean;
  }>;
  environments: Array<{
    instanceId: string;
    websiteId: string;
    kind: string;
    label: string | null;
    isDefault: boolean;
  }>;
}
