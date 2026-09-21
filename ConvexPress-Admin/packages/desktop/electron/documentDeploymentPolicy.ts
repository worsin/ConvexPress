/** Origins in each document's delivered CSP, distinct from persisted origins
 * that will be allowed on its next navigation. No session data is stored here. */
const documents = new Map<number, Set<string>>();
function origin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}
export function recordDocumentDeploymentPolicy(id: number, values: readonly unknown[]): void {
  documents.set(id, new Set(values.map(origin).filter((value): value is string => value !== null)));
}
export function documentDeploymentReloadRequired(id: number, values: readonly unknown[]): boolean {
  const allowed = documents.get(id);
  return values.some(value => { const candidate = origin(value); return candidate !== null && !allowed?.has(candidate); });
}
export function forgetDocumentDeploymentPolicy(id: number): void { documents.delete(id); }
