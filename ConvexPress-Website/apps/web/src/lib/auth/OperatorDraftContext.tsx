import { createContext, useContext } from "react";
import type { OperatorDraftAccess } from "./operatorDraftRecovery";

export const OperatorDraftContext = createContext<OperatorDraftAccess | null>(null);
export const useOperatorDraftRecovery = () => useContext(OperatorDraftContext);
