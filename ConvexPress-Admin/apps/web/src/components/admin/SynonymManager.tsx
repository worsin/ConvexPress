/**
 * Synonym Manager
 *
 * Admin CRUD interface for managing search synonym groups.
 * Each synonym group maps a primary term to equivalent terms for query expansion.
 *
 * Features:
 *   - List all synonym groups with term and synonyms
 *   - Add new synonym group (term + comma-separated synonyms)
 *   - Toggle active/inactive
 *   - Delete with confirmation
 */

import * as React from "react";
import { useTransition } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { Plus, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";

interface SynonymManagerProps {
  className?: string;
}

interface SynonymRow {
  _id: Id<"searchSynonyms">;
  term: string;
  synonyms: string[];
  isActive: boolean;
}

export function SynonymManager({ className }: SynonymManagerProps) {
  const synonyms = useQuery(api.search.queries.listSynonyms) as SynonymRow[] | undefined;
  const createSynonym = useMutation(api.search.mutations.createSynonym);
  const updateSynonym = useMutation(api.search.mutations.updateSynonym);
  const deleteSynonym = useMutation(api.search.mutations.deleteSynonym);

  // ─── New synonym form state ───────────────────────────────────────────
  const [showForm, setShowForm] = React.useState(false);
  const [newTerm, setNewTerm] = React.useState("");
  const [newSynonyms, setNewSynonyms] = React.useState("");
  const [isSubmitting, startCreateTransition] = useTransition();

  // ─── Delete confirmation ──────────────────────────────────────────────
  const [deleteId, setDeleteId] = React.useState<Id<"searchSynonyms"> | null>(null);

  const handleCreate = () => {
    const term = newTerm.trim();
    const synArray = newSynonyms
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!term) {
      toast.error("Term is required");
      return;
    }
    if (synArray.length === 0) {
      toast.error("At least one synonym is required");
      return;
    }

    startCreateTransition(async () => {
      try {
        await createSynonym({ term, synonyms: synArray });
        toast.success(`Synonym group "${term}" created`);
        setNewTerm("");
        setNewSynonyms("");
        setShowForm(false);
      } catch (err: unknown) {
        const message = getErrorMessage(err, "Failed to create synonym");
        toast.error(message);
      }
    });
  };

  const handleToggle = async (id: Id<"searchSynonyms">, currentActive: boolean) => {
    try {
      await updateSynonym({ synonymId: id, isActive: !currentActive });
      toast.success(currentActive ? "Synonym group deactivated" : "Synonym group activated");
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string }; message?: string })?.data?.message ?? "Failed to update synonym");
    }
  };

  const handleDelete = async (id: Id<"searchSynonyms">) => {
    try {
      await deleteSynonym({ synonymId: id });
      toast.success("Synonym group deleted");
      setDeleteId(null);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string }; message?: string })?.data?.message ?? "Failed to delete synonym");
    }
  };

  if (synonyms === undefined) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <div className="h-48 animate-pulse rounded-sm border border-border bg-muted/50" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Synonym Groups</h3>
          <p className="text-xs text-muted-foreground">
            When users search for any term in a group, results for all synonyms are included.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {showForm ? (
            <>
              <X className="size-3.5" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Add Synonym Group
            </>
          )}
        </button>
      </div>

      {/* New Synonym Form */}
      {showForm && (
        <div className="rounded-sm border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="new-term" className="text-xs font-medium">
                Primary Term
              </label>
              <input
                id="new-term"
                type="text"
                placeholder="e.g., photo"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                className="rounded-sm border border-border bg-background px-3 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="flex flex-[2] flex-col gap-1">
              <label htmlFor="new-synonyms" className="text-xs font-medium">
                Synonyms (comma-separated)
              </label>
              <input
                id="new-synonyms"
                type="text"
                placeholder="e.g., picture, image, photograph"
                value={newSynonyms}
                onChange={(e) => setNewSynonyms(e.target.value)}
                className="rounded-sm border border-border bg-background px-3 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isSubmitting}
              className="rounded-sm bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Synonym List */}
      {synonyms.length === 0 ? (
        <div className="rounded-sm border border-border py-8 text-center text-xs text-muted-foreground">
          No synonym groups defined. Add one to improve search relevance.
        </div>
      ) : (
        <div className="rounded-sm border border-border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Term
                </th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Synonyms
                </th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {synonyms.map((syn, i) => (
                <tr
                  key={syn._id}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    i % 2 === 0 ? "" : "bg-muted/30",
                    !syn.isActive && "opacity-60",
                  )}
                >
                  <td className="px-4 py-2 font-medium">{syn.term}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {syn.synonyms.join(", ")}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase",
                        syn.isActive
                          ? "bg-success/15 text-success"
                          : "bg-black/10 text-foreground/60 dark:bg-white/10",
                      )}
                    >
                      {syn.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggle(syn._id, syn.isActive)}
                        className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={syn.isActive ? "Deactivate" : "Activate"}
                      >
                        {syn.isActive ? (
                          <ToggleRight className="size-4" />
                        ) : (
                          <ToggleLeft className="size-4" />
                        )}
                      </button>

                      {deleteId === syn._id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(syn._id)}
                            className="rounded-sm bg-destructive/15 px-2 py-1 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/25"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(null)}
                            className="rounded-sm px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteId(syn._id)}
                          className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
