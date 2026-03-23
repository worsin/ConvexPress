/**
 * AuditFilterBar Component
 *
 * Filter controls for the Audit Log page.
 * Search input, severity/system/type dropdowns, date range, export & clear buttons.
 */

import { useState, useCallback, useEffect } from "react";
import {
  SearchIcon,
  DownloadIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuditSeverity, AuditObjectType } from "@/lib/audit/types";
import {
  SEVERITY_FILTER_OPTIONS,
  OBJECT_TYPE_FILTER_OPTIONS,
  SYSTEM_FILTER_OPTIONS,
} from "@/lib/audit/constants";
import { useDebounce } from "@/hooks/useDebounce";

interface AuditFilterBarProps {
  filters: {
    severity?: AuditSeverity;
    system?: string;
    objectType?: AuditObjectType;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onExportClick: () => void;
  onClearClick: () => void;
}

export function AuditFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  onExportClick,
  onClearClick,
}: AuditFilterBarProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  // Debounce the search value, then push to URL when it changes
  const debouncedSearch = useDebounce(searchValue, 300);

  useEffect(() => {
    onFilterChange("search", debouncedSearch || undefined);
  }, [debouncedSearch, onFilterChange]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value);
    },
    [],
  );

  const handleSearchClear = useCallback(() => {
    setSearchValue("");
    onFilterChange("search", undefined);
  }, [onFilterChange]);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search descriptions..."
          className="w-full h-8 pl-8 pr-8 text-xs border border-border rounded-none bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
          value={searchValue}
          onChange={handleSearchChange}
        />
        {searchValue && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={handleSearchClear}
          >
            <XIcon className="size-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Severity filter */}
      <select
        className="h-8 text-xs border border-border rounded-none px-2 bg-background text-foreground"
        value={filters.severity ?? ""}
        onChange={(e) =>
          onFilterChange("severity", e.target.value || undefined)
        }
      >
        {SEVERITY_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Object type filter */}
      <select
        className="h-8 text-xs border border-border rounded-none px-2 bg-background text-foreground"
        value={filters.objectType ?? ""}
        onChange={(e) =>
          onFilterChange("objectType", e.target.value || undefined)
        }
      >
        {OBJECT_TYPE_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* System filter */}
      <select
        className="h-8 text-xs border border-border rounded-none px-2 bg-background text-foreground"
        value={filters.system ?? ""}
        onChange={(e) =>
          onFilterChange("system", e.target.value || undefined)
        }
      >
        {SYSTEM_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Date from */}
      <input
        type="date"
        className="h-8 text-xs border border-border rounded-none px-2 bg-background text-foreground"
        value={filters.dateFrom ?? ""}
        onChange={(e) => {
          if (e.target.value) {
            const ts = new Date(e.target.value).getTime();
            onFilterChange("dateFrom", String(ts));
          } else {
            onFilterChange("dateFrom", undefined);
          }
        }}
        title="From date"
      />

      {/* Date to */}
      <input
        type="date"
        className="h-8 text-xs border border-border rounded-none px-2 bg-background text-foreground"
        value={filters.dateTo ?? ""}
        onChange={(e) => {
          if (e.target.value) {
            const ts = new Date(e.target.value).setHours(23, 59, 59, 999);
            onFilterChange("dateTo", String(ts));
          } else {
            onFilterChange("dateTo", undefined);
          }
        }}
        title="To date"
      />

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="xs" onClick={onClearFilters}>
          <XIcon className="size-3" />
          Clear
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export button */}
      <Button variant="outline" size="sm" onClick={onExportClick}>
        <DownloadIcon className="size-3.5 mr-1" />
        Export
      </Button>

      {/* Clear log button */}
      <Button variant="destructive" size="sm" onClick={onClearClick}>
        <Trash2Icon className="size-3.5 mr-1" />
        Clear Log
      </Button>
    </div>
  );
}
