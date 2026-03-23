/**
 * Capability Editor Component
 *
 * Displays all 138 capabilities grouped by domain (Posts, Pages, Media, etc.)
 * with toggle switches for each capability and a "Toggle All" control per group.
 *
 * WordPress equivalent: User Role Editor plugin's capability matrix.
 *
 * Props:
 *   - capabilities: string[] - Currently enabled capabilities
 *   - onChange: (capabilities: string[]) => void - Called when capabilities change
 *   - disabled?: boolean - Whether editing is disabled
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";

import { CAPABILITY_DOMAINS } from "@backend/convex/types/capabilities";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface CapabilityEditorProps {
  /** Currently enabled capabilities */
  capabilities: string[];
  /** Called when capabilities change */
  onChange: (capabilities: string[]) => void;
  /** Whether editing is disabled */
  disabled?: boolean;
}

export function CapabilityEditor({
  capabilities,
  onChange,
  disabled = false,
}: CapabilityEditorProps) {
  const capSet = useMemo(() => new Set(capabilities), [capabilities]);
  const [search, setSearch] = useState("");

  // Filter domains and capabilities by search term
  const filteredDomains = useMemo(() => {
    if (!search.trim()) return CAPABILITY_DOMAINS;
    const term = search.toLowerCase();
    const result: Record<string, string[]> = {};
    for (const [domain, caps] of Object.entries(CAPABILITY_DOMAINS)) {
      // Match on domain name or capability string
      if (domain.toLowerCase().includes(term)) {
        result[domain] = caps;
      } else {
        const matched = caps.filter((cap) => cap.toLowerCase().includes(term));
        if (matched.length > 0) {
          result[domain] = matched;
        }
      }
    }
    return result;
  }, [search]);

  const toggleCapability = useCallback(
    (cap: string) => {
      if (disabled) return;
      const next = new Set(capSet);
      if (next.has(cap)) {
        next.delete(cap);
      } else {
        next.add(cap);
      }
      onChange(Array.from(next));
    },
    [capSet, onChange, disabled],
  );

  const toggleDomain = useCallback(
    (domainCaps: string[]) => {
      if (disabled) return;
      const allEnabled = domainCaps.every((cap) => capSet.has(cap));
      const next = new Set(capSet);
      if (allEnabled) {
        // Remove all capabilities in this domain
        for (const cap of domainCaps) {
          next.delete(cap);
        }
      } else {
        // Add all capabilities in this domain
        for (const cap of domainCaps) {
          next.add(cap);
        }
      }
      onChange(Array.from(next));
    },
    [capSet, onChange, disabled],
  );

  const totalEnabled = capabilities.length;
  const totalAvailable = Object.values(CAPABILITY_DOMAINS).reduce(
    (sum, caps) => sum + caps.length,
    0,
  );

  return (
    <div className="space-y-1">
      {/* Search filter */}
      <div className="relative mb-2">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter capabilities..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between py-2 mb-2 border-b border-border">
        <span className="text-xs text-muted-foreground">
          {totalEnabled} of {totalAvailable} capabilities enabled
          {search.trim() && (
            <span className="ml-1">
              ({Object.values(filteredDomains).reduce((sum, caps) => sum + caps.length, 0)} shown)
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs text-primary hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={() => {
              const all = Object.values(CAPABILITY_DOMAINS).flat();
              onChange(all);
            }}
          >
            Enable All
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            type="button"
            className="text-xs text-primary hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Disable All
          </button>
        </div>
      </div>

      {/* Domain Groups */}
      {Object.entries(filteredDomains).map(([domain, domainCaps]) => (
        <CapabilityDomainGroup
          key={domain}
          domain={domain}
          capabilities={domainCaps}
          enabledCaps={capSet}
          onToggleCapability={toggleCapability}
          onToggleDomain={() => toggleDomain(domainCaps)}
          disabled={disabled}
        />
      ))}

      {/* Empty state when search has no matches */}
      {search.trim() && Object.keys(filteredDomains).length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No capabilities match &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  );
}

// --- Domain Group ---

interface CapabilityDomainGroupProps {
  domain: string;
  capabilities: string[];
  enabledCaps: Set<string>;
  onToggleCapability: (cap: string) => void;
  onToggleDomain: () => void;
  disabled: boolean;
}

function CapabilityDomainGroup({
  domain,
  capabilities,
  enabledCaps,
  onToggleCapability,
  onToggleDomain,
  disabled,
}: CapabilityDomainGroupProps) {
  const enabledCount = capabilities.filter((cap) => enabledCaps.has(cap)).length;
  const allEnabled = enabledCount === capabilities.length;
  const someEnabled = enabledCount > 0 && !allEnabled;

  // Collapsible state - domains with many capabilities start collapsed
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-border">
      {/* Domain Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
          {domain}
        </button>

        <span className="text-[10px] text-muted-foreground">
          ({enabledCount}/{capabilities.length})
        </span>

        <div className="ml-auto">
          <Checkbox
            checked={allEnabled}
            indeterminate={someEnabled}
            onCheckedChange={onToggleDomain}
            disabled={disabled}
            aria-label={`Toggle all ${domain} capabilities`}
          />
        </div>
      </div>

      {/* Capability Items */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-border">
          {capabilities.map((cap) => (
            <CapabilityItem
              key={cap}
              capability={cap}
              enabled={enabledCaps.has(cap)}
              onToggle={() => onToggleCapability(cap)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Individual Capability ---

interface CapabilityItemProps {
  capability: string;
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
}

function CapabilityItem({
  capability,
  enabled,
  onToggle,
  disabled,
}: CapabilityItemProps) {
  // Format capability string: "post.create" -> "Create"
  const parts = capability.split(".");
  const action = parts.slice(1).join(".");
  const label = action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <label
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 cursor-pointer border-b border-r border-border transition-colors",
        enabled ? "bg-primary/5" : "hover:bg-muted/30",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <Checkbox
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <div className="min-w-0 flex-1">
        <span className="text-xs text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">
          {capability}
        </span>
      </div>
    </label>
  );
}

