"use client";

/**
 * MotionTabs — animated tab component with smooth hover + active bubbles.
 * Ported from ModSanctum (admin-app/apps/web/src/components/ui/motion-tabs.tsx).
 *
 * Dependency: framer-motion. Not installed in ConvexPress-Admin yet — run
 * `bun add framer-motion --filter web` from ConvexPress-Admin/ before using.
 *
 * Usage (controlled):
 *   const [tab, setTab] = useState("overview");
 *   <MotionTabs
 *     tabs={[{ id: "overview", label: "Overview" }, { id: "settings", label: "Settings" }]}
 *     activeTab={tab}
 *     onTabChange={setTab}
 *   />
 */

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Tab = {
  id: string;
  label: string;
};

interface MotionTabsProps {
  tabs: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

const NAV_MARGIN = 6;

export function MotionTabs({
  tabs,
  activeTab: controlledActiveTab,
  onTabChange,
  className,
}: MotionTabsProps) {
  const [internalActiveTab, setInternalActiveTab] = React.useState(tabs[0]?.id);
  const [hoveredTab, setHoveredTab] = React.useState<string | null>(null);
  const activeTab = controlledActiveTab ?? internalActiveTab;

  // Refs for measuring
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const navRef = React.useRef<HTMLElement>(null);
  const tabRefs = React.useRef<Map<string, HTMLAnchorElement>>(new Map());

  // Get rect relative to the wrapper (outer container)
  const getTabRect = React.useCallback((tabId: string) => {
    const wrap = wrapRef.current;
    const tab = tabRefs.current.get(tabId);
    if (!wrap || !tab) return null;

    const wrapRect = wrap.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();

    return {
      top: tabRect.top - wrapRect.top,
      left: tabRect.left - wrapRect.left,
      width: tabRect.width,
      height: tabRect.height,
    };
  }, []);

  // Get full nav rect relative to wrapper
  const getNavRect = React.useCallback(() => {
    const wrap = wrapRef.current;
    const nav = navRef.current;
    if (!wrap || !nav) return null;

    const wrapRect = wrap.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();

    return {
      top: navRect.top - wrapRect.top,
      left: navRect.left - wrapRect.left,
      width: navRect.width,
      height: navRect.height,
    };
  }, []);

  const [activeRect, setActiveRect] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const [hoverRect, setHoverRect] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // Update active rect
  React.useEffect(() => {
    if (!activeTab) return;
    const rect = getTabRect(activeTab);
    if (rect) setActiveRect(rect);
  }, [activeTab, getTabRect]);

  // Update hover rect
  React.useEffect(() => {
    if (hoveredTab) {
      const rect = getTabRect(hoveredTab);
      if (rect) setHoverRect(rect);
    } else {
      const navRect = getNavRect();
      if (navRect) setHoverRect(navRect);
    }
  }, [hoveredTab, getTabRect, getNavRect]);

  // Initial measurement after mount
  React.useEffect(() => {
    const measure = () => {
      const navRect = getNavRect();
      if (navRect) setHoverRect(navRect);

      if (activeTab) {
        const rect = getTabRect(activeTab);
        if (rect) setActiveRect(rect);
      }
    };

    requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeTab, getTabRect, getNavRect]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-fit rounded-[5px] bg-background",
        className,
      )}
    >
      {/* Hover bubble */}
      {hoverRect && (
        <motion.div
          className="absolute rounded-[5px] z-[1] bg-muted"
          initial={false}
          animate={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        />
      )}

      {/* Active bubble */}
      {activeRect && (
        <motion.div
          className="absolute rounded-[5px] z-[2] bg-muted-foreground"
          initial={false}
          animate={{
            top: activeRect.top,
            left: activeRect.left,
            width: activeRect.width,
            height: activeRect.height,
          }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        />
      )}

      {/* Nav with links */}
      <nav
        ref={navRef}
        className="relative w-fit"
        style={{ margin: `${NAV_MARGIN}px` }}
        onMouseLeave={() => setHoveredTab(null)}
      >
        {tabs.map((tab) => (
          <a
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (!controlledActiveTab) {
                setInternalActiveTab(tab.id);
              }
              onTabChange?.(tab.id);
            }}
            onMouseEnter={() => setHoveredTab(tab.id)}
            className={cn(
              "relative z-10 inline-block px-6 py-2 no-underline transition-colors font-bold text-sm tracking-wide",
              activeTab === tab.id
                ? "text-background"
                : "text-foreground/70 hover:text-foreground",
            )}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

export type { Tab, MotionTabsProps };
