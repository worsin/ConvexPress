import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/order-forms/$formId",
)({
  component: OrderFormDetail,
});

type Form = {
  _id: Id<"commerce_subscription_order_forms">;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
} | null;

function OrderFormDetail() {
  const { formId } = Route.useParams();
  const form = useQuery(
    (api as any).commerceSubscriptions.queries.getOrderForm,
    { orderFormId: formId as any },
  ) as Form | undefined;

  const update = useMutation(
    (api as any).commerceSubscriptions.mutations.updateOrderForm,
  );

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"draft" | "active" | "archived">("draft");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (form) {
      setTitle(form.title);
      setStatus(form.status);
    }
  }, [form?._id]);

  if (form === undefined) {
    return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  }
  if (form === null) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-muted-foreground">Order form not found.</p>
      </div>
    );
  }

  async function onSave() {
    setSaving(true);
    try {
      await update({
        orderFormId: formId as any,
        title,
        status,
      });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
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
        <h1 className="text-3xl font-bold tracking-tight">{form.title}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{form.slug}</p>
      </div>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Status</span>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "active" | "archived")}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
