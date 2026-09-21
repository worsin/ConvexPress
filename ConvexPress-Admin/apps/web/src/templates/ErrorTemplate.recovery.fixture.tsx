import type { ReactNode } from "react";
export { ErrorTemplate } from "./ErrorTemplate";
export const calls = { retry: 0, sites: 0 };
export let standalone = true;
export const setStandalone = (value: boolean) => { standalone = value; };
export function useRouter() { return { invalidate: () => { calls.retry++; } }; }
export function Link({ children, to }: { children: ReactNode; to: string }) { return <a href={to}>{children}</a>; }
export function useControlShell() { return standalone ? { openSites: () => { calls.sites++; } } : null; }
export function StandaloneFrame({ children }: { children: ReactNode }) { return <section aria-label="Control frame"><nav>Site switcher remains available</nav>{children}</section>; }
