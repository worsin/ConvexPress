import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import type {
  AdminShellState,
  AdminShellActions,
  ScreenOptionsConfig,
} from "@/lib/admin-shell/types";
import { LS_KEY_SIDEBAR_COLLAPSED, MOBILE_BREAKPOINT, TABLET_BREAKPOINT } from "@/lib/admin-shell/constants";

type AdminShellContextType = AdminShellState & AdminShellActions;

export const AdminShellContext = createContext<AdminShellContextType | null>(
  null,
);

interface AdminShellProviderProps {
  children: React.ReactNode;
}

export function AdminShellProvider({ children }: AdminShellProviderProps) {
  // ─── Sidebar Collapsed State ────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY_SIDEBAR_COLLAPSED);
      return stored === "true";
    } catch {
      return false;
    }
  });

  // ─── Mobile Sidebar State ──────────────────────────────────────────────
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ─── Expanded Sections State ───────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  // ─── Screen Options State ─────────────────────────────────────────────
  const [screenOptions, setScreenOptionsState] =
    useState<ScreenOptionsConfig | null>(null);

  // ─── Router State for Mobile Close ─────────────────────────────────────
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  // ─── Responsive Auto-Collapse ──────────────────────────────────────────
  useEffect(() => {
    const tabletQuery = window.matchMedia(
      `(max-width: ${TABLET_BREAKPOINT - 1}px)`,
    );

    const handleTabletChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setSidebarCollapsedState(true);
      } else {
        try {
          const stored = localStorage.getItem(LS_KEY_SIDEBAR_COLLAPSED);
          setSidebarCollapsedState(stored === "true");
        } catch {
          setSidebarCollapsedState(false);
        }
      }
    };

    if (tabletQuery.matches) {
      setSidebarCollapsedState(true);
    }

    tabletQuery.addEventListener("change", handleTabletChange);
    return () => tabletQuery.removeEventListener("change", handleTabletChange);
  }, []);

  // ─── Mobile Detection ──────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    );
    const handleMobileChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) {
        setMobileSidebarOpen(false);
      }
    };
    setIsMobile(mobileQuery.matches);
    mobileQuery.addEventListener("change", handleMobileChange);
    return () => mobileQuery.removeEventListener("change", handleMobileChange);
  }, []);

  // ─── Actions ───────────────────────────────────────────────────────────

  const setSidebarCollapsed = useCallback((value: boolean) => {
    setSidebarCollapsedState(value);
    try {
      localStorage.setItem(LS_KEY_SIDEBAR_COLLAPSED, String(value));
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const expandSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      if (prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.add(sectionId);
      return next;
    });
  }, []);

  const setScreenOptions = useCallback(
    (config: ScreenOptionsConfig | null) => {
      setScreenOptionsState(config);
    },
    [],
  );

  // ─── Context Value ─────────────────────────────────────────────────────
  const value = useMemo<AdminShellContextType>(
    () => ({
      sidebarCollapsed: isMobile ? true : sidebarCollapsed,
      mobileSidebarOpen,
      expandedSections,
      screenOptions,
      toggleSidebar,
      setSidebarCollapsed,
      toggleMobileSidebar,
      closeMobileSidebar,
      toggleSection,
      expandSection,
      setScreenOptions,
    }),
    [
      sidebarCollapsed,
      isMobile,
      mobileSidebarOpen,
      expandedSections,
      screenOptions,
      toggleSidebar,
      setSidebarCollapsed,
      toggleMobileSidebar,
      closeMobileSidebar,
      toggleSection,
      expandSection,
      setScreenOptions,
    ],
  );

  return (
    <AdminShellContext value={value}>
      {children}
    </AdminShellContext>
  );
}
