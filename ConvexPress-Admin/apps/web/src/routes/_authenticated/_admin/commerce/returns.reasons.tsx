import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/returns/reasons",
)({
  component: ReturnReasonsAdmin,
});

type Reason = {
  _id: Id<"commerce_return_reasons">;
  code: string;
  label: string;
  description?: string;
  requiresPhoto?: boolean;
  requiresRestock?: boolean;
  sortOrder?: number;
  isActive: boolean;
};

function ReturnReasonsAdmin() {
  const rows = useQuery(
    (api as any).commerceReturns.reasons.list,
    {},
  ) as Reason[] | undefined;
  const create = useMutation((api as any).commerceReturns.reasons.create);
  const update = useMutation((api as any).commerceReturns.reasons.update);
  const remove = useMutation((api as any).commerceReturns.reasons.remove);
  const seedDefaults = useMutation(
    (api as any).commerceReturns.reasons.seedDefaults,
  );

  const [draft, setDraft] = useState({
    code: "",
    label: "",
    description: "",
    requiresPhoto: false,
    requiresRestock: true,
  });

  async function onCreate() {
    if (!draft.code.trim() || !draft.label.trim()) {
      toast.error("Code and label are required");
      return;
    }
    try {
      await create({
        code: draft.code.trim().toLowerCase(),
        label: draft.label.trim(),
        description: draft.description.trim() || undefined,
        requiresPhoto: draft.requiresPhoto,
        requiresRestock: draft.requiresRestock,
      });
      toast.success("Reason created");
      setDraft({
        code: "",
        label: "",
        description: "",
        requiresPhoto: false,
        requiresRestock: true,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create reason");
    }
  }

  async function onToggleActive(id: Id<"commerce_return_reasons">, value: boolean) {
    try {
      await update({ id, isActive: value });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function onDelete(id: Id<"commerce_return_reasons">) {
    try {
      await remove({ id });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  }

  async function onSeed() {
    try {
      const result = await seedDefaults({});
      if (result.seeded) toast.success(`Seeded ${result.count} default reasons`);
      else toast.info("Reasons already seeded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to seed");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/commerce/returns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Returns
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Return Reasons</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Customer-facing reason codes for return requests. Toggle active to
          control which reasons appear in the return form.
        </p>
      </div>

      {rows === undefined ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No return reasons yet.
          </p>
          <button
            type="button"
            onClick={onSeed}
            className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Seed defaults
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1fr_2fr_3fr_80px_80px_80px_60px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Code</div>
            <div>Label</div>
            <div>Description</div>
            <div>Photo</div>
            <div>Restock</div>
            <div>Active</div>
            <div />
          </div>
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row._id}
                className="grid grid-cols-[1fr_2fr_3fr_80px_80px_80px_60px] items-center gap-4 px-5 py-3 text-sm"
              >
                <div className="font-mono text-xs">{row.code}</div>
                <div className="font-medium">{row.label}</div>
                <div className="truncate text-muted-foreground">
                  {row.description ?? ""}
                </div>
                <div>{row.requiresPhoto ? "Required" : "—"}</div>
                <div>{row.requiresRestock ? "Yes" : "No"}</div>
                <div>
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(e) => onToggleActive(row._id, e.target.checked)}
                  />
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(row._id)}
                    className="text-destructive hover:text-destructive/80"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Add a new reason
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="code (e.g. damaged_box)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <input
            placeholder="Label"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>
        <input
          placeholder="Description (optional)"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        <div className="flex gap-6 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.requiresPhoto}
              onChange={(e) =>
                setDraft({ ...draft, requiresPhoto: e.target.checked })
              }
            />
            Requires photo
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.requiresRestock}
              onChange={(e) =>
                setDraft({ ...draft, requiresRestock: e.target.checked })
              }
            />
            Restockable
          </label>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>
    </div>
  );
}
