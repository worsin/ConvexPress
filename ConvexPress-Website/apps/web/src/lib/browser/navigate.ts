/**
 * Full-page navigation (a fresh document, as after a checkout), kept in one
 * place so tests can observe where the page went.
 */
export function goTo(url: string): void {
  if (typeof window !== "undefined") window.location.assign(url);
}
