import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { api } from "@backend/convex/_generated/api";
import { shippingPromisesSchema, type ShippingPromise } from "@backend/canonical-blocks-foundation/shippingPolicyContracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = ShippingPromise & { key: string };
const icons = ["clock", "check", "heart", "map-pin", "mail"] as const;
const iconLabels = { clock: "Delivery", check: "Assurance", heart: "Care", "map-pin": "Location", mail: "Contact" };
export function StorefrontPromisesSettings() {
  const settings = useQuery(api.settings.queries.getBySection, { section: "commerce.general" });
  const save = useMutation(api.settings.mutations.updateSection);
  const [draft, setDraft] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const rawSettings: unknown = settings;
  const savedPolicies = rawSettings && typeof rawSettings === "object" && "storefrontPromises" in rawSettings ? rawSettings.storefrontPromises : [];
  const parsed = shippingPromisesSchema.safeParse(savedPolicies);
  const rows = draft ?? (parsed.success ? parsed.data.map((item, i) => ({ ...item, key: `saved-${i}` })) : []);
  const update = (key: string, values: Partial<ShippingPromise>) => setDraft(rows.map(row => row.key === key ? { ...row, ...values } : row));
  async function publish() {
    const next = shippingPromisesSchema.safeParse(rows.map(({ key, ...row }) => row));
    if (!next.success) { toast.error("Each policy needs a title and a valid optional link. Limit policies to eight."); return; }
    setSaving(true);
    try {
      await save({ section: "commerce.general", values: { storefrontPromises: next.data } });
      setDraft(null);
      toast.success("Storefront policies published.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not publish storefront policies."); }
    finally { setSaving(false); }
  }
  return <section className="rounded-3xl border border-border bg-card p-6" aria-labelledby="storefront-policies-title">
    <h2 id="storefront-policies-title" className="text-lg font-semibold">Storefront policies</h2>
    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Publish the delivery, returns and care policies shown by the Shipping Promise block. Only include policies your store honors. These descriptions do not change checkout rates or return eligibility.</p>
    {!parsed.success && <p role="alert" className="mt-4 text-destructive">Saved policies could not be read. Correct the stored policies before editing them here.</p>}
    {settings === undefined ? <p role="status" className="mt-4">Loading policies…</p> : <fieldset disabled={saving || !parsed.success} className="mt-5 space-y-5">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No public policies configured. The Shipping Promise block stays hidden until you publish one.</p>}
      {rows.map((row, i) => <div key={row.key} className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor={`policy-title-${row.key}`}>Policy {i + 1} title</Label><Input id={`policy-title-${row.key}`} value={row.title} maxLength={160} onChange={e => update(row.key, { title: e.target.value })}/></div>
        <div className="grid gap-2"><Label htmlFor={`policy-icon-${row.key}`}>Symbol</Label><select id={`policy-icon-${row.key}`} className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={row.icon} onChange={e => { const icon = icons.find(value => value === e.target.value); if (icon) update(row.key, { icon }); }}>{icons.map(icon => <option key={icon} value={icon}>{iconLabels[icon]}</option>)}</select></div>
        <div className="grid gap-2 sm:col-span-2"><Label htmlFor={`policy-body-${row.key}`}>Description</Label><Textarea id={`policy-body-${row.key}`} value={row.body} maxLength={3000} onChange={e => update(row.key, { body: e.target.value })}/></div>
        <div className="grid gap-2"><Label htmlFor={`policy-link-${row.key}`}>Policy link (optional)</Label><Input id={`policy-link-${row.key}`} value={row.href ?? ""} maxLength={2048} placeholder="/shipping" onChange={e => update(row.key, { href: e.target.value || null })}/></div>
        <div className="flex flex-wrap items-end gap-2"><Button type="button" variant="outline" size="sm" aria-label={`Move policy ${i + 1} up`} disabled={i === 0} onClick={() => { const next = [...rows]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; setDraft(next); }}>Move up</Button><Button type="button" variant="ghost" size="sm" aria-label={`Remove policy ${i + 1}`} onClick={() => setDraft(rows.filter(item => item.key !== row.key))}>Remove</Button></div>
      </div>)}
      <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={rows.length >= 8} onClick={() => setDraft([...rows, { key: crypto.randomUUID(), icon: "clock", title: "", body: "", href: null }])}>Add policy</Button><Button type="button" disabled={draft === null} onClick={() => void publish()}>{saving ? "Publishing…" : "Publish storefront policies"}</Button>{draft !== null && <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>}</div>
    </fieldset>}
  </section>;
}
