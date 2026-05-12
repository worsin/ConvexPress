import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
  ArrowLeftIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/attributes",
)({
  component: CommerceAttributesPage,
});

type Attribute = {
  _id: Id<"commerce_product_attributes">;
  name: string;
  label: string;
  slug: string;
  type: "select" | "text";
  orderBy: "menu_order" | "name" | "name_num" | "id";
  hasArchives: boolean;
};

const typeBadge: Record<string, string> = {
  select: "bg-primary/10 text-primary",
  text: "bg-muted text-muted-foreground",
};

const orderByLabels: Record<string, string> = {
  menu_order: "Custom ordering",
  name: "Name",
  name_num: "Name (numeric)",
  id: "Term ID",
};

function TermCount({
  attributeId,
}: {
  attributeId: Id<"commerce_product_attributes">;
}) {
  const terms = useQuery(
    (api as any).productAttributes.queries.listTerms,
    { attributeId },
  ) as Array<{ _id: string }> | undefined;
  if (terms === undefined) return <span className="text-muted-foreground">...</span>;
  return <>{terms.length}</>;
}

function CommerceAttributesPage() {
  const attributes = useQuery(
    (api as any).productAttributes.queries.listAttributes,
    {},
  ) as Attribute[] | null | undefined;

  const createAttribute = useMutation(
    (api as any).productAttributes.mutations.createAttribute,
  );
  const updateAttribute = useMutation(
    (api as any).productAttributes.mutations.updateAttribute,
  );
  const deleteAttribute = useMutation(
    (api as any).productAttributes.mutations.deleteAttribute,
  );

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<"select" | "text">("select");
  const [orderBy, setOrderBy] = useState<
    "menu_order" | "name" | "name_num" | "id"
  >("menu_order");
  const [hasArchives, setHasArchives] = useState(false);
  const [editingId, setEditingId] =
    useState<Id<"commerce_product_attributes"> | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<Attribute | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setName("");
    setSlug("");
    setType("select");
    setOrderBy("menu_order");
    setHasArchives(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Attribute name is required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateAttribute({
          attributeId: editingId,
          label: name.trim(),
          type,
          orderBy,
          hasArchives,
        });
        toast.success("Attribute updated.");
      } else {
        await createAttribute({
          name: name.trim(),
          label: name.trim(),
          slug: slug.trim() || undefined,
          type,
          orderBy,
          hasArchives,
        });
        toast.success("Attribute created.");
      }
      resetForm();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error
            ? error.message
            : "Failed to save attribute"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAttribute({ attributeId: deleteTarget._id });
      toast.success(`Attribute "${deleteTarget.label}" deleted.`);
      if (editingId === deleteTarget._id) {
        resetForm();
      }
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error
            ? error.message
            : "Failed to delete attribute"),
      );
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const startEditing = (attr: Attribute) => {
    setEditingId(attr._id);
    setName(attr.label);
    setSlug(attr.slug);
    setType(attr.type);
    setOrderBy(attr.orderBy);
    setHasArchives(attr.hasArchives);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              to="/commerce/products"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-5" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Attributes</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Define global product attributes like Color, Size, or Material. Each
            attribute can have its own set of terms that are reusable across
            products.
          </p>
        </div>
      </div>

      {/* Split layout */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left panel: Add/Edit attribute form */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">
            {editingId ? "Edit attribute" : "Add new attribute"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingId
              ? "Update the attribute settings below."
              : "Attributes let you define extra product data like color or size."}
          </p>

          <div className="mt-5 grid gap-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="attr-name">Name</Label>
              <Input
                id="attr-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Color"
              />
            </div>

            {/* Slug (only for new attributes) */}
            {!editingId && (
              <div className="grid gap-2">
                <Label htmlFor="attr-slug">Slug</Label>
                <Input
                  id="attr-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="Auto-generated from name"
                />
                <p className="text-xs text-muted-foreground">
                  Unique slug for the attribute URL. Leave empty to
                  auto-generate.
                </p>
              </div>
            )}

            {/* Type */}
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(val) => setType(val as "select" | "text")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Default sort order */}
            <div className="grid gap-2">
              <Label>Default sort order</Label>
              <Select
                value={orderBy}
                onValueChange={(val) =>
                  setOrderBy(val as "menu_order" | "name" | "name_num" | "id")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="menu_order">Custom ordering</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="name_num">Name (numeric)</SelectItem>
                  <SelectItem value="id">Term ID</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Enable Archives */}
            <div className="flex items-center gap-3">
              <Checkbox
                checked={hasArchives}
                onCheckedChange={(checked) =>
                  setHasArchives(checked === true)
                }
              />
              <Label className="cursor-pointer">Enable Archives</Label>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Enable this to allow attribute terms to have their own archive
              pages on the storefront.
            </p>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button onClick={() => void handleSubmit()} disabled={saving}>
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update attribute"
                    : "Add attribute"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Right panel: Attributes table */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[minmax(0,2fr)_100px_80px_90px_120px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Label</div>
            <div>Slug</div>
            <div>Type</div>
            <div>Terms</div>
            <div className="text-right">Actions</div>
          </div>

          {attributes === undefined ? (
            <div className="space-y-3 p-5">
              {["one", "two", "three", "four"].map((key) => (
                <div
                  key={key}
                  className="h-12 animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : attributes === null ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                The Custom Fields plugin is required to manage attributes.
                Enable it in Plugins to continue.
              </p>
            </div>
          ) : attributes.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No attributes defined yet. Create one using the form on the
                left.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {attributes.map((attr) => (
                <div
                  key={attr._id}
                  className="grid grid-cols-[minmax(0,2fr)_100px_80px_90px_120px] items-center gap-4 px-5 py-4"
                >
                  {/* Label (clickable to manage terms) */}
                  <div className="min-w-0">
                    <Link
                      to="/commerce/attributes/$attributeId"
                      params={{ attributeId: attr._id }}
                      className="text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {attr.label}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {orderByLabels[attr.orderBy] ?? attr.orderBy}
                    </p>
                  </div>

                  {/* Slug */}
                  <div className="truncate text-sm text-muted-foreground">
                    {attr.slug}
                  </div>

                  {/* Type badge */}
                  <div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${typeBadge[attr.type] ?? "bg-muted text-foreground"}`}
                    >
                      {attr.type}
                    </span>
                  </div>

                  {/* Term count */}
                  <div className="text-sm text-muted-foreground">
                    <Link
                      to="/commerce/attributes/$attributeId"
                      params={{ attributeId: attr._id }}
                      className="hover:text-primary"
                    >
                      <TermCount attributeId={attr._id} />
                    </Link>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => startEditing(attr)}
                    >
                      <PencilIcon className="mr-1 size-3" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeleteTarget(attr)}
                    >
                      <Trash2Icon className="mr-1 size-3" />
                    </Button>
                  </div>
                </div>
              ))}
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
            <DialogTitle>Delete attribute</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.label}</strong>? All terms belonging to this
              attribute will also be permanently deleted. This action cannot be
              undone.
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
              {deleting ? "Deleting..." : "Delete attribute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
