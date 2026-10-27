import { useQuery } from "convex-helpers/react/cache";

import { api } from "@backend/convex/_generated/api";
import type { ManagedInfo, ManagedTable } from "./ManagedRecord";

/** Who manages a record: undefined while loading, null when admins can edit it. */
export function useManagedRecord(tableName: ManagedTable, recordId: string | undefined): ManagedInfo | null | undefined {
  return useQuery(api.managedRecords.queries.forRecord, recordId ? { tableName, recordId } : "skip");
}
