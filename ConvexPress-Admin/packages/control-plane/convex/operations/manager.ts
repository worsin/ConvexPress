import { WorkflowManager } from "@convex-dev/workflow";

import { components } from "../_generated/api";

export const lifecycleWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 4,
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 500,
      base: 2,
    },
    retryActionsByDefault: true,
  },
});
