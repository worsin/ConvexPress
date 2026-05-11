/**
 * Settings Import/Export Component
 *
 * Provides:
 * - Export: Downloads all settings as a JSON file
 * - Import: Upload a JSON file, validate, show diff preview, selective import
 *
 * Uses real Convex queries/mutations:
 * - api.settings.queries.exportAll for export
 * - api.settings.mutations.importAll for import
 */

import * as React from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { Download, Upload, Check, X, AlertTriangle } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { sectionSchemas } from "@/lib/settings/schemas";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectionDiff {
  section: string;
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  selected: boolean;
}

// ─── Export Button ───────────────────────────────────────────────────────────

function ExportSettings() {
  const exportData = useQuery(api.settings.queries.exportAll);
  const [exporting, setExporting] = React.useState(false);

  const handleExport = React.useCallback(() => {
    if (!exportData) {
      toast.error("Settings data is not loaded yet.");
      return;
    }

    setExporting(true);

    try {
      // Format the exportedAt timestamp as ISO string for the JSON export file
      const dataForExport = {
        ...exportData,
        exportedAt: typeof exportData.exportedAt === "number"
          ? new Date(exportData.exportedAt).toISOString()
          : exportData.exportedAt,
      };
      const json = JSON.stringify(dataForExport, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `convexpress-settings-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Settings exported successfully.");
    } catch {
      toast.error("Failed to export settings.");
    } finally {
      setExporting(false);
    }
  }, [exportData]);

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting || !exportData}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-input bg-card hover:bg-accent rounded-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="h-3.5 w-3.5" />
      {exporting ? "Exporting..." : "Export Settings"}
    </button>
  );
}

// ─── Import Section ──────────────────────────────────────────────────────────

function ImportSettings() {
  const importAll = useMutation(api.settings.mutations.importAll);
  const currentSettings = useQuery(api.settings.queries.exportAll);

  const [importData, setImportData] = React.useState<Record<string, unknown> | null>(null);
  const [diffs, setDiffs] = React.useState<SectionDiff[]>([]);
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Compute diffs between imported and current settings
  const computeDiffs = React.useCallback(
    (incoming: Record<string, unknown>) => {
      if (!currentSettings) return [];

      const sections = ["general", "reading", "writing", "discussion", "permalinks", "privacy"];
      const currentMap = (currentSettings as Record<string, unknown>).settings as Record<string, Record<string, unknown>> | undefined;

      if (!currentMap) return [];

      const result: SectionDiff[] = [];

      for (const section of sections) {
        const incomingValues = (incoming.settings as Record<string, unknown>)?.[section] as Record<string, unknown> | undefined;
        const currentValues = currentMap[section] as Record<string, unknown> | undefined;

        if (!incomingValues) continue;

        const changes: SectionDiff["changes"] = [];
        const allKeys = new Set([
          ...Object.keys(incomingValues),
          ...Object.keys(currentValues ?? {}),
        ]);

        for (const key of allKeys) {
          const oldVal = currentValues?.[key];
          const newVal = incomingValues[key];

          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({ field: key, oldValue: oldVal, newValue: newVal });
          }
        }

        if (changes.length > 0) {
          result.push({ section, changes, selected: true });
        }
      }

      return result;
    },
    [currentSettings],
  );

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      setImportData(null);
      setDiffs([]);

      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".json")) {
        setError("Please select a JSON file.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);

          // Basic validation
          if (!data.settings && typeof data !== "object") {
            setError("Invalid settings file format. Expected a JSON object with a 'settings' key.");
            return;
          }

          // If no settings wrapper, treat the whole object as settings
          const normalized = data.settings ? data : { settings: data };

          // Validate each imported section against its Zod schema (Fix #158)
          const importedSettings = (normalized.settings ?? {}) as Record<string, unknown>;
          const validationWarnings: string[] = [];
          for (const [sectionKey, sectionValues] of Object.entries(importedSettings)) {
            const schema = sectionSchemas[sectionKey];
            if (!schema) {
              validationWarnings.push(`Unknown section: "${sectionKey}" (will be skipped).`);
              continue;
            }
            const result = schema.safeParse(sectionValues);
            if (!result.success) {
              const fieldErrors = result.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ");
              validationWarnings.push(`${sectionKey}: ${fieldErrors}`);
            }
          }

          if (validationWarnings.length > 0) {
            setError(
              `Validation warnings:\n${validationWarnings.join("\n")}\nYou may still import, but invalid fields may be rejected by the server.`,
            );
          }

          setImportData(normalized);
          setDiffs(computeDiffs(normalized));
        } catch {
          setError("Invalid JSON file. Please check the file format.");
        }
      };
      reader.readAsText(file);
    },
    [computeDiffs],
  );

  const toggleSection = React.useCallback((section: string) => {
    setDiffs((prev) =>
      prev.map((d) =>
        d.section === section ? { ...d, selected: !d.selected } : d,
      ),
    );
  }, []);

  const handleImport = React.useCallback(async () => {
    if (!importData) return;

    const selectedSections = diffs.filter((d) => d.selected);
    if (selectedSections.length === 0) {
      toast.error("No sections selected for import.");
      return;
    }

    setImporting(true);

    try {
      // Build the import payload with only selected sections
      const settingsToImport: Record<string, unknown> = {};
      const importSettings = (importData.settings ?? importData) as Record<string, unknown>;

      for (const diff of selectedSections) {
        settingsToImport[diff.section] = importSettings[diff.section];
      }

      await importAll({ data: { settings: settingsToImport } });

      toast.success(
        `Imported ${selectedSections.length} section${selectedSections.length > 1 ? "s" : ""} successfully.`,
      );

      // Reset state
      setImportData(null);
      setDiffs([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      toast.error("Failed to import settings.");
    } finally {
      setImporting(false);
    }
  }, [importData, diffs, importAll]);

  const handleCancel = React.useCallback(() => {
    setImportData(null);
    setDiffs([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-3">
      {/* File input */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="settings-import-file"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-input bg-card hover:bg-accent rounded-none transition-colors cursor-pointer"
        >
          <Upload className="h-3.5 w-3.5" />
          Choose File
        </label>
        <input
          ref={fileInputRef}
          id="settings-import-file"
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
        {importData && (
          <span className="text-xs text-muted-foreground">
            {diffs.length} section{diffs.length !== 1 ? "s" : ""} with changes
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Diff preview */}
      {diffs.length > 0 && (
        <div className="border border-input rounded-none">
          <div className="px-3 py-2 border-b border-input bg-muted/50">
            <p className="text-xs font-medium">Changes to Import</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select which sections to import. Uncheck sections to skip them.
            </p>
          </div>

          <div className="divide-y divide-input">
            {diffs.map((diff) => (
              <div key={diff.section} className="px-3 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={diff.selected}
                    onChange={() => toggleSection(diff.section)}
                    className="h-3.5 w-3.5 rounded-none border-input"
                  />
                  <span className="text-xs font-medium capitalize">
                    {diff.section}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({diff.changes.length} change{diff.changes.length !== 1 ? "s" : ""})
                  </span>
                </label>

                {/* Field-level changes */}
                <div className="ml-5.5 mt-1.5 space-y-1">
                  {diff.changes.map((change) => (
                    <div
                      key={change.field}
                      className="text-xs text-muted-foreground font-mono"
                    >
                      <span className="text-foreground">{change.field}:</span>{" "}
                      <span className="text-destructive line-through">
                        {formatValue(change.oldValue)}
                      </span>{" "}
                      <span className="text-primary">
                        {formatValue(change.newValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Import / Cancel buttons */}
          <div className="px-3 py-2 border-t border-input bg-muted/50 flex items-center gap-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || diffs.every((d) => !d.selected)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-3 w-3" />
              {importing ? "Importing..." : "Import Selected"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium border border-input bg-card hover:bg-accent rounded-none transition-colors"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* No changes message */}
      {importData && diffs.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">
          No differences found between the imported file and current settings.
        </p>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    if (value.length > 60) return `"${value.slice(0, 57)}..."`;
    return `"${value}"`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ImportExport() {
  return (
    <div className="space-y-6">
      {/* Export */}
      <div>
        <h3 className="text-xs font-medium mb-1.5">Export Settings</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Download all site settings as a JSON file. This can be used to
          transfer settings between sites or as a backup.
        </p>
        <ExportSettings />
      </div>

      {/* Divider */}
      <div className="border-t border-input" />

      {/* Import */}
      <div>
        <h3 className="text-xs font-medium mb-1.5">Import Settings</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Upload a previously exported settings JSON file. You can review
          changes before applying them.
        </p>
        <ImportSettings />
      </div>
    </div>
  );
}
