/**
 * Shopping shell: the region every commerce route renders inside.
 *
 * Desktop: an assistant rail beside the page content (left or right per
 * settings), sticky, collapsible, remembered. Phones: a bottom sheet with a
 * floating "Ask" button that never covers the checkout controls.
 */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAssistantConfig, type AssistantConfig } from "@/hooks/useAssistantConfig";
import { cn } from "@/lib/utils";
import { AssistantRail } from "./assistant/AssistantRail";

export type ShopRouteKind = "search" | "catalog" | "product" | "cart" | "checkout";

interface ShopShellValue {
  config: AssistantConfig;
  railOpen: boolean;
  openRail: (prompt?: string) => void;
  closeRail: () => void;
  ask: (prompt: string) => void;
  kind: ShopRouteKind;
  query?: string;
  productId?: string;
}

const ShopShellContext = createContext<ShopShellValue | null>(null);

export function useShopShell(): ShopShellValue | null {
  return useContext(ShopShellContext);
}

const RAIL_STATE_KEY = "cp_assistant_rail";
const RAIL_SEEN_KEY = "cp_assistant_seen";

function readStored(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

export function ShopShell({
  kind,
  query,
  productId,
  children,
  className,
}: {
  kind: ShopRouteKind;
  query?: string;
  productId?: string;
  children: ReactNode;
  className?: string;
}) {
  const config = useAssistantConfig();
  const routeEnabled = config.enabled && config.routes[kind] !== false;
  const [railOpen, setRailOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Initial open state, decided once on the client.
  useEffect(() => {
    if (!routeEnabled) return;
    const stored = readStored(RAIL_STATE_KEY);
    if (stored === "open") setRailOpen(true);
    else if (stored === "closed") setRailOpen(false);
    else if (config.autoOpen === "always") setRailOpen(true);
    else if (config.autoOpen === "firstSearch" && (kind === "search" || (kind === "catalog" && query))) {
      if (!readStored(RAIL_SEEN_KEY)) {
        setRailOpen(true);
        writeStored(RAIL_SEEN_KEY, "1");
      }
    }
    setHydrated(true);
  }, [routeEnabled, config.autoOpen, kind, query]);

  const openRail = useCallback((prompt?: string) => {
    if (prompt) setPendingPrompt(prompt);
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setRailOpen(true);
      writeStored(RAIL_STATE_KEY, "open");
    } else {
      setSheetOpen(true);
    }
  }, []);

  const closeRail = useCallback(() => {
    setRailOpen(false);
    setSheetOpen(false);
    writeStored(RAIL_STATE_KEY, "closed");
  }, []);

  const value = useMemo<ShopShellValue>(
    () => ({ config, railOpen, openRail, closeRail, ask: (prompt) => openRail(prompt), kind, query, productId }),
    [config, railOpen, openRail, closeRail, kind, query, productId],
  );

  const railProps = {
    kind,
    query,
    productId,
    pendingPrompt,
    onPromptConsumed: () => setPendingPrompt(null),
  } as const;

  const railFirst = config.placement !== "right";
  const showRail = routeEnabled && railOpen;

  return (
    <ShopShellContext.Provider value={value}>
      <div data-slot="shop-shell" className={cn("relative left-1/2 w-[calc(100vw-1rem)] -translate-x-1/2", className)}>
        <div
          className={cn(
            "mx-auto grid w-full max-w-[1760px] gap-6 px-4 md:px-6 lg:px-8",
            showRail && "lg:grid-cols-[var(--rail-width)_minmax(0,1fr)]",
            showRail && !railFirst && "lg:grid-cols-[minmax(0,1fr)_var(--rail-width)]",
          )}
          style={{ ["--rail-width" as string]: `${config.railWidthPx}px` }}
        >
          {showRail && (
            <aside
              aria-label={config.displayName}
              className={cn(
                "hidden lg:block lg:sticky lg:top-24 lg:self-start",
                !railFirst && "lg:order-last",
              )}
            >
              <div className="h-[calc(100svh-7rem)] overflow-hidden rounded-xl border border-border shadow-sm">
                <AssistantRail {...railProps} active={hydrated} onClose={closeRail} />
              </div>
            </aside>
          )}
          <div className="min-w-0">{children}</div>
        </div>

        {/* Desktop re-open tab */}
        {routeEnabled && !railOpen && hydrated && (
          <button
            type="button"
            onClick={() => openRail()}
            className={cn(
              "fixed bottom-6 z-40 hidden items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-lg transition-colors hover:border-primary/50 hover:text-primary lg:inline-flex",
              railFirst ? "left-6" : "right-6",
            )}
          >
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Ask {config.displayName}
          </button>
        )}

        {/* Mobile sheet */}
        {routeEnabled && config.mobileMode === "sheet" && hydrated && (
          <>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="fixed bottom-4 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg lg:hidden"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Ask {config.displayName}
            </button>
            <DialogPrimitive.Root open={sheetOpen} onOpenChange={setSheetOpen}>
              <DialogPrimitive.Portal>
                <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 data-closed:opacity-0 data-open:opacity-100 lg:hidden" />
                <DialogPrimitive.Popup
                  aria-label={config.displayName}
                  className={cn(
                    "fixed inset-x-0 bottom-0 z-50 flex h-[88svh] flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl ring-1 ring-border transition-transform duration-300 focus:outline-none lg:hidden",
                    "data-closed:translate-y-full data-open:translate-y-0",
                  )}
                >
                  <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
                  <AssistantRail
                    {...railProps}
                    active={sheetOpen}
                    onClose={() => setSheetOpen(false)}
                    onNavigate={() => setSheetOpen(false)}
                    className="min-h-0 flex-1"
                  />
                </DialogPrimitive.Popup>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
          </>
        )}
      </div>
    </ShopShellContext.Provider>
  );
}
