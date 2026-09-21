import { ConvexError } from "convex/values";

/** Provider credentials must not follow redirects or escape in network errors. */
export async function fetchSearchProvider(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ConvexError({ code: "SEARCH_PROVIDER_UNAVAILABLE", message: "The search provider could not be reached. Check its connection and try again." });
  }
}

export async function readSearchProviderJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw invalidResponse();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw invalidResponse(); }
      chunks.push(chunk.value);
    }
    const combined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(combined));
  } catch { throw invalidResponse(); }
  finally { reader.releaseLock(); }
}
function invalidResponse() {
  return new ConvexError({ code: "INVALID_SEARCH_PROVIDER_RESPONSE", message: "The search provider returned an invalid or oversized response." });
}
