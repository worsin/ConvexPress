import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute("/_authenticated/_admin/commerce/discounts")({
  component: CommerceDiscountsPage,
});

function centsToDisplay(amount: number) {
  return (amount / 100).toFixed(2);
}

function displayToCents(value: string) {
  return Math.round(Number.parseFloat(value || "0") * 100);
}

function CommerceDiscountsPage() {
  const discounts = useQuery((api as any).commerce.discounts.list, {}) as
    | Array<any>
    | undefined;
  const createDiscount = useMutation((api as any).commerce.discounts.create);
  const updateDiscount = useMutation((api as any).commerce.discounts.update);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState("fixed_cart");
  const [amount, setAmount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");

  const activeCount = useMemo(
    () => discounts?.filter((discount) => discount.status === "active").length ?? 0,
    [discounts],
  );

  async function handleCreate() {
    try {
      await createDiscount({
        code,
        description: description || undefined,
        discountType: discountType as any,
        amount: displayToCents(amount),
        usageLimit: usageLimit.trim() ? Number(usageLimit) : null,
      });
      setCode("");
      setDescription("");
      setAmount("");
      setUsageLimit("");
      toast.success("Discount code created");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create discount code",
      );
    }
  }

  async function handleToggle(discount: any) {
    try {
      await updateDiscount({
        discountId: discount._id,
        status: discount.status === "active" ? "inactive" : "active",
      });
      toast.success("Discount updated");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update discount code",
      );
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Discounts</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage coupon-style discount codes for cart and checkout.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">New discount code</h2>
          <div className="mt-4 grid gap-4">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="SPRING25"
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Spring promotion"
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
            <select
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value)}
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
            >
              <option value="fixed_cart">Fixed cart amount</option>
              <option value="percent">Percentage</option>
              <option value="fixed_product">Fixed per-product amount</option>
            </select>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={discountType === "percent" ? "25" : "10.00"}
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
            <input
              value={usageLimit}
              onChange={(event) => setUsageLimit(event.target.value)}
              placeholder="Usage limit (optional)"
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="inline-flex rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              Create discount
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Codes</h2>
              <p className="text-sm text-muted-foreground">
                {activeCount} active code{activeCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {discounts === undefined ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-xl bg-muted"
                />
              ))
            ) : discounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No discount codes created yet.
              </p>
            ) : (
              discounts.map((discount) => (
                <div
                  key={discount._id}
                  className="rounded-xl border border-border px-4 py-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-foreground">{discount.code}</p>
                      <p className="mt-1 text-muted-foreground">
                        {discount.description || "No description"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggle(discount)}
                      className="inline-flex rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground"
                    >
                      {discount.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{discount.status}</span>
                    <span>{discount.discountType}</span>
                    <span>
                      {discount.discountType === "percent"
                        ? `${discount.amount}%`
                        : `$${centsToDisplay(discount.amount)}`}
                    </span>
                    <span>
                      Used {discount.usageCount}
                      {typeof discount.usageLimit === "number"
                        ? ` / ${discount.usageLimit}`
                        : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
