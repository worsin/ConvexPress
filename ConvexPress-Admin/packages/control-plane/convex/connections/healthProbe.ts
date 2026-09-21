import { siteHealthResponseSchema } from "@convexpress/site-contract";
export async function probeTargetIdentity(
  target: { managementOrigin: string; websiteKey: string; instanceKey: string },
  fetchImpl: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(
      `${target.managementOrigin}/api/convexpress/management/health`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    if (!response.ok || !response.body) throw Error("unreachable");
    const reader = response.body.getReader();
    let text = "";
    let size = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 65536) throw Error("oversized");
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const health = siteHealthResponseSchema.parse(JSON.parse(text));
    if (health.websiteKey !== target.websiteKey || health.instanceKey !== target.instanceKey) throw Error("target mismatch");
    return health;
  } catch {
    throw Error("Site target identity could not be verified");
  } finally {
    clearTimeout(timer);
  }
}
