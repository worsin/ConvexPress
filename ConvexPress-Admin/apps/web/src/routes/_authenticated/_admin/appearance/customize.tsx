/**
 * Appearance › Customize.
 *
 * The WordPress-Customizer idea done live: the active template's settings
 * modules on the left, the real storefront on the right. Every change is
 * pushed into the preview over `postMessage` and painted immediately (the
 * site merges the draft over its saved values); nothing persists until
 * Publish writes `appearance.template.settings[packId]` and `variants`.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Check, ChevronDown, Loader2, Monitor, RotateCcw, Save, Smartphone, SlidersHorizontal, Tablet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { modulesFor, type SettingsModule, type TemplateSettingsField } from "@/lib/templates/settingsModules";
import { getTemplatePack } from "@/lib/templates/packs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/appearance/customize")({
  component: CustomizePage,
});

const CUSTOMIZE_MESSAGE = "convexpress:customize";

type Values = Record<string, Record<string, unknown>>;

interface TemplateSection {
  active: string;
  overrides: Record<string, string>;
  variants: Record<string, string>;
  settings: Record<string, Values>;
}

const PREVIEW_PAGES = [
  { id: "home", label: "Home", path: "/" },
  { id: "shop", label: "Shop", path: "/products" },
  { id: "blog", label: "Blog", path: "/blog" },
  { id: "cart", label: "Cart", path: "/cart" },
  { id: "login", label: "Sign in", path: "/login" },
];

const DEVICES = [
  { id: "desktop", label: "Desktop", width: null, Icon: Monitor },
  { id: "tablet", label: "Tablet", width: 834, Icon: Tablet },
  { id: "phone", label: "Phone", width: 390, Icon: Smartphone },
] as const;

const FONT_SUGGESTIONS = ["Inter", "Fraunces", "Space Grotesk", "Playfair Display", "DM Sans", "Instrument Serif", "Lora", "Manrope", "Newsreader", "Source Serif 4", "IBM Plex Sans", "Work Sans"];

function CustomizePage() {
  const stored = useQuery(api.settings.queries.getBySection, { section: "appearance.template" }) as TemplateSection | undefined;
  const general = useQuery(api.settings.queries.getBySection, { section: "general" }) as { siteUrl?: string } | undefined;
  const updateSettings = useMutation(api.settings.mutations.updateSection);

  const activeId = stored?.active ?? "core";
  const pack = getTemplatePack(activeId);
  const modules = useMemo<SettingsModule[]>(() => {
    const list = modulesFor(pack ? { modules: pack.modules } : undefined);
    // Shop module: the variant options come from the pack.
    return list.map((module) => {
      if (module.id !== "shop") return module;
      return {
        ...module,
        fields: module.fields.map((field) => {
          if (field.id === "catalogVariant") return { ...field, options: (pack?.variants?.["shop.catalog"] ?? []).map((v) => ({ value: v, label: v })) };
          if (field.id === "productVariant") return { ...field, options: (pack?.variants?.["shop.product"] ?? []).map((v) => ({ value: v, label: v })) };
          return field;
        }),
      };
    });
  }, [pack]);

  const [values, setValues] = useState<Values>({});
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [page, setPage] = useState(PREVIEW_PAGES[0]);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Seed the draft from the saved values once per pack.
  useEffect(() => {
    if (!stored || seeded === activeId) return;
    setValues(stored.settings?.[activeId] ?? {});
    setVariants(stored.variants ?? {});
    setSeeded(activeId);
    setOpenGroup(modules[0]?.id ?? null);
  }, [stored, activeId, seeded, modules]);

  const siteUrl = general?.siteUrl?.replace(/\/$/, "") ?? "";
  const previewUrl = siteUrl ? `${siteUrl}${page.path}${page.path.includes("?") ? "&" : "?"}customize=preview&template=${activeId}` : null;

  // Push the draft whenever it changes, and whenever the preview says it is ready.
  const post = useCallback(() => {
    const draftVariants: Record<string, string> = { ...variants };
    const shop = values.shop ?? {};
    if (typeof shop.catalogVariant === "string" && shop.catalogVariant) draftVariants["shop.catalog"] = shop.catalogVariant;
    if (typeof shop.productVariant === "string" && shop.productVariant) draftVariants["shop.product"] = shop.productVariant;
    frameRef.current?.contentWindow?.postMessage({ type: CUSTOMIZE_MESSAGE, packId: activeId, values, variants: draftVariants }, "*");
  }, [activeId, values, variants]);

  useEffect(() => {
    post();
  }, [post]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object" && (event.data as { type?: string }).type === `${CUSTOMIZE_MESSAGE}:ready`) post();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  const setField = (moduleId: string, fieldId: string, value: unknown) => {
    setValues((current) => ({ ...current, [moduleId]: { ...(current[moduleId] ?? {}), [fieldId]: value } }));
  };
  const resetModule = (moduleId: string) => {
    setValues((current) => {
      const next = { ...current };
      delete next[moduleId];
      return next;
    });
  };

  const dirty = stored ? JSON.stringify(stored.settings?.[activeId] ?? {}) !== JSON.stringify(values) || JSON.stringify(stored.variants ?? {}) !== JSON.stringify(variants) : false;

  const publish = useCallback(async () => {
    if (!stored) return;
    setSaving(true);
    try {
      const shop = values.shop ?? {};
      const nextVariants: Record<string, string> = { ...variants };
      if (typeof shop.catalogVariant === "string" && shop.catalogVariant) nextVariants["shop.catalog"] = shop.catalogVariant;
      if (typeof shop.productVariant === "string" && shop.productVariant) nextVariants["shop.product"] = shop.productVariant;
      await updateSettings({
        section: "appearance.template",
        values: {
          ...stored,
          variants: nextVariants,
          settings: { ...(stored.settings ?? {}), [activeId]: values },
        } as unknown as Record<string, unknown>,
      });
      setVariants(nextVariants);
      toast.success("Published. The site is already showing it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish.");
    } finally {
      setSaving(false);
    }
  }, [stored, values, variants, activeId, updateSettings]);

  if (!stored) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
      </div>
    );
  }

  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? null;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow="Appearance"
        title="Customize"
        meta={[
          <span key="pack">
            Template: <strong className="text-foreground">{pack?.name ?? activeId}</strong> ·{" "}
            <Link to="/appearance/templates" className="text-primary hover:underline">
              change
            </Link>
          </span>,
          dirty ? "Unpublished changes" : "Everything published",
        ]}
        actions={
          <Button onClick={() => void publish()} disabled={saving || !dirty}>
            {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            Publish
          </Button>
        }
      />

      <div className="grid gap-[18px] xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Groups */}
        <aside className="space-y-2 self-start rounded-xl border border-border bg-card p-2" aria-label="Template settings">
          {modules.length === 0 && (
            <p className="p-3 text-[12.5px] text-muted-foreground">This template exposes no settings.</p>
          )}
          {modules.map((module) => {
            const open = openGroup === module.id;
            const touched = Object.keys(values[module.id] ?? {}).length > 0;
            return (
              <section key={module.id} className="rounded-lg border border-border bg-surface-2/60">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : module.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13.5px] font-medium text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {module.title}
                    {touched && <span className="size-1.5 rounded-full bg-primary" aria-label="customised" />}
                  </span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-border px-3 py-3">
                    {module.fields.map((field) => (
                      <FieldControl
                        key={field.id}
                        field={field}
                        value={values[module.id]?.[field.id]}
                        onChange={(value) => setField(module.id, field.id, value)}
                      />
                    ))}
                    {touched && (
                      <button type="button" onClick={() => resetModule(module.id)} className="inline-flex items-center gap-1 self-start text-[12px] font-medium text-primary hover:underline">
                        <RotateCcw className="size-3" aria-hidden="true" /> Reset to template defaults
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          <p className="px-3 pb-1 pt-2 text-[11.5px] text-muted-foreground">
            Header and footer builders live under Appearance › Header and Footer. Site title, logo and menus are global and apply to every template.
          </p>
        </aside>

        {/* Preview */}
        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-surface-2/60" aria-label="Live preview">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
            <div role="tablist" aria-label="Preview page" className="flex flex-wrap gap-1">
              {PREVIEW_PAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={page.id === item.id}
                  onClick={() => setPage(item)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                    page.id === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Device" className="flex gap-1">
              {DEVICES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={device === id}
                  aria-label={label}
                  onClick={() => setDevice(id)}
                  className={cn("flex size-8 items-center justify-center rounded-md transition-colors", device === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          {previewUrl ? (
            <div className="flex flex-1 justify-center overflow-auto bg-surface-2/40 p-3">
              <iframe
                ref={frameRef}
                key={previewUrl}
                title="Site preview"
                src={previewUrl}
                onLoad={post}
                style={{ width: deviceWidth ? `${deviceWidth}px` : "100%" }}
                className="h-[calc(70vh-3rem)] min-h-[560px] rounded-lg border border-border bg-background shadow-sm"
              />
            </div>
          ) : (
            <p className="p-6 text-[12.5px] text-muted-foreground">Set the site address in Settings › General to preview the site here.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function FieldControl({ field, value, onChange }: { field: TemplateSettingsField; value: unknown; onChange: (value: unknown) => void }) {
  const id = `customize-${field.id}`;
  const label = (
    <Label htmlFor={id} className="flex items-center justify-between gap-2">
      <span>{field.label}</span>
      {field.brandBound && value == null && <span className="text-[11px] font-normal text-muted-foreground">from site / brand</span>}
    </Label>
  );

  switch (field.type) {
    case "color": {
      const current = typeof value === "string" ? value : "";
      return (
        <div className="grid gap-1.5">
          {label}
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${field.label} colour`}
              value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : "#888888"}
              onChange={(event) => onChange(event.target.value)}
              className="size-9 cursor-pointer rounded-md border border-input bg-card p-0.5"
            />
            <Input id={id} value={current} placeholder="#rrggbb" onChange={(event) => onChange(event.target.value || null)} className="font-mono" />
            {current && (
              <Button variant="ghost" size="sm" onClick={() => onChange(null)} aria-label={`Reset ${field.label}`}>
                <RotateCcw />
              </Button>
            )}
          </div>
        </div>
      );
    }
    case "font":
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} list="customize-fonts" value={typeof value === "string" ? value : ""} placeholder="Google Fonts family name" onChange={(event) => onChange(event.target.value || null)} />
          <datalist id="customize-fonts">
            {FONT_SUGGESTIONS.map((font) => (
              <option key={font} value={font} />
            ))}
          </datalist>
        </div>
      );
    case "select":
      return (
        <div className="grid gap-1.5">
          {label}
          <select
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value || null)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">{field.default == null ? "Template default" : `Default (${String(field.default)})`}</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "toggle": {
      const checked = typeof value === "boolean" ? value : Boolean(field.default);
      return (
        <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-[13px] font-medium text-foreground">{field.label}</span>
          <span className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-border")}>
            <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
            <span className={cn("absolute size-4 rounded-full bg-background shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} aria-hidden="true" />
            {checked && <Check className="absolute left-1 size-3 text-primary-foreground" aria-hidden="true" />}
          </span>
        </label>
      );
    }
    case "number":
    case "range":
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} type="number" min={field.min} max={field.max} value={typeof value === "number" ? value : ""} placeholder={String(field.default ?? "")} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />
        </div>
      );
    default:
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} value={typeof value === "string" ? value : ""} placeholder={typeof field.default === "string" ? field.default : ""} onChange={(event) => onChange(event.target.value || null)} />
        </div>
      );
  }
}
