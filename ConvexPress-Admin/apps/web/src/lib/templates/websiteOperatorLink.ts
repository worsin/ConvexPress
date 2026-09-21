type Handoff = { url: string; instanceKey: string; expiresAt: number };

/** The backend receives only a hash; the one-use secret travels in a fragment. */
export async function createWebsiteOperatorLink(
  create: (args: { codeHash: string }) => Promise<Handoff>,
  expected: { siteUrl: string; instanceKey: string },
): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = (value: Uint8Array) => Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("");
  const code = hex(bytes);
  const codeHash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code))));
  const result = await create({ codeHash });
  const url = new URL(result.url);
  if (result.instanceKey !== expected.instanceKey || result.expiresAt <= Date.now() ||
    url.origin !== new URL(expected.siteUrl).origin || url.username || url.password ||
    !["http:", "https:"].includes(url.protocol)) throw new Error("Website changed while opening editing. Reopen Customize and try again.");
  url.hash = new URLSearchParams({ "cp-customize": code }).toString();
  return url.href;
}
