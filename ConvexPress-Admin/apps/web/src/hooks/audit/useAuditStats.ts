/**
 * useAuditStats Hook
 *
 * Wraps useQuery(api.auditLogs.queries.getStats) with period state management.
 */

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import type { AuditStats, AuditStatsPeriod } from "@/lib/audit/types";

export function useAuditStats(initialPeriod: AuditStatsPeriod = "today") {
  const [period, setPeriod] = useState<AuditStatsPeriod>(initialPeriod);

  const stats = useQuery(api.auditLogs.queries.getStats, { period });

  const changePeriod = useCallback((newPeriod: AuditStatsPeriod) => {
    setPeriod(newPeriod);
  }, []);

  return {
    stats: stats as AuditStats | undefined,
    period,
    setPeriod: changePeriod,
    isLoading: stats === undefined,
  };
}
