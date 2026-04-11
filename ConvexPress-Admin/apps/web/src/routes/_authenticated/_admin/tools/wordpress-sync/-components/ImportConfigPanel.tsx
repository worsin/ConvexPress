/**
 * Import Configuration Panel
 *
 * Pre-import configuration with scope toggles and behavior options.
 * Disables scopes that require unavailable capabilities.
 */

import { useState } from "react";
import { AlertTriangleIcon, PlayIcon, EyeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Capabilities {
  wpRest: boolean;
  wpAuthValid: boolean;
  menusApi: boolean;
  woocommerceApi: boolean;
  wooAuthValid: boolean;
  customMetaEndpointDetected: boolean;
  elementorDetected: boolean;
  mediaAccessible: boolean;
}

interface ImportConfig {
  scope: Record<string, boolean>;
  behavior: Record<string, boolean>;
  filters: Record<string, unknown>;
}

interface ImportConfigPanelProps {
  capabilities: Capabilities | null;
  onStart: (config: ImportConfig) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const SCOPE_ITEMS = [
  { key: "wpContent", label: "WordPress Content (Posts, Pages, Users, Taxonomies)" },
  { key: "elementor", label: "Elementor Page Builder Data" },
  { key: "media", label: "Media Library" },
  { key: "menus", label: "Navigation Menus" },
  { key: "comments", label: "Comments" },
  { key: "wooCatalog", label: "WooCommerce Product Catalog" },
  { key: "wooCustomers", label: "WooCommerce Customers" },
  { key: "wooOrders", label: "WooCommerce Orders" },
  { key: "wooCoupons", label: "WooCommerce Coupons" },
  { key: "wooReviews", label: "WooCommerce Reviews" },
  { key: "cleanup", label: "Validation & Cleanup" },
] as const;

type ScopeKey = (typeof SCOPE_ITEMS)[number]["key"];

function getDefaultScope(capabilities: Capabilities | null): Record<ScopeKey, boolean> {
  return {
    wpContent: true,
    elementor: capabilities?.elementorDetected ?? false,
    media: capabilities?.mediaAccessible ?? true,
    menus: capabilities?.menusApi ?? true,
    comments: true,
    wooCatalog: capabilities?.woocommerceApi ?? false,
    wooCustomers: capabilities?.woocommerceApi ?? false,
    wooOrders: capabilities?.woocommerceApi ?? false,
    wooCoupons: capabilities?.woocommerceApi ?? false,
    wooReviews: capabilities?.woocommerceApi ?? false,
    cleanup: true,
  };
}

function isScopeDisabled(key: string, capabilities: Capabilities | null): boolean {
  if (!capabilities) return false;
  switch (key) {
    case "wooCatalog":
    case "wooCustomers":
    case "wooOrders":
    case "wooCoupons":
    case "wooReviews":
      return !capabilities.woocommerceApi || !capabilities.wooAuthValid;
    case "menus":
      return !capabilities.menusApi;
    case "elementor":
      return !capabilities.elementorDetected;
    case "media":
      return !capabilities.mediaAccessible;
    default:
      return !capabilities.wpRest || !capabilities.wpAuthValid;
  }
}

function getDisabledReason(key: string, capabilities: Capabilities | null): string | null {
  if (!capabilities) return null;
  switch (key) {
    case "wooCatalog":
    case "wooCustomers":
    case "wooOrders":
    case "wooCoupons":
    case "wooReviews":
      if (!capabilities.woocommerceApi) return "WooCommerce API not detected";
      if (!capabilities.wooAuthValid) return "WooCommerce authentication failed";
      return null;
    case "menus":
      return !capabilities.menusApi ? "Menus API not available" : null;
    case "elementor":
      return !capabilities.elementorDetected ? "Elementor not detected on this site" : null;
    case "media":
      return !capabilities.mediaAccessible ? "Media uploads not accessible" : null;
    default:
      if (!capabilities.wpRest) return "WordPress REST API not available";
      if (!capabilities.wpAuthValid) return "WordPress authentication failed";
      return null;
  }
}

export function ImportConfigPanel({
  capabilities,
  onStart,
  onCancel,
  isLoading,
}: ImportConfigPanelProps) {
  const [scope, setScope] = useState<Record<ScopeKey, boolean>>(
    getDefaultScope(capabilities),
  );

  const [behavior, setBehavior] = useState({
    dryRun: false,
    updateExisting: true,
    preserveLocalEdits: false,
    importDrafts: true,
  });

  const toggleScope = (key: ScopeKey) => {
    setScope((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleBehavior = (key: keyof typeof behavior) => {
    setBehavior((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStart = () => {
    onStart({ scope, behavior, filters: {} });
  };

  const hasAnyScope = Object.values(scope).some(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Import Scope */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Import Scope
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {SCOPE_ITEMS.map(({ key, label }) => {
              const disabled = isScopeDisabled(key, capabilities);
              const reason = getDisabledReason(key, capabilities);

              return (
                <label
                  key={key}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm ${
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:bg-muted/50"
                  }`}
                  title={disabled && reason ? reason : undefined}
                >
                  <input
                    type="checkbox"
                    checked={scope[key]}
                    disabled={disabled}
                    onChange={() => toggleScope(key)}
                    className="rounded border-border"
                  />
                  <span className="flex-1">{label}</span>
                  {disabled && (
                    <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Behavior */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Behavior
          </h3>
          <div className="space-y-1">
            <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={behavior.dryRun}
                onChange={() => toggleBehavior("dryRun")}
                className="rounded border-border"
              />
              <span>Dry run -- preview changes without writing data</span>
            </label>
            <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={behavior.updateExisting}
                onChange={() => toggleBehavior("updateExisting")}
                className="rounded border-border"
              />
              <span>Update existing mapped entities</span>
            </label>
            <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={behavior.preserveLocalEdits}
                onChange={() => toggleBehavior("preserveLocalEdits")}
                className="rounded border-border"
              />
              <span>Preserve local edits (skip locally-modified entities)</span>
            </label>
            <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={behavior.importDrafts}
                onChange={() => toggleBehavior("importDrafts")}
                className="rounded border-border"
              />
              <span>Import draft and unpublished content</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <Button
            onClick={handleStart}
            disabled={isLoading || !hasAnyScope}
          >
            {behavior.dryRun ? (
              <EyeIcon className="h-4 w-4 mr-2" />
            ) : (
              <PlayIcon className="h-4 w-4 mr-2" />
            )}
            {behavior.dryRun ? "Start Dry Run" : "Start Import"}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
