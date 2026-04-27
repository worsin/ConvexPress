import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/_admin/commerce/settings")({
  component: CommerceSettingsPage,
});

function CommerceSettingsPage() {
  const settings = useQuery(api.settings.queries.getBySection, {
    section: "commerce.general" as any,
  }) as any;
  const updateSection = useMutation(api.settings.mutations.updateSection);

  const [storeName, setStoreName] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [defaultCountryCode, setDefaultCountryCode] = useState("US");
  const [defaultState, setDefaultState] = useState("");
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [taxRateBasis, setTaxRateBasis] = useState<
    "shipping" | "billing" | "store"
  >("shipping");
  const [checkoutRequiresPhone, setCheckoutRequiresPhone] = useState(false);
  const [allowGuestCheckout, setAllowGuestCheckout] = useState(true);
  const [shippingEnabled, setShippingEnabled] = useState(true);
  const [returnWindowDays, setReturnWindowDays] = useState(30);
  const [requireDeliveryBeforeReturn, setRequireDeliveryBeforeReturn] =
    useState(true);
  const [shippingMethodsText, setShippingMethodsText] = useState(
    "standard:Standard shipping\nexpress:Express shipping",
  );
  const [paymentMethodsText, setPaymentMethodsText] = useState(
    "card:Credit or debit card:true\nmanual_invoice:Manual invoice:true\ncash_on_delivery:Cash on delivery:false",
  );
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settings || initialized) return;
    setStoreName(settings.storeName ?? "");
    setStoreEmail(settings.storeEmail ?? "");
    setCurrencyCode(settings.currencyCode ?? "USD");
    setCurrencySymbol(settings.currencySymbol ?? "$");
    setDefaultCountryCode(settings.defaultCountryCode ?? "US");
    setDefaultState(settings.defaultState ?? "");
    setPricesIncludeTax(settings.pricesIncludeTax ?? false);
    setTaxRateBasis(settings.taxRateBasis ?? "shipping");
    setCheckoutRequiresPhone(settings.checkoutRequiresPhone ?? false);
    setAllowGuestCheckout(settings.allowGuestCheckout ?? true);
    setShippingEnabled(settings.shippingEnabled ?? true);
    setReturnWindowDays(settings.returnWindowDays ?? 30);
    setRequireDeliveryBeforeReturn(
      settings.requireDeliveryBeforeReturn ?? true,
    );
    setShippingMethodsText(
      (settings.shippingMethods ?? [])
        .map((method: any) => `${method.code}:${method.label}`)
        .join("\n"),
    );
    setPaymentMethodsText(
      (settings.paymentMethods ?? [])
        .map((method: any) => `${method.code}:${method.label}:${method.enabled ? "true" : "false"}`)
        .join("\n"),
    );
    setInitialized(true);
  }, [initialized, settings]);

  async function handleSave() {
    const shippingMethods = shippingMethodsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [code, ...labelParts] = line.split(":");
        return { code: code.trim(), label: labelParts.join(":").trim() };
      });

    const paymentMethods = paymentMethodsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [code, label, enabled] = line.split(":");
        return {
          code: code?.trim() ?? "",
          label: label?.trim() ?? "",
          enabled: enabled?.trim() !== "false",
        };
      });

    setIsSaving(true);
    try {
      await updateSection({
        section: "commerce.general" as any,
        values: {
          storeName,
          storeEmail,
          currencyCode,
          currencySymbol,
          pricesIncludeTax,
          taxRateBasis,
          defaultCountryCode,
          defaultState,
          checkoutRequiresPhone,
          allowGuestCheckout,
          shippingEnabled,
          returnWindowDays,
          requireDeliveryBeforeReturn,
          shippingMethods,
          paymentMethods,
        },
      });
      toast.success("Commerce settings saved.");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Failed to save settings"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Commerce Settings</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage storefront-wide defaults used by catalog and checkout.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Store</h2>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="commerce-store-name">Store name</Label>
              <Input
                id="commerce-store-name"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commerce-store-email">Store email</Label>
              <Input
                id="commerce-store-email"
                type="email"
                value={storeEmail}
                onChange={(event) => setStoreEmail(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="commerce-currency-code">Currency code</Label>
                <Input
                  id="commerce-currency-code"
                  value={currencyCode}
                  onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="commerce-currency-symbol">Currency symbol</Label>
                <Input
                  id="commerce-currency-symbol"
                  value={currencySymbol}
                  onChange={(event) => setCurrencySymbol(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="commerce-default-country">Default country</Label>
                <Input
                  id="commerce-default-country"
                  value={defaultCountryCode}
                  onChange={(event) =>
                    setDefaultCountryCode(event.target.value.toUpperCase())
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="commerce-default-state">Default state</Label>
                <Input
                  id="commerce-default-state"
                  value={defaultState}
                  onChange={(event) => setDefaultState(event.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Checkout</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allowGuestCheckout}
                onChange={(event) => setAllowGuestCheckout(event.target.checked)}
              />
              Allow guest checkout
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={checkoutRequiresPhone}
                onChange={(event) => setCheckoutRequiresPhone(event.target.checked)}
              />
              Require phone at checkout
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={pricesIncludeTax}
                onChange={(event) => setPricesIncludeTax(event.target.checked)}
              />
              Prices include tax
            </label>
            <div className="grid gap-2">
              <Label htmlFor="commerce-tax-rate-basis">Tax address basis</Label>
              <select
                id="commerce-tax-rate-basis"
                value={taxRateBasis}
                onChange={(event) =>
                  setTaxRateBasis(
                    event.target.value as "shipping" | "billing" | "store",
                  )
                }
                className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-hidden"
              >
                <option value="shipping">Shipping address</option>
                <option value="billing">Billing address</option>
                <option value="store">Store location</option>
              </select>
            </div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={shippingEnabled}
                onChange={(event) => setShippingEnabled(event.target.checked)}
              />
              Shipping enabled
            </label>
            <div className="grid gap-2">
              <Label htmlFor="commerce-return-window-days">
                Return window (days)
              </Label>
              <Input
                id="commerce-return-window-days"
                type="number"
                min="0"
                max="365"
                value={String(returnWindowDays)}
                onChange={(event) =>
                  setReturnWindowDays(Number(event.target.value))
                }
              />
            </div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={requireDeliveryBeforeReturn}
                onChange={(event) =>
                  setRequireDeliveryBeforeReturn(event.target.checked)
                }
              />
              Require delivery confirmation before returns
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Shipping methods</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One per line in the format `code:Label`.
          </p>
          <textarea
            className="mt-4 min-h-40 w-full rounded-xl border border-input bg-input/30 px-3 py-3 text-sm outline-hidden"
            value={shippingMethodsText}
            onChange={(event) => setShippingMethodsText(event.target.value)}
          />
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Payment methods</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One per line in the format `code:Label:true|false`.
          </p>
          <textarea
            className="mt-4 min-h-40 w-full rounded-xl border border-input bg-input/30 px-3 py-3 text-sm outline-hidden"
            value={paymentMethodsText}
            onChange={(event) => setPaymentMethodsText(event.target.value)}
          />
        </section>
      </div>

      <div>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Commerce Settings"}
        </Button>
        <Link
          to="/commerce/settings/shipping"
          className="ml-3 inline-flex rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Open Shipping Settings
        </Link>
        <Link
          to={"/commerce/returns/settings" as any}
          className="ml-3 inline-flex rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Open Returns Settings
        </Link>
      </div>
    </div>
  );
}
