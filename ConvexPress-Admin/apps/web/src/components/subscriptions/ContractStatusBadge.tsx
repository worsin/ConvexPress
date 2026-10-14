import { cn } from "@/lib/utils";

import { STATUS_LABEL, STATUS_TONE, type ContractStatus } from "./billingFormat";

export function ContractStatusBadge({ status, className }: { status: ContractStatus; className?: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}
