export function isWizardSender(senderUrl: string): boolean {
  if (!senderUrl) return false;

  try {
    const url = new URL(senderUrl);
    return url.pathname.endsWith("/wizard/index.html");
  } catch {
    return senderUrl.includes("/wizard/index.html");
  }
}
