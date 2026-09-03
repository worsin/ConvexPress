/**
 * Control shell context.
 *
 * Exposes the standalone multisite state (scope, selected website and
 * environment, operator, panels) to the shared admin chrome. In single-site
 * mode the provider is absent and `useControlShell()` returns null, so every
 * shared component renders its site-only variant.
 */

import type { api as controlApi } from "@control/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { createContext, useContext, type ReactNode } from "react";

import type { ScopeSelection } from "./components/ScopeSwitcher";
import type { SitesNode } from "./sites/sites-model";

export type ControlScopeContext = FunctionReturnType<typeof controlApi.context.get>;
export type ControlOrganization = ControlScopeContext["organizations"][number];
export type ControlBusiness = ControlScopeContext["businesses"][number];
export type ControlWebsite = ControlScopeContext["websites"][number];
export type ControlEnvironment = ControlScopeContext["environments"][number];

export type ControlPanel = "sites" | "operations" | "handoff";

export interface ControlOperator {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface ControlShellValue {
  context: ControlScopeContext;
  selection: ScopeSelection;
  pending: boolean;
  scopeError: string | null;
  selectedOrganization: ControlOrganization | null;
  selectedBusiness: ControlBusiness | null;
  selectedWebsite: ControlWebsite | null;
  selectedEnvironment: ControlEnvironment | null;
  websiteEnvironments: ControlEnvironment[];
  /** Whether the selected environment has an active management connection. */
  connectionState: "loading" | "connected" | "missing" | "none";
  operator: ControlOperator;
  changeScope: (next: ScopeSelection) => void;
  selectWebsite: (websiteId: string) => void;
  /** Scope to a business that has no websites yet (for imports/handoff). */
  selectBusiness: (businessId: string) => void;
  selectEnvironment: (instanceId: string) => void;
  signOut: () => Promise<void>;
  openPanel: ControlPanel | null;
  setOpenPanel: (panel: ControlPanel | null) => void;
  /** Node the Sites workspace should focus when opened. */
  sitesNode: SitesNode | null;
  /** Open the Sites workspace, optionally at a node. */
  openSites: (node?: SitesNode) => void;
  /** Short-lived operator token for the protected Electron credential window. */
  getControlToken: () => Promise<string | null>;
  visibility: {
    operations: boolean;
    handoff: boolean;
    handoffExport: boolean;
    handoffImport: boolean;
  };
}

const ControlShellContext = createContext<ControlShellValue | null>(null);

export function ControlShellProvider({
  value,
  children,
}: {
  value: ControlShellValue;
  children: ReactNode;
}) {
  return (
    <ControlShellContext.Provider value={value}>
      {children}
    </ControlShellContext.Provider>
  );
}

/** Returns the control shell when running standalone, otherwise null. */
export function useControlShell(): ControlShellValue | null {
  return useContext(ControlShellContext);
}
