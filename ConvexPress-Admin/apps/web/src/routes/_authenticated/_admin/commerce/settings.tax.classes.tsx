import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Star, Trash2 } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/tax/classes",
)({
  component: TaxClassesAdmin,
});

type TaxClass = {
  _id: Id<"commerce_tax_classes">;
  code: string;
  label: string;
  description?: string;
  isDefault: boolean;
};

function TaxClassesAdmin() {
  const rows = useQuery(
    (api as any).commerce.taxClasses.list,
    {},
  ) as TaxClass[] | undefined;
  const create = useMutation((api as any).commerce.taxClasses.create);
  const update = useMutation((api as any).commerce.taxClasses.update);
  const remove = useMutation((api as any).commerce.taxClasses.remove);
  const seedDefaults = useMutation(
    (api as any).commerce.taxClasses.seedDefaults,
  );

  const [draft, setDraft] = useState({ code: "", label: "", description: "" });

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
      });
      toast.success("Tax class created");
      setDraft({ code: "", label: "", description: "" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create tax class");
    }
  }

  async function onSetDefault(id: Id<"commerce_tax_classes">) {
    try {
      await update({ id, isDefault: true });
      toast.success("Default class updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to set default");
    }
  }

  async function onDelete(id: Id<"commerce_tax_classes">) {
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
      if (result.seeded) {
        toast.success(`Seeded ${result.count} default classes`);
      } else {
        toast.info("Classes already seeded");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to seed");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/commerce/settings/tax"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Tax Rules
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tax Classes</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Managed list of tax classes referenced by rules + products. The default
          class applies to any product that doesn't specify one.
        </p>
      </div>

      {rows === undefined ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No tax classes yet. Seed the three standard classes to get started.
          </p>
          <button
            type="button"
            onClick={onSeed}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Seed defaults
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1fr_2fr_3fr_100px_80px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Code</div>
            <div>Label</div>
            <div>Description</div>
            <div>Default</div>
            <div />
          </div>
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row._id}
                className="grid grid-cols-[1fr_2fr_3fr_100px_80px] items-center gap-4 px-5 py-3 text-sm"
              >
                <div className="font-mono text-xs">{row.code}</div>
                <div className="font-medium">{row.label}</div>
                <div className="truncate text-muted-foreground">
                  {row.description ?? ""}
                </div>
                <div>
                  {row.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                      <Star className="h-3 w-3 fill-current" /> Default
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSetDefault(row._id)}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Set default
                    </button>
                  )}
                </div>
                <div className="text-right">
                  {!row.isDefault && (
                    <button
                      type="button"
                      onClick={() => onDelete(row._id)}
                      className="text-destructive hover:text-destructive/80"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Add a new class
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <input
            placeholder="code (e.g. luxury)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <input
            placeholder="Label (e.g. Luxury Goods)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            placeholder="Description (optional)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </div>
        <button
          type="button"
          onClick={onCreate}
          className={cn(
            "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
          )}
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>
    </div>
  );
}
