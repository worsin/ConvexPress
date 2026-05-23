import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/order-forms/new",
)({
  component: NewOrderForm,
});

function NewOrderForm() {
  const navigate = useNavigate();
  const create = useMutation(
    (api as any).commerceSubscriptions.mutations.createOrderForm,
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required");
      return;
    }
    setSaving(true);
    try {
      const result = await create({ title: title.trim(), slug: slug.trim() });
      toast.success("Order form created");
      navigate({
        to: "/commerce/subscriptions/order-forms/$formId",
        params: { formId: String(result.orderFormId) },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create order form");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <Link
        to="/commerce/subscriptions/order-forms"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to order forms
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Order Form</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a direct-signup form customers can use to start a subscription.
        </p>
      </div>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Premium Annual Signup"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Slug</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="premium-annual"
          />
        </label>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create"}
        </button>
      </div>
    </div>
  );
}
