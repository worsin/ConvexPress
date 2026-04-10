import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Receipt,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Check,
  X,
  Database,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/tax",
)({
  component: TaxRulesPage,
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRate(rate: number) {
  return `${rate.toFixed(2)}%`;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function TaxRulesPage() {
  const rules = useQuery(
    (api as any).commerce.tax.list,
    {},
  ) as any[] | undefined;

  const createRule = useMutation((api as any).commerce.tax.create);
  const updateRule = useMutation((api as any).commerce.tax.update);
  const toggleActive = useMutation((api as any).commerce.tax.toggleActive);
  const deleteRule = useMutation((api as any).commerce.tax.remove);
  const seedDefaults = useMutation((api as any).commerce.tax.seedDefaultTaxRules);

  // Create form state
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalPattern, setPostalPattern] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [priority, setPriority] = useState("10");
  const [isCompound, setIsCompound] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editPriority, setEditPriority] = useState("");

  function resetForm() {
    setName("");
    setCountryCode("");
    setStateCode("");
    setPostalPattern("");
    setRatePercent("");
    setPriority("10");
    setIsCompound(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !countryCode.trim() || !ratePercent.trim()) {
      toast.error("Name, country code, and rate are required.");
      return;
    }

    try {
      await createRule({
        name: name.trim(),
        countryCode: countryCode.trim(),
        stateCode: stateCode.trim() || undefined,
        postalCodePattern: postalPattern.trim() || undefined,
        ratePercent: parseFloat(ratePercent),
        priority: parseInt(priority) || 10,
        isCompound,
      });
      toast.success("Tax rule created.");
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create tax rule.");
    }
  }

  async function handleToggle(ruleId: string) {
    try {
      await toggleActive({ ruleId });
      toast.success("Tax rule toggled.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to toggle rule.");
    }
  }

  async function handleDelete(ruleId: string) {
    if (!confirm("Delete this tax rule?")) return;
    try {
      await deleteRule({ ruleId });
      toast.success("Tax rule deleted.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete rule.");
    }
  }

  function startEdit(rule: any) {
    setEditingId(rule._id);
    setEditName(rule.name);
    setEditRate(String(rule.ratePercent));
    setEditPriority(String(rule.priority));
  }

  async function saveEdit(ruleId: string) {
    try {
      await updateRule({
        ruleId,
        name: editName.trim(),
        ratePercent: parseFloat(editRate),
        priority: parseInt(editPriority) || 10,
      });
      toast.success("Tax rule updated.");
      setEditingId(null);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to update rule.");
    }
  }

  async function handleSeedDefaults() {
    if (!confirm("Seed default tax rules for US, CA, GB, DE, AU? This only works if no rules exist yet.")) return;
    try {
      const result = await seedDefaults({});
      toast.success(`${(result as any)?.created ?? 0} default tax rules created.`);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to seed defaults.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Tax Rules
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure tax rates by country, state, and postal code pattern.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSeedDefaults}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/80"
        >
          <Database className="h-4 w-4" />
          Seed Defaults
        </button>
      </div>

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Add Tax Rule
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. US - California"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Country Code
            </label>
            <input
              type="text"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              placeholder="e.g. US"
              maxLength={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              State Code (optional)
            </label>
            <input
              type="text"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              placeholder="e.g. CA"
              maxLength={5}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Postal Pattern (optional)
            </label>
            <input
              type="text"
              value={postalPattern}
              onChange={(e) => setPostalPattern(e.target.value)}
              placeholder="e.g. 90*"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Rate %
            </label>
            <input
              type="number"
              step="0.01"
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              placeholder="e.g. 7.25"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Priority
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="10"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isCompound}
                onChange={(e) => setIsCompound(e.target.checked)}
                className="rounded border-border"
              />
              Compound
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </form>

      {/* Rules table */}
      {rules === undefined ? (
        <p className="text-sm text-muted-foreground">Loading tax rules...</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            No tax rules configured yet. Use "Seed Defaults" to add common
            rules or add them manually above.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                  Active
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                  Country
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                  State
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                  Postal
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                  Rate
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">
                  Compound
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">
                  Priority
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule: any) => {
                const isEditing = editingId === rule._id;
                return (
                  <tr
                    key={rule._id}
                    className="border-b border-border last:border-0 hover:bg-muted/20"
                  >
                    {/* Toggle */}
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggle(rule._id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {rule.isActive ? (
                          <ToggleRight className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                    </td>

                    {/* Name */}
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                        />
                      ) : (
                        <span className="font-medium text-foreground">
                          {rule.name}
                        </span>
                      )}
                    </td>

                    {/* Country */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {rule.countryCode}
                    </td>

                    {/* State */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {rule.stateCode ?? "--"}
                    </td>

                    {/* Postal */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {rule.postalCodePattern ?? "--"}
                    </td>

                    {/* Rate */}
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-right"
                        />
                      ) : (
                        <span className="font-medium text-foreground">
                          {formatRate(rule.ratePercent)}
                        </span>
                      )}
                    </td>

                    {/* Compound */}
                    <td className="px-3 py-2.5 text-center text-muted-foreground">
                      {rule.isCompound ? "Yes" : "No"}
                    </td>

                    {/* Priority */}
                    <td className="px-3 py-2.5 text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value)}
                          className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-center"
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          {rule.priority}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(rule._id)}
                              className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(rule)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(rule._id)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
