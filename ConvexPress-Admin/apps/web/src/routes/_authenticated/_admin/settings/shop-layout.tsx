/**
 * Shop layouts.
 *
 * Picks the storefront's page compositions: how the shop (catalog / search)
 * page is arranged and how a product page is arranged. These are layout
 * presets, not colours — colours live under Appearance. Saved to the
 * `commerce.layout` settings section; the public site reads it as
 * `layoutConfig`.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Check, ExternalLink, LayoutTemplate, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getElectronBridge } from "@/lib/electron";
import {
  PRODUCT_LAYOUT_PRESETS,
  SHOP_LAYOUT_PRESETS,
  type LayoutPreset,
  type ProductLayoutId,
  type ShopLayoutId,
} from "@/lib/commerce/layout-presets";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/settings/shop-layout")({
  component: ShopLayoutSettingsPage,
});

interface LayoutForm {
  shopLayout: ShopLayoutId;
  productLayout: ProductLayoutId;
  cartPanel: "persistent" | "drawer";
  gridDensity: "comfortable" | "dense";
}

function openExternal(url: string) {
  const bridge = getElectronBridge();
  if (bridge?.siteRunner?.openUrl) void bridge.siteRunner.openUrl(url);
  else window.open(url, "_blank", "noopener");
}

function ShopLayoutSettingsPage() {
  const stored = useQuery(api.settings.queries.getBySection, { section: "commerce.layout" });
  const general = useQuery(api.settings.queries.getBySection, { section: "general" }) as { siteUrl?: string } | undefined;
  const updateSettings = useMutation(api.settings.mutations.updateSection);
  const [form, setForm] = useState<LayoutForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (stored && !form) setForm(stored as unknown as LayoutForm);
  }, [stored, form]);

  const set = useCallback(<K extends keyof LayoutForm>(key: K, value: LayoutForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      await updateSettings({ section: "commerce.layout", values: form as unknown as Record<string, unknown> });
      toast.success("Shop layouts saved. The storefront picks them up immediately.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the layouts.");
    } finally {
      setSaving(false);
    }
  }, [form, updateSettings]);

  if (!form) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading layouts…
      </div>
    );
  }

  const dirty = stored ? JSON.stringify(stored) !== JSON.stringify(form) : false;
  const siteUrl = general?.siteUrl?.replace(/\/$/, "") ?? "";
  const previewShop = siteUrl ? `${siteUrl}/products?layout=${form.shopLayout}&cartPanel=${form.cartPanel}` : null;
  const previewProduct = siteUrl ? `${siteUrl}/products?productLayout=${form.productLayout}&layout=${form.shopLayout}` : null;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow="Settings · Commerce"
        title="Shop layouts"
        meta={["Page compositions for the storefront, separate from colours and fonts"]}
        actions={
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            {dirty ? "Save layouts" : "Saved"}
          </Button>
        }
      />

      <LayoutPickerSection
        title="Shop page"
        description="How the catalog and search results are arranged. Pick by catalog size: small selections need room, large ones need speed."
        presets={SHOP_LAYOUT_PRESETS}
        value={form.shopLayout}
        onChange={(id) => set("shopLayout", id)}
        previewUrl={previewShop}
        previewLabel="Preview the shop page"
        extra={
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceField
              label="Cart"
              value={form.cartPanel}
              onChange={(value) => set("cartPanel", value)}
              options={[
                { value: "persistent", label: "Persistent column", hint: "Cart stays visible beside the shop on wide screens." },
                { value: "drawer", label: "Drawer only", hint: "Cart opens from the header icon." },
              ]}
            />
            <ChoiceField
              label="Grid density"
              value={form.gridDensity}
              onChange={(value) => set("gridDensity", value)}
              options={[
                { value: "comfortable", label: "Comfortable", hint: "Larger cards, fewer per row." },
                { value: "dense", label: "Dense", hint: "More products per row on the Marketplace layout." },
              ]}
            />
          </div>
        }
      />

      <LayoutPickerSection
        title="Product page"
        description="How a single product is presented. The purchase controls are the same in every layout; only the arrangement changes."
        presets={PRODUCT_LAYOUT_PRESETS}
        value={form.productLayout}
        onChange={(id) => set("productLayout", id)}
        previewUrl={previewProduct}
        previewLabel="Preview a product page"
        previewNote="Opens the shop with the layout applied; pick any product to see it."
      />
    </div>
  );
}

/* ───────────────────────── picker ───────────────────────── */

function LayoutPickerSection<Id extends string>({
  title,
  description,
  presets,
  value,
  onChange,
  previewUrl,
  previewLabel,
  previewNote,
  extra,
}: {
  title: string;
  description: string;
  presets: Array<LayoutPreset<Id>>;
  value: Id;
  onChange: (id: Id) => void;
  previewUrl: string | null;
  previewLabel: string;
  previewNote?: string;
  extra?: ReactNode;
}) {
  const selected = presets.find((preset) => preset.id === value) ?? presets[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutTemplate className="size-4 text-primary" aria-hidden="true" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-[18px] xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-[18px]">
          <div role="radiogroup" aria-label={title} className="grid gap-3 sm:grid-cols-2">
            {presets.map((preset) => {
              const active = preset.id === value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(preset.id)}
                  className={cn(
                    "group flex flex-col gap-3 rounded-xl border p-3 text-left transition-[border-color,box-shadow,background-color] duration-200",
                    active
                      ? "border-primary bg-primary/[0.04] shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className="overflow-hidden rounded-lg border border-border bg-background">
                    <preset.Wireframe />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-foreground">{preset.name}</p>
                      <p className="text-[12.5px] text-muted-foreground">{preset.tagline}</p>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent group-hover:border-primary/50",
                      )}
                      aria-hidden="true"
                    >
                      <Check className="size-3" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {extra}
        </div>

        {/* Preview panel */}
        <aside className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2/60 p-4" aria-label={`${selected.name} preview`}>
          <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <selected.Wireframe detailed />
          </div>
          <div className="space-y-1">
            <p className="eyebrow">Selected</p>
            <h3 className="text-[15px] font-semibold text-foreground">{selected.name}</h3>
            <p className="text-[12.5px] leading-5 text-muted-foreground">{selected.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Best for</p>
              <ul className="space-y-1 text-[12.5px] text-foreground">
                {selected.bestFor.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Includes</p>
              <ul className="space-y-1 text-[12.5px] text-foreground">
                {selected.features.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-auto space-y-1.5">
            <Button variant="outline" size="sm" disabled={!previewUrl} onClick={() => previewUrl && openExternal(previewUrl)}>
              <ExternalLink data-icon="inline-start" />
              {previewLabel}
            </Button>
            <p className="text-[11.5px] text-muted-foreground">
              {previewUrl ? (previewNote ?? "Opens the live site with this layout applied, before you save.") : "Set the site address in Settings › General to preview on the site."}
            </p>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}

function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div role="radiogroup" aria-label={label} className="grid gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary bg-primary/[0.04]" : "border-border bg-surface-2/60 hover:border-primary/40",
              )}
            >
              <span
                className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", active ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent")}
                aria-hidden="true"
              >
                <Check className="size-2.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-foreground">{option.label}</span>
                <span className="block text-[12.5px] text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
