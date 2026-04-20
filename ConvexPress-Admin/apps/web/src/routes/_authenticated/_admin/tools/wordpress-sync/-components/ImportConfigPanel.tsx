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

type TombstoneMode = "never" | "mark_stale";

interface ImportBehavior {
  dryRun: boolean;
  updateExisting: boolean;
  preserveLocalEdits: boolean;
  importDrafts: boolean;
  importHistoricalOrders: boolean;
  importRefunds: boolean;
  importReviews: boolean;
  importCoupons: boolean;
  tombstoneMode: TombstoneMode;
  destructiveDelete: false;
}

interface ImportFilters {
  dateRangeStart?: number;
  dateRangeEnd?: number;
  entityLimit?: number;
}

interface FilterInputs {
  dateRangeStart: string;
  dateRangeEnd: string;
  entityLimit: string;
}

export interface ImportConfig {
  scope: Record<string, boolean>;
  behavior: ImportBehavior;
  filters: ImportFilters;
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

function getSanitizedScope(
  scope: Record<ScopeKey, boolean>,
  capabilities: Capabilities | null,
): Record<ScopeKey, boolean> {
  return SCOPE_ITEMS.reduce((result, { key }) => {
    result[key] = !isScopeDisabled(key, capabilities) && Boolean(scope[key]);
    return result;
  }, {} as Record<ScopeKey, boolean>);
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

  const [behavior, setBehavior] = useState<ImportBehavior>({
    dryRun: false,
    updateExisting: true,
    preserveLocalEdits: false,
    importDrafts: true,
    importHistoricalOrders: true,
    importRefunds: true,
    importReviews: true,
    importCoupons: true,
    tombstoneMode: "never" as TombstoneMode,
    destructiveDelete: false,
  });
  const [filterInputs, setFilterInputs] = useState<FilterInputs>({
    dateRangeStart: "",
    dateRangeEnd: "",
    entityLimit: "",
  });
  const [confirmLiveImport, setConfirmLiveImport] = useState(false);

  const toggleScope = (key: ScopeKey) => {
    setScope((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleBehavior = (
    key: Exclude<keyof ImportBehavior, "tombstoneMode" | "destructiveDelete">,
  ) => {
    setBehavior((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setTombstoneMode = (tombstoneMode: TombstoneMode) => {
    setBehavior((prev) => ({
      ...prev,
      tombstoneMode,
      destructiveDelete: false,
    }));
  };

  const updateFilter = (key: keyof FilterInputs, value: string) => {
    setFilterInputs((prev) => ({ ...prev, [key]: value }));
  };

  const buildFilters = (): ImportFilters => {
    const filters: ImportFilters = {};
    const limit = Number.parseInt(filterInputs.entityLimit, 10);

    if (Number.isFinite(limit) && limit > 0) {
      filters.entityLimit = limit;
    }
    if (filterInputs.dateRangeStart) {
      filters.dateRangeStart = new Date(`${filterInputs.dateRangeStart}T00:00:00`).getTime();
    }
    if (filterInputs.dateRangeEnd) {
      filters.dateRangeEnd = new Date(`${filterInputs.dateRangeEnd}T23:59:59.999`).getTime();
    }

    return filters;
  };

  const handleStart = () => {
    onStart({
      scope: getSanitizedScope(scope, capabilities),
      behavior,
      filters: buildFilters(),
    });
  };

  const sanitizedScope = getSanitizedScope(scope, capabilities);
  const hasAnyScope = Object.values(sanitizedScope).some(Boolean);
  const hasRequiredConnection =
    !capabilities || (capabilities.wpRest && capabilities.wpAuthValid);
  const requiresLiveConfirmation = !behavior.dryRun;
  const canStart =
    hasAnyScope &&
    hasRequiredConnection &&
    (!requiresLiveConfirmation || confirmLiveImport);
  const commerceEnabled =
    sanitizedScope.wooCustomers ||
    sanitizedScope.wooOrders ||
    sanitizedScope.wooCoupons ||
    sanitizedScope.wooReviews;

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
                    checked={sanitizedScope[key]}
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

        {/* Filters */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Filters
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="block mb-1.5 text-muted-foreground">
                Start date
              </span>
              <input
                type="date"
                value={filterInputs.dateRangeStart}
                onChange={(event) => updateFilter("dateRangeStart", event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="block mb-1.5 text-muted-foreground">
                End date
              </span>
              <input
                type="date"
                value={filterInputs.dateRangeEnd}
                onChange={(event) => updateFilter("dateRangeEnd", event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="block mb-1.5 text-muted-foreground">
                Entity limit
              </span>
              <input
                type="number"
                min={1}
                value={filterInputs.entityLimit}
                onChange={(event) => updateFilter("entityLimit", event.target.value)}
                placeholder="No limit"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        {/* Commerce Behavior */}
        {commerceEnabled && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Commerce Behavior
            </h3>
            <div className="space-y-1">
              <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={sanitizedScope.wooOrders && behavior.importHistoricalOrders}
                  disabled={!sanitizedScope.wooOrders}
                  onChange={() => toggleBehavior("importHistoricalOrders")}
                  className="rounded border-border"
                />
                <span>Import historical orders</span>
              </label>
              <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={sanitizedScope.wooOrders && behavior.importRefunds}
                  disabled={!sanitizedScope.wooOrders}
                  onChange={() => toggleBehavior("importRefunds")}
                  className="rounded border-border"
                />
                <span>Import order refunds</span>
              </label>
              <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={sanitizedScope.wooCoupons && behavior.importCoupons}
                  disabled={!sanitizedScope.wooCoupons}
                  onChange={() => toggleBehavior("importCoupons")}
                  className="rounded border-border"
                />
                <span>Import coupons</span>
              </label>
              <label className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={sanitizedScope.wooReviews && behavior.importReviews}
                  disabled={!sanitizedScope.wooReviews}
                  onChange={() => toggleBehavior("importReviews")}
                  className="rounded border-border"
                />
                <span>Import product reviews</span>
              </label>
            </div>
          </div>
        )}

        {/* Reconciliation */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Reconciliation
          </h3>
          <label className="block px-3 py-2 rounded-md text-sm">
            <span className="block mb-1.5 text-muted-foreground">
              Missing mapped entities
            </span>
            <select
              value={behavior.tombstoneMode}
              onChange={(event) =>
                setTombstoneMode(event.target.value as TombstoneMode)
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="never">Do not check for stale mappings</option>
              <option value="mark_stale">
                Report stale or orphaned mappings
              </option>
            </select>
          </label>
        </div>

        {!hasRequiredConnection && (
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            WordPress REST authentication must pass before an import can start.
          </div>
        )}

        {!behavior.dryRun && behavior.updateExisting && !behavior.preserveLocalEdits && (
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            Live import will update existing mapped content, products, customers,
            orders, coupons, and reviews when source hashes change.
          </div>
        )}

        {!behavior.dryRun && (
          <label className="flex items-start gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              checked={confirmLiveImport}
              onChange={() => setConfirmLiveImport((value) => !value)}
              className="mt-0.5 rounded border-border"
            />
            <span>
              I understand this import will write data to ConvexPress using the
              selected scope and behavior.
            </span>
          </label>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <Button
            onClick={handleStart}
            disabled={isLoading || !canStart}
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
