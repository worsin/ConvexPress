/**
 * Appearance › Templates.
 *
 * The installed template packs, what each one covers (computed from the
 * surface catalog and the plugins enabled on this site), and which one is
 * active for this environment. Saved to the `appearance.template` section;
 * the storefront reads it as `templateConfig`.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Check, ExternalLink, LayoutTemplate, Loader2, Minus, Puzzle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { getElectronBridge } from "@/lib/electron";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { COVERAGE_AREAS, SURFACE_CATALOG } from "@/lib/templates/catalog";
import { TEMPLATE_PACKS, type TemplatePackSummary } from "@/lib/templates/packs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/appearance/templates")({
  component: TemplatesPage,
});

interface TemplateSection {
  active: string;
  overrides: Record<string, string>;
  variants: Record<string, string>;
  settings: Record<string, Record<string, unknown>>;
}

type AreaState = "covered" | "partial" | "fallback" | "disabled";

interface AreaCoverage {
  id: string;
  title: string;
  state: AreaState;
  implemented: number;
  total: number;
}

/** Which of the 17 areas a pack covers, honouring the plugin enabler. */
function coverageFor(pack: TemplatePackSummary, pluginValues: Record<string, boolean> | undefined): AreaCoverage[] {
  const implementsAll = pack.surfaces.includes("*");
  return COVERAGE_AREAS.map((area) => {
    const surfaces = SURFACE_CATALOG.filter((surface) => surface.area === area.id);
    const enabled = !area.plugin || isEnabled(area.plugin, pluginValues);
    const implemented = implementsAll ? surfaces.length : surfaces.filter((surface) => pack.surfaces.includes(surface.id)).length;
    const state: AreaState = !enabled ? "disabled" : implemented === surfaces.length ? "covered" : implemented > 0 ? "partial" : "fallback";
    return { id: area.id, title: area.title, state, implemented, total: surfaces.length };
  });
}

function isEnabled(pluginId: string, values: Record<string, boolean> | undefined): boolean {
  if (!values) return false;
  const definition = getPluginDefinition(pluginId as any);
  const key = definition?.settingsKey ?? `${pluginId}Enabled`;
  return values[key] === true;
}

function openExternal(url: string) {
  const bridge = getElectronBridge();
  if (bridge?.siteRunner?.openUrl) void bridge.siteRunner.openUrl(url);
  else window.open(url, "_blank", "noopener");
}

function TemplatesPage() {
  const stored = useQuery(api.settings.queries.getBySection, { section: "appearance.template" }) as TemplateSection | undefined;
  const general = useQuery(api.settings.queries.getBySection, { section: "general" }) as { siteUrl?: string } | undefined;
  const { values: pluginValues } = usePluginSettings();
  const updateSettings = useMutation(api.settings.mutations.updateSection);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeId = stored?.active ?? "core";
  const selected = TEMPLATE_PACKS.find((pack) => pack.id === (selectedId ?? activeId)) ?? TEMPLATE_PACKS[0];
  const siteUrl = general?.siteUrl?.replace(/\/$/, "") ?? "";
  const coverage = useMemo(() => coverageFor(selected, pluginValues as Record<string, boolean> | undefined), [selected, pluginValues]);

  const activate = useCallback(
    async (packId: string) => {
      setSaving(packId);
      try {
        await updateSettings({
          section: "appearance.template",
          values: { ...(stored ?? { overrides: {}, variants: {}, settings: {} }), active: packId } as unknown as Record<string, unknown>,
        });
        toast.success(`${TEMPLATE_PACKS.find((pack) => pack.id === packId)?.name ?? packId} is now the active template.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not activate the template.");
      } finally {
        setSaving(null);
      }
    },
    [stored, updateSettings],
  );

  if (!stored) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading templates…
      </div>
    );
  }

  const enabledAreas = coverage.filter((area) => area.state !== "disabled");
  const coveredCount = enabledAreas.filter((area) => area.state === "covered").length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow="Appearance"
        title="Templates"
        meta={[`${TEMPLATE_PACKS.length} installed`, `Active: ${TEMPLATE_PACKS.find((pack) => pack.id === activeId)?.name ?? activeId}`]}
      />

      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        {/* Gallery */}
        <div role="radiogroup" aria-label="Installed templates" className="grid gap-3 sm:grid-cols-2">
          {TEMPLATE_PACKS.map((pack) => {
            const isActive = pack.id === activeId;
            const isSelected = pack.id === selected.id;
            const packCoverage = coverageFor(pack, pluginValues as Record<string, boolean> | undefined);
            const covered = packCoverage.filter((area) => area.state === "covered").length;
            const counted = packCoverage.filter((area) => area.state !== "disabled").length;
            return (
              <button
                key={pack.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedId(pack.id)}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4 text-left transition-[border-color,box-shadow,background-color] duration-200",
                  isSelected
                    ? "border-primary bg-primary/[0.04] shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-border bg-surface-2/60">
                  <LayoutTemplate className="size-8 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
                      {pack.name}
                      {isActive && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Active</span>}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">{pack.tagline}</p>
                  </div>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                    {covered}/{counted} areas
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail + coverage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="size-4 text-primary" aria-hidden="true" /> {selected.name}
              <span className="text-[12px] font-normal text-muted-foreground">v{selected.version}</span>
            </CardTitle>
            <CardDescription>{selected.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {selected.bestFor?.length ? (
              <ul className="space-y-1 text-[12.5px] text-foreground">
                {selected.bestFor.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coverage</p>
                <p className="text-[12px] tabular-nums text-muted-foreground">
                  {coveredCount} of {enabledAreas.length} enabled areas
                </p>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {coverage.map((area) => (
                  <li
                    key={area.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]",
                      area.state === "disabled" ? "border-dashed border-border text-muted-foreground" : "border-border bg-surface-2/60 text-foreground",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {area.state === "covered" && <Check className="size-3.5 text-primary" aria-hidden="true" />}
                      {area.state === "partial" && <Minus className="size-3.5 text-warning" aria-hidden="true" />}
                      {area.state === "fallback" && <Minus className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                      {area.state === "disabled" && <Puzzle className="size-3.5" aria-hidden="true" />}
                      {area.title}
                    </span>
                    <span className="tabular-nums text-[11.5px] text-muted-foreground">
                      {area.state === "disabled"
                        ? `not enabled · ${area.implemented} ready`
                        : area.state === "covered"
                          ? "covered"
                          : area.state === "partial"
                            ? `${area.implemented}/${area.total}, rest from Core`
                            : "from Core"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Areas whose extension is switched off in Plugins are not counted; enable one and its coverage appears here immediately.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void activate(selected.id)} disabled={selected.id === activeId || saving !== null}>
                {saving === selected.id ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}
                {selected.id === activeId ? "Active on this environment" : `Activate ${selected.name}`}
              </Button>
              <Button variant="outline" disabled={!siteUrl} onClick={() => siteUrl && openExternal(`${siteUrl}/?template=${selected.id}`)}>
                <ExternalLink data-icon="inline-start" />
                Preview on site
              </Button>
            </div>
            {!siteUrl && <p className="text-[11.5px] text-muted-foreground">Set the site address in Settings › General to preview on the site.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
