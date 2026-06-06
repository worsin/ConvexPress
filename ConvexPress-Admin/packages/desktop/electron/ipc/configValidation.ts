const READABLE_CONFIG_KEYS = new Set([
  "mode",
  "convexUrl",
  "convexSiteUrl",
  "siteName",
  "setupComplete",
  "pendingAdminCredentials",
  "pendingLoginCredentials",
]);

const CLEARABLE_CONFIG_KEYS = new Set([
  "pendingAdminCredentials",
  "pendingLoginCredentials",
]);

export function assertReadableConfigKey(key: string): void {
  if (!READABLE_CONFIG_KEYS.has(key)) {
    throw new Error(`Config key not allowed: ${key}`);
  }
}

export function assertRendererConfigClear(key: string, value: unknown): void {
  if (!CLEARABLE_CONFIG_KEYS.has(key)) {
    throw new Error(`Config key is read-only: ${key}`);
  }
  if (value !== null) {
    throw new Error(`Config key can only be cleared from the renderer: ${key}`);
  }
}
