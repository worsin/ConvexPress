/**
 * Shopping shell: the region every commerce route renders inside.
 *
 * Composition comes from the active shop layout preset (Settings › Shop
 * layouts):
 *
 * - **marketplace** — edge-to-edge like a large retailer: assistant column on
 *   the left, catalog in the middle, persistent cart on the right.
 * - **boutique** — a centered, fixed-width page with the assistant beside the
 *   content (left or right per assistant settings) and the persistent cart
 *   on the right.
 *
 * The assistant column stays mounted and animates its width, so opening and
 * closing slides the page rather than snapping it, and the conversation
 * survives a close. Phones get a bottom sheet with a floating "Ask" button.
 */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAssistantConfig, type AssistantConfig } from "@/hooks/useAssistantConfig";
import { useShopLayout, type ShopLayout } from "@/hooks/useShopLayout";
import { cn } from "@/lib/utils";
import { AssistantRail } from "./assistant/AssistantRail";
import { CartPanel } from "./CartPanel";

export type ShopRouteKind = "search" | "catalog" | "product" | "cart" | "checkout";

interface ShopShellValue {
  config: AssistantConfig;
  layout: ShopLayout;
  railOpen: boolean;
  openRail: (prompt?: string) => void;
  closeRail: () => void;
  toggleRail: () => void;
  ask: (prompt: string) => void;
  /** True when the persistent cart column is part of this page on wide screens. */
  cartColumn: boolean;
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
const COLUMN_GAP_PX = 24;
const EASE = "cubic-bezier(0.22, 0.8, 0.24, 1)";

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
  initialPrompt,
  cart = true,
  children,
  className,
}: {
  kind: ShopRouteKind;
  query?: string;
  productId?: string;
  /** Question to open the assistant with on arrival (e.g. from a homepage block). */
  initialPrompt?: string;
  /** Show the persistent cart column (off on the cart page itself). */
  cart?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const config = useAssistantConfig();
  const layout = useShopLayout();
  const routeEnabled = config.enabled && config.routes[kind] !== false;
  const [railOpen, setRailOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Initial open state, decided once on the client.
  useEffect(() => {
    if (!routeEnabled) {
      setHydrated(true);
      return;
    }
    const stored = readStored(RAIL_STATE_KEY);
    if (stored === "open") setRailOpen(true);
    else if (stored === "closed") setRailOpen(false);
    else if (config.autoOpen === "always") setRailOpen(true);
    else if (config.autoOpen === "firstSearch" && (kind === "search" || (kind === "catalog" && query))) {
      // Open once, then stay open until the shopper closes it.
      if (!readStored(RAIL_SEEN_KEY)) {
        setRailOpen(true);
        writeStored(RAIL_SEEN_KEY, "1");
        writeStored(RAIL_STATE_KEY, "open");
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

  const toggleRail = useCallback(() => {
    if (railOpen) closeRail();
    else openRail();
  }, [railOpen, closeRail, openRail]);

  // A question handed in through the URL opens the assistant once.
  const askedInitial = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || !routeEnabled || !initialPrompt || askedInitial.current === initialPrompt) return;
    askedInitial.current = initialPrompt;
    openRail(initialPrompt);
  }, [hydrated, routeEnabled, initialPrompt, openRail]);

  const marketplace = layout.shopLayout === "marketplace";
  // Marketplace always keeps the assistant on the left; boutique follows the assistant setting.
  const railLeft = marketplace ? true : config.placement !== "right";
  const cartColumn = cart && layout.cartPanel === "persistent";
  const railWidth = marketplace ? Math.max(config.railWidthPx, 340) : config.railWidthPx;
  const showRail = routeEnabled && railOpen;

  const value = useMemo<ShopShellValue>(
    () => ({
      config,
      layout,
      railOpen: showRail,
      openRail,
      closeRail,
      toggleRail,
      ask: (prompt) => openRail(prompt),
      cartColumn,
      kind,
      query,
      productId,
    }),
    [config, layout, showRail, openRail, closeRail, toggleRail, cartColumn, kind, query, productId],
  );

  const railProps = {
    kind,
    query,
    productId,
    pendingPrompt,
    onPromptConsumed: () => setPendingPrompt(null),
  } as const;

  const assistantColumn = routeEnabled ? (
    <aside
      aria-label={config.displayName}
      aria-hidden={!showRail}
      // Width and the flex gap animate together so the catalog slides over instead of jumping.
      className="hidden shrink-0 self-start overflow-hidden lg:sticky lg:top-24 lg:block"
      style={{
        width: showRail ? railWidth : 0,
        [railLeft ? "marginRight" : "marginLeft"]: showRail ? 0 : -COLUMN_GAP_PX,
        transition: hydrated ? `width 360ms ${EASE}, margin 360ms ${EASE}` : undefined,
      }}
    >
      <div
        // Keep the rail mounted: the conversation survives a close, and reopening is instant.
        {...(showRail ? {} : { inert: true })}
        className="h-[calc(100svh-7rem)] overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        style={{
          width: railWidth,
          opacity: showRail ? 1 : 0,
          transform: showRail ? "translateX(0)" : `translateX(${railLeft ? -16 : 16}px)`,
          transition: hydrated ? `opacity 260ms ${EASE} ${showRail ? "80ms" : "0ms"}, transform 360ms ${EASE}` : undefined,
        }}
      >
        <AssistantRail {...railProps} active={hydrated && showRail} onClose={closeRail} />
      </div>
    </aside>
  ) : null;

  return (
    <ShopShellContext.Provider value={value}>
      <div
        data-slot="shop-shell"
        data-layout={layout.shopLayout}
        className={cn("relative left-1/2 w-[calc(100vw-1rem)] -translate-x-1/2", className)}
      >
        <div
          className={cn(
            "mx-auto flex w-full items-start gap-6 px-4 md:px-6",
            marketplace ? "max-w-none xl:px-8" : "max-w-[1440px] lg:px-8",
          )}
        >
          {railLeft && assistantColumn}
          <div className="min-w-0 flex-1">{children}</div>
          {!railLeft && assistantColumn}
          {cartColumn && (
            <aside
              aria-label="Your cart"
              className={cn("hidden shrink-0 self-start xl:sticky xl:top-24 xl:block", marketplace ? "w-[300px]" : "w-[280px]")}
            >
              {/* Ends above the corner support button so the checkout row is never covered. */}
              <CartPanel className="h-[calc(100svh-12rem)]" compact={!marketplace} />
            </aside>
          )}
        </div>

        {/* Desktop re-open tab */}
        {routeEnabled && hydrated && (
          <button
            type="button"
            onClick={() => openRail()}
            aria-hidden={railOpen}
            tabIndex={railOpen ? -1 : 0}
            className={cn(
              "fixed bottom-6 z-40 hidden items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-lg transition-[opacity,transform,color,border-color] duration-300 hover:border-primary/50 hover:text-primary lg:inline-flex",
              railLeft ? "left-6" : "right-6",
              railOpen ? "pointer-events-none translate-y-3 opacity-0" : "translate-y-0 opacity-100",
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
