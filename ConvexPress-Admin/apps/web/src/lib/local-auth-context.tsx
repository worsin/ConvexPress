import { createContext, useContext, type ReactNode } from "react";

interface LocalAuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: { id: string; email: string; displayName: string } | null;
  login: (identifier: string, password: string) => Promise<unknown>;
  logout: () => Promise<void>;
}

const LocalAuthContext = createContext<LocalAuthContextValue | null>(null);

export function LocalAuthProvider({
  value,
  children,
}: {
  value: LocalAuthContextValue;
  children: ReactNode;
}) {
  return (
    <LocalAuthContext.Provider value={value}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuthContext() {
  const ctx = useContext(LocalAuthContext);
  if (!ctx) throw new Error("useLocalAuthContext must be used within LocalAuthProvider");
  return ctx;
}
