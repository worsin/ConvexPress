import { api } from "@control/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

type Check = FunctionArgs<typeof api.rbac.queries.checkManyAccess>["checks"][number];
type Decision = FunctionReturnType<typeof api.rbac.queries.checkManyAccess>[number];
type Registration = readonly Check[];
type Batch = { key: string; checks: Check[] };

// A fixed field order deduplicates equivalent targets without dropping scope.
function checkKey(check: Check) {
  return JSON.stringify([check.selectorType, check.code, check.organizationId ?? null,
    check.businessId ?? null, check.websiteId ?? null, check.instanceId ?? null]);
}

export function accessBatches(registrations: Iterable<Registration>): Batch[] {
  const unique = new Map<string, Check>();
  for (const checks of registrations) for (const check of checks) unique.set(checkKey(check), check);
  const entries = [...unique].sort(([a], [b]) => a.localeCompare(b));
  const batches: Batch[] = [];
  for (let start = 0; start < entries.length; start += 32) {
    const part = entries.slice(start, start + 32);
    batches.push({ key: JSON.stringify(part.map(([key]) => key)), checks: part.map(([, check]) => check) });
  }
  return batches;
}

type AccessContext = {
  register: (id: string, checks: Registration) => () => void;
  decisions: ReadonlyMap<string, Decision>;
};
const Context = createContext<AccessContext | null>(null);

/** Share capability subscriptions across the entire controller screen.
 * Per-component batches still exceed small backends' concurrent-query limit
 * when a policy change invalidates every panel at once.
 */
export function ControlAccessProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState(new Map<string, Registration>());
  const [results, setResults] = useState(new Map<string, readonly Decision[]>());
  const register = useCallback((id: string, checks: Registration) => {
    setRegistrations(previous => new Map(previous).set(id, checks));
    return () => setRegistrations(previous => {
      const next = new Map(previous); next.delete(id); return next;
    });
  }, []);
  const batches = useMemo(() => accessBatches(registrations.values()), [registrations]);
  const publish = useCallback((key: string, value: readonly Decision[] | undefined) => {
    setResults(previous => {
      if (previous.get(key) === value) return previous;
      const next = new Map(previous);
      if (value === undefined) next.delete(key); else next.set(key, value);
      return next;
    });
  }, []);
  const decisions = useMemo(() => {
    const map = new Map<string, Decision>();
    // Never reuse answers from an old target set while its replacement loads.
    for (const batch of batches) {
      const values = results.get(batch.key);
      if (values?.length !== batch.checks.length) continue;
      batch.checks.forEach((check, index) => map.set(checkKey(check), values[index]));
    }
    return map;
  }, [batches, results]);
  const context = useMemo(() => ({ register, decisions }), [register, decisions]);
  return <Context.Provider value={context}>
    {batches.map(batch => <AccessBatch key={batch.key} batch={batch} publish={publish} />)}
    {children}
  </Context.Provider>;
}

function AccessBatch({ batch, publish }: {
  batch: Batch;
  publish: (key: string, value: readonly Decision[] | undefined) => void;
}) {
  const decisions = useQuery(api.rbac.queries.checkManyAccess, { checks: batch.checks });
  useLayoutEffect(() => {
    publish(batch.key, decisions);
    return () => publish(batch.key, undefined);
  }, [batch.key, decisions, publish]);
  return null;
}

/** Undefined means loading/skipped. No permission is optimistically granted. */
export function useControlAccessChecks(args: { checks: Check[] } | "skip"): Decision[] | undefined {
  const context = useContext(Context);
  const id = useId();
  const signature = JSON.stringify(args);
  const checks = useMemo<Check[]>(() => {
    const value = JSON.parse(signature) as typeof args;
    return value === "skip" ? [] : value.checks;
  }, [signature]);
  const register = context?.register;
  useEffect(() => register?.(id, checks), [register, id, checks]);
  // Isolated consumers outside the standalone controller retain their contract.
  const fallback = useQuery(api.rbac.queries.checkManyAccess, context ? "skip" : args);
  if (!context) return fallback;
  if (args === "skip") return undefined;
  const values = checks.map(check => context.decisions.get(checkKey(check)));
  return values.every((value): value is Decision => value !== undefined) ? values : undefined;
}
