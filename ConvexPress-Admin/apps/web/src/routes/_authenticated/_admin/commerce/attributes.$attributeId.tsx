import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  GripVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/attributes/$attributeId",
)({
  component: CommerceAttributeTermsPage,
});

type Attribute = {
  _id: Id<"commerce_product_attributes">;
  name: string;
  label: string;
  slug: string;
  type: "select" | "text";
  orderBy: "menu_order" | "name" | "name_num" | "id";
  hasArchives: boolean;
  terms: Term[];
};

type Term = {
  _id: Id<"commerce_product_attribute_terms">;
  attributeId: Id<"commerce_product_attributes">;
  name: string;
  slug: string;
  description?: string;
  menuOrder: number;
  productCount: number;
};

/* ------------------------------------------------------------------ */
/*  Sortable term row                                                  */
/* ------------------------------------------------------------------ */

function SortableTermRow({
  term,
  onEdit,
  onDelete,
  isCustomOrder,
}: {
  term: Term;
  onEdit: (term: Term) => void;
  onDelete: (term: Term) => void;
  isCustomOrder: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: term._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[28px_minmax(0,2fr)_100px_minmax(0,2fr)_70px_100px] items-center gap-4 px-5 py-4"
    >
      {/* Drag handle */}
      <div>
        {isCustomOrder ? (
          <button
            type="button"
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            aria-label={`Reorder ${term.name}`}
            {...attributes}
            {...listeners}
            aria-roledescription="sortable"
          >
            <GripVerticalIcon className="size-4" />
          </button>
        ) : (
          <span className="text-muted-foreground/30">
            <GripVerticalIcon className="size-4" />
          </span>
        )}
      </div>

      {/* Name */}
      <div className="min-w-0">
        <span className="text-sm font-semibold text-foreground">
          {term.name}
        </span>
      </div>

      {/* Slug */}
      <div className="truncate text-sm text-muted-foreground">{term.slug}</div>

      {/* Description */}
      <div
        className="truncate text-sm text-muted-foreground"
        title={term.description}
      >
        {term.description || "\u2014"}
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">{term.productCount}</div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="xs" onClick={() => onEdit(term)}>
          <PencilIcon className="mr-1 size-3" />
          Edit
        </Button>
        <Button variant="ghost" size="xs" onClick={() => onDelete(term)}>
          <Trash2Icon className="mr-1 size-3" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

function CommerceAttributeTermsPage() {
  const { attributeId } = Route.useParams();

  const attribute = useQuery(
    (api as any).productAttributes.queries.getAttribute,
    { attributeId: attributeId as Id<"commerce_product_attributes"> },
  ) as Attribute | null | undefined;

  const createTerm = useMutation(
    (api as any).productAttributes.mutations.createTerm,
  );
  const updateTerm = useMutation(
    (api as any).productAttributes.mutations.updateTerm,
  );
  const deleteTerm = useMutation(
    (api as any).productAttributes.mutations.deleteTerm,
  );
  const reorderTerms = useMutation(
    (api as any).productAttributes.mutations.reorderTerms,
  );

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] =
    useState<Id<"commerce_product_attribute_terms"> | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Local term order for optimistic DnD
  const [localTerms, setLocalTerms] = useState<Term[]>([]);
  useEffect(() => {
    if (attribute?.terms) {
      setLocalTerms(attribute.terms);
    }
  }, [attribute?.terms]);

  const isCustomOrder = attribute?.orderBy === "menu_order";

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const resetForm = () => {
    setName("");
    setSlug("");
    setDescription("");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Term name is required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateTerm({
          termId: editingId,
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
        });
        toast.success("Term updated.");
      } else {
        await createTerm({
          attributeId: attributeId as Id<"commerce_product_attributes">,
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
        });
        toast.success("Term created.");
      }
      resetForm();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Failed to save term"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTerm({ termId: deleteTarget._id });
      toast.success(`Term "${deleteTarget.name}" deleted.`);
      if (editingId === deleteTarget._id) {
        resetForm();
      }
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Failed to delete term"),
      );
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const startEditing = (term: Term) => {
    setEditingId(term._id);
    setName(term.name);
    setSlug(term.slug);
    setDescription(term.description ?? "");
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setLocalTerms((prev) => {
        const oldIndex = prev.findIndex((t) => t._id === active.id);
        const newIndex = prev.findIndex((t) => t._id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const reordered = arrayMove(prev, oldIndex, newIndex);

        // Persist to backend
        void reorderTerms({
          attributeId: attributeId as Id<"commerce_product_attributes">,
          termIds: reordered.map((t) => t._id),
        }).catch((err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : "Failed to reorder terms",
          );
        });

        return reordered;
      });
    },
    [attributeId, reorderTerms],
  );

  const sortableIds = localTerms.map((t) => t._id);

  // Loading state
  if (attribute === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  // Not found
  if (attribute === null) {
    return (
      <div className="space-y-6">
        <Link
          to="/commerce/attributes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Attributes
        </Link>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Attribute not found. It may have been deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              to="/commerce/attributes"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-5" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">
              {attribute.label}
            </h1>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {attribute.type}
            </span>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage the terms for this attribute. Terms are the individual values
            that can be assigned to products (e.g., "Red", "Blue", "Green" for a
            Color attribute).
          </p>
        </div>
      </div>

      {/* Split layout */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left panel: Add/Edit term form */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">
            {editingId ? "Edit term" : "Add new term"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingId
              ? "Update the term details below."
              : `Add a new term to the "${attribute.label}" attribute.`}
          </p>

          <div className="mt-5 grid gap-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="term-name">Name</Label>
              <Input
                id="term-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Red"
              />
            </div>

            {/* Slug */}
            <div className="grid gap-2">
              <Label htmlFor="term-slug">Slug</Label>
              <Input
                id="term-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Auto-generated from name"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier. Leave empty to auto-generate.
              </p>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="term-description">Description</Label>
              <Textarea
                id="term-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this term."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button onClick={() => void handleSubmit()} disabled={saving}>
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update term"
                    : "Add term"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Right panel: Terms table */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[28px_minmax(0,2fr)_100px_minmax(0,2fr)_70px_100px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div />
            <div>Name</div>
            <div>Slug</div>
            <div>Description</div>
            <div>Count</div>
            <div className="text-right">Actions</div>
          </div>

          {localTerms.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No terms defined yet. Create one using the form on the left.
              </p>
            </div>
          ) : isCustomOrder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="divide-y divide-border">
                  {localTerms.map((term) => (
                    <SortableTermRow
                      key={term._id}
                      term={term}
                      onEdit={startEditing}
                      onDelete={setDeleteTarget}
                      isCustomOrder
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="divide-y divide-border">
              {localTerms.map((term) => (
                <SortableTermRow
                  key={term._id}
                  term={term}
                  onEdit={startEditing}
                  onDelete={setDeleteTarget}
                  isCustomOrder={false}
                />
              ))}
            </div>
          )}

          {isCustomOrder && localTerms.length > 1 && (
            <div className="border-t border-border/50 px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Drag rows to reorder. Changes are saved automatically.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete term</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.name}</strong>? This will remove the term
              from all products that use it. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete term"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
