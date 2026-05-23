import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/test-rates",
)({
  component: TestRatesPage,
});

function TestRatesPage() {
  const calculateRates = useAction(
    (api as any).shipping.rates.pipeline.calculateRates,
  );

  const [sessionToken, setSessionToken] = useState("");
  const [form, setForm] = useState({
    line1: "",
    city: "",
    state: "",
    postalCode: "",
    countryCode: "US",
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionToken.trim()) {
      toast.error("A checkout session token is required to test rates.");
      return;
    }
    if (!form.line1.trim() || !form.city.trim() || !form.postalCode.trim()) {
      toast.error("Address line 1, city, and postal code are required.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await calculateRates({
        sessionToken: sessionToken.trim(),
        shippingAddress: {
          line1: form.line1.trim(),
          city: form.city.trim(),
          state: form.state.trim() || undefined,
          postalCode: form.postalCode.trim(),
          countryCode: form.countryCode.trim().toUpperCase(),
        },
      });
      setResult(response);
      toast.success(`Pipeline returned ${response.quotes?.length ?? 0} quotes.`);
    } catch (err: any) {
      toast.error(err?.data?.message ?? err?.message ?? "Pipeline failed.");
      setResult({ error: err?.data?.message ?? err?.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Test Shipping Rates</h1>
          <p className="text-sm text-muted-foreground">
            Run the full v2 rate-calculation pipeline against a real cart and
            address. Diagnostic trace shows zone match, provider timings, and
            ranked quotes.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleRun}
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Checkout Session Token *
          </label>
          <input
            type="text"
            value={sessionToken}
            onChange={(e) => setSessionToken(e.target.value)}
            placeholder="Get this from a customer's active cart"
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Address Line 1 *" value={form.line1} onChange={(v) => set("line1", v)} placeholder="123 Main St" />
          <Field label="City *" value={form.city} onChange={(v) => set("city", v)} placeholder="New York" />
          <Field label="State" value={form.state} onChange={(v) => set("state", v)} placeholder="NY" />
          <Field label="Postal Code *" value={form.postalCode} onChange={(v) => set("postalCode", v)} placeholder="10001" />
          <Field label="Country" value={form.countryCode} onChange={(v) => set("countryCode", v)} placeholder="US" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Running pipeline..." : "Calculate Rates"}
        </button>
      </form>

      {result && (
        <div className="space-y-4">
          {result.error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <div className="font-medium text-destructive">Pipeline Error</div>
              <div className="mt-1 text-sm text-foreground">{result.error}</div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="font-semibold text-foreground">Diagnostic Trace</h2>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Matched zone:</div>
                  <div className="text-foreground">
                    {result.matchedZone?.name ?? "(none)"}
                  </div>
                  <div className="text-muted-foreground">Fell back to manual:</div>
                  <div className="text-foreground">
                    {result.fellBackToManual ? "Yes" : "No"}
                  </div>
                  <div className="text-muted-foreground">Total quotes:</div>
                  <div className="text-foreground">{result.quotes?.length ?? 0}</div>
                </div>
                {Array.isArray(result.stages) && result.stages.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-muted-foreground">Stages</div>
                    <ul className="mt-1 space-y-1 text-xs">
                      {result.stages.map((stage: any, i: number) => (
                        <li key={i} className="flex justify-between font-mono">
                          <span className={stage.success ? "text-foreground" : "text-destructive"}>
                            {stage.stage} {stage.detail ? `(${stage.detail})` : ""}
                          </span>
                          <span className="text-muted-foreground">{stage.durationMs}ms</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {Array.isArray(result.quotes) && result.quotes.length > 0 && (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Carrier</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Service</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Days</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.quotes.map((q: any) => (
                        <tr key={q.quoteKey} className="border-t border-border">
                          <td className="px-3 py-2 text-foreground">{q.carrierName}</td>
                          <td className="px-3 py-2 text-foreground">{q.serviceName}</td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {(q.amount / 100).toLocaleString(undefined, {
                              style: "currency",
                              currency: q.currency || "USD",
                            })}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {q.estimatedDaysMin ?? "—"}
                            {q.estimatedDaysMax && q.estimatedDaysMax !== q.estimatedDaysMin
                              ? `–${q.estimatedDaysMax}`
                              : ""}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {q.isCheapest && <span className="mr-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600">Cheapest</span>}
                            {q.isFastest && <span className="mr-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600">Fastest</span>}
                            {q.isBestValue && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Best Value</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
