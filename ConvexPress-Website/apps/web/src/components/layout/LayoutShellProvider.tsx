import * as React from "react";

import { useScrollState } from "@/hooks/layout/useScrollState";
import type {
  LayoutShellActions,
  LayoutShellState,
} from "@/lib/layout/types";

type LayoutShellContextValue = LayoutShellState & LayoutShellActions;

const LayoutShellContext = React.createContext<LayoutShellContextValue | null>(
  null,
);

type Action =
  | { type: "TOGGLE_MOBILE_NAV" }
  | { type: "CLOSE_MOBILE_NAV" }
  | { type: "TOGGLE_SEARCH" }
  | { type: "CLOSE_SEARCH" };

interface UIState {
  mobileNavOpen: boolean;
  searchOpen: boolean;
}

function reducer(state: UIState, action: Action): UIState {
  switch (action.type) {
    case "TOGGLE_MOBILE_NAV":
      return {
        ...state,
        mobileNavOpen: !state.mobileNavOpen,
        // Close search when opening mobile nav
        searchOpen: state.mobileNavOpen ? state.searchOpen : false,
      };
    case "CLOSE_MOBILE_NAV":
      return { ...state, mobileNavOpen: false };
    case "TOGGLE_SEARCH":
      return {
        ...state,
        searchOpen: !state.searchOpen,
        // Close mobile nav when opening search
        mobileNavOpen: state.searchOpen ? state.mobileNavOpen : false,
      };
    case "CLOSE_SEARCH":
      return { ...state, searchOpen: false };
    default: {
      const _exhaustiveCheck: never = action;
      return _exhaustiveCheck;
    }
  }
}

interface LayoutShellProviderProps {
  children: React.ReactNode;
}

export function LayoutShellProvider({ children }: LayoutShellProviderProps) {
  const [uiState, dispatch] = React.useReducer(reducer, {
    mobileNavOpen: false,
    searchOpen: false,
  });

  const { isScrolled, showBackToTop } = useScrollState();

  const actions: LayoutShellActions = React.useMemo(
    () => ({
      toggleMobileNav: () => dispatch({ type: "TOGGLE_MOBILE_NAV" }),
      closeMobileNav: () => dispatch({ type: "CLOSE_MOBILE_NAV" }),
      toggleSearch: () => dispatch({ type: "TOGGLE_SEARCH" }),
      closeSearch: () => dispatch({ type: "CLOSE_SEARCH" }),
    }),
    [],
  );

  const value: LayoutShellContextValue = React.useMemo(
    () => ({
      mobileNavOpen: uiState.mobileNavOpen,
      searchOpen: uiState.searchOpen,
      isScrolled,
      showBackToTop,
      ...actions,
    }),
    [uiState, isScrolled, showBackToTop, actions],
  );

  return (
    <LayoutShellContext value={value}>
      {children}
    </LayoutShellContext>
  );
}

export { LayoutShellContext };
