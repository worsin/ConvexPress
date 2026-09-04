/**
 * Shop assistant settings.
 *
 * Everything the storefront's assistant rail does is decided here: whether
 * it shows, where, on which pages, how it opens, how many picks it makes,
 * what it remembers, and the words it uses. Saved to the
 * `commerce.assistant` settings section and read by the public site.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Loader2, Save, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_admin/settings/shop-assistant")({
  component: ShopAssistantSettingsPage,
});

interface AssistantForm {
  enabled: boolean;
  displayName: string;
  tagline: string;
  placement: "left" | "right";
  railWidthPx: number;
  autoOpen: "firstSearch" | "always" | "never";
  routes: { search: boolean; catalog: boolean; product: boolean; cart: boolean; checkout: boolean };
  mobileMode: "sheet" | "hidden";
  model: string;
  maxPicks: number;
  cardsPerGroup: number;
  groups: { accessory: boolean; consumable: boolean; maintenance: boolean; upgrade: boolean; similar: boolean };
  promptChips: "auto" | "curated" | "off";
  curatedPrompts: string[];
  starterPrompts: string[];
  proactiveTips: boolean;
  tipCooldownMs: number;
  memoryEnabled: boolean;
  memoryRetentionDays: number;
  disclosureText: string;
  tone: string;
  rateLimitPerMinute: number;
  searchFacets: boolean;
  drawerRecommendations: boolean;
  freeShippingThresholdMinor: number;
}

const ROUTE_LABELS: Record<keyof AssistantForm["routes"], string> = {
  search: "Search results",
  catalog: "Catalog",
  product: "Product pages",
  cart: "Cart",
  checkout: "Checkout",
};

const GROUP_LABELS: Record<keyof AssistantForm["groups"], string> = {
  accessory: "Goes with it (accessories)",
  consumable: "Keep it stocked (consumables)",
  maintenance: "Keep it running (maintenance)",
  upgrade: "Step up (upgrades)",
  similar: "Similar picks",
};

function Toggle({ id, label, description, checked, onChange }: { id: string; label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-foreground">{label}</span>
        {description && <span className="block text-[12.5px] text-muted-foreground">{description}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
      />
    </label>
  );
}

function Select<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ShopAssistantSettingsPage() {
  const stored = useQuery(api.settings.queries.getBySection, { section: "commerce.assistant" });
  const updateSettings = useMutation(api.settings.mutations.updateSection);
  const [form, setForm] = useState<AssistantForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (stored && !form) setForm(stored as unknown as AssistantForm);
  }, [stored, form]);

  const set = useCallback(<K extends keyof AssistantForm>(key: K, value: AssistantForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      await updateSettings({ section: "commerce.assistant", values: form as unknown as Record<string, unknown> });
      toast.success("Shop assistant settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the settings.");
    } finally {
      setSaving(false);
    }
  }, [form, updateSettings]);

  if (!form) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading settings…
      </div>
    );
  }

  const linesToList = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow="Settings · Commerce"
        title="Shop assistant"
        meta={["Drives the assistant rail on the public storefront"]}
        actions={
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            Save changes
          </Button>
        }
      />

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-[18px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" /> Identity
              </CardTitle>
              <CardDescription>How the assistant introduces itself and speaks.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Toggle id="enabled" label="Show the assistant on the storefront" checked={form.enabled} onChange={(value) => set("enabled", value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="displayName">Name</Label>
                  <Input id="displayName" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tagline">Tagline</Label>
                  <Input id="tagline" value={form.tagline} onChange={(event) => set("tagline", event.target.value)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tone">Tone</Label>
                <Input id="tone" value={form.tone} onChange={(event) => set("tone", event.target.value)} placeholder="warm, expert, concise; explains why each pick fits" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="disclosureText">Disclosure shown under the composer</Label>
                <Textarea id="disclosureText" rows={2} value={form.disclosureText} onChange={(event) => set("disclosureText", event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="model">Model override</Label>
                <Input id="model" value={form.model} onChange={(event) => set("model", event.target.value)} placeholder="Leave empty to use Settings › AI" />
                <p className="text-[12.5px] text-muted-foreground">OpenRouter id such as anthropic/claude-sonnet-4.6. The API key comes from Settings › AI.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Placement</CardTitle>
              <CardDescription>Where the rail lives and when it opens by itself.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Select id="placement" label="Side" value={form.placement} onChange={(value) => set("placement", value)} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
                <Select
                  id="autoOpen"
                  label="Opens automatically"
                  value={form.autoOpen}
                  onChange={(value) => set("autoOpen", value)}
                  options={[
                    { value: "firstSearch", label: "On the first search only" },
                    { value: "always", label: "Always" },
                    { value: "never", label: "Never" },
                  ]}
                />
                <Select id="mobileMode" label="On phones" value={form.mobileMode} onChange={(value) => set("mobileMode", value)} options={[{ value: "sheet", label: "Bottom sheet" }, { value: "hidden", label: "Hidden" }]} />
              </div>
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="railWidthPx">Rail width (px)</Label>
                <Input id="railWidthPx" type="number" min={260} max={480} value={form.railWidthPx} onChange={(event) => set("railWidthPx", Number(event.target.value))} />
              </div>
              <div className="grid gap-2">
                <Label>Pages</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(ROUTE_LABELS) as Array<keyof AssistantForm["routes"]>).map((key) => (
                    <Toggle key={key} id={`route-${key}`} label={ROUTE_LABELS[key]} checked={form.routes[key]} onChange={(value) => set("routes", { ...form.routes, [key]: value })} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <CardDescription>How much it suggests and which groups it may use.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="maxPicks">Picks per brief</Label>
                  <Input id="maxPicks" type="number" min={1} max={12} value={form.maxPicks} onChange={(event) => set("maxPicks", Number(event.target.value))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cardsPerGroup">Cards per group</Label>
                  <Input id="cardsPerGroup" type="number" min={1} max={6} value={form.cardsPerGroup} onChange={(event) => set("cardsPerGroup", Number(event.target.value))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rateLimitPerMinute">Questions per minute</Label>
                  <Input id="rateLimitPerMinute" type="number" min={1} max={120} value={form.rateLimitPerMinute} onChange={(event) => set("rateLimitPerMinute", Number(event.target.value))} />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(GROUP_LABELS) as Array<keyof AssistantForm["groups"]>).map((key) => (
                  <Toggle key={key} id={`group-${key}`} label={GROUP_LABELS[key]} checked={form.groups[key]} onChange={(value) => set("groups", { ...form.groups, [key]: value })} />
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle id="searchFacets" label="AI “narrow your search” chips" description="Shown above product results." checked={form.searchFacets} onChange={(value) => set("searchFacets", value)} />
                <Toggle id="drawerRecommendations" label="“Goes with your cart” in the cart drawer" checked={form.drawerRecommendations} onChange={(value) => set("drawerRecommendations", value)} />
                <Toggle id="proactiveTips" label="Proactive tips after cart changes" checked={form.proactiveTips} onChange={(value) => set("proactiveTips", value)} />
              </div>
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="freeShipping">Free-shipping progress threshold</Label>
                <Input
                  id="freeShipping"
                  type="number"
                  min={0}
                  step="0.01"
                  value={(form.freeShippingThresholdMinor / 100).toFixed(2)}
                  onChange={(event) => set("freeShippingThresholdMinor", Math.round(Number(event.target.value) * 100))}
                />
                <p className="text-[12.5px] text-muted-foreground">In store currency. 0 hides the progress bar.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-[18px]">
          <Card>
            <CardHeader>
              <CardTitle>Prompts</CardTitle>
              <CardDescription>What the rail offers before the shopper types.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Select
                id="promptChips"
                label="Follow-up chips"
                value={form.promptChips}
                onChange={(value) => set("promptChips", value)}
                options={[
                  { value: "auto", label: "Generated from the query" },
                  { value: "curated", label: "Curated list below" },
                  { value: "off", label: "Off" },
                ]}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="starterPrompts">Starter prompts (one per line)</Label>
                <Textarea id="starterPrompts" rows={4} value={form.starterPrompts.join("\n")} onChange={(event) => set("starterPrompts", linesToList(event.target.value))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="curatedPrompts">Curated chips (one per line)</Label>
                <Textarea id="curatedPrompts" rows={4} value={form.curatedPrompts.join("\n")} onChange={(event) => set("curatedPrompts", linesToList(event.target.value))} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Memory</CardTitle>
              <CardDescription>Facts shoppers state about themselves, kept per session or account and always editable by them.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Toggle id="memoryEnabled" label="Remember stated constraints and preferences" checked={form.memoryEnabled} onChange={(value) => set("memoryEnabled", value)} />
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="memoryRetentionDays">Keep for (days)</Label>
                <Input id="memoryRetentionDays" type="number" min={1} max={3650} value={form.memoryRetentionDays} onChange={(event) => set("memoryRetentionDays", Number(event.target.value))} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
