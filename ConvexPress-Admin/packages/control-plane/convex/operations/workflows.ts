import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { lifecycleWorkflow } from "./manager";

export const backupWorkflow = lifecycleWorkflow
  .define({
    args: { operationId: v.id("overseer_siteOperations") },
    returns: v.object({
      backupId: v.id("overseer_siteBackups"),
      snapshotId: v.string(),
      checksumSha256: v.string(),
      tableCount: v.number(),
      storageObjectCount: v.number(),
    }),
  })
  .handler(async (step, args): Promise<{
    backupId: Id<"overseer_siteBackups">;
    snapshotId: string;
    checksumSha256: string;
    tableCount: number;
    storageObjectCount: number;
  }> => {
    await step.runMutation(
      internal.operations.internal.begin,
      { operationId: args.operationId },
      { name: "operation.begin", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.revalidate",
        state: "running",
      },
      { name: "target.revalidate.begin", inline: true },
    );
    await step.runAction(
      internal.operations.actions.revalidateSnapshotTarget,
      { operationId: args.operationId, purpose: "manual" },
      { name: "target.revalidate", retry: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.revalidate",
        state: "succeeded",
        checkpointCode: "target.identity.verified",
      },
      { name: "target.revalidate.complete", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "snapshot.export",
        state: "running",
      },
      { name: "snapshot.export.begin", inline: true },
    );
    const artifact = await step.runAction(
      internal.operations.actions.exportSnapshotArtifact,
      { operationId: args.operationId, purpose: "manual" },
      { name: "snapshot.export", retry: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "snapshot.export",
        state: "succeeded",
        checkpointCode: artifact.snapshotId,
      },
      { name: "snapshot.export.complete", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "snapshot.verify",
        state: "running",
      },
      { name: "snapshot.verify.begin", inline: true },
    );
    const verified = await step.runAction(
      internal.operations.actions.verifySnapshotArtifact,
      {
        operationId: args.operationId,
        purpose: "manual",
        artifactStorageId: artifact.artifactStorageId,
        snapshotId: artifact.snapshotId,
      },
      { name: "snapshot.verify", retry: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "snapshot.verify",
        state: "succeeded",
        checkpointCode: verified.checksumSha256,
      },
      { name: "snapshot.verify.complete", inline: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "operation.finalize",
        state: "running",
      },
      { name: "operation.finalize.begin", inline: true },
    );

    return {
      backupId: verified.backupId,
      snapshotId: verified.snapshotId,
      checksumSha256: verified.checksumSha256,
      tableCount: verified.tableCount,
      storageObjectCount: verified.storageObjectCount,
    };
  });

export const restoreWorkflow = lifecycleWorkflow
  .define({
    args: { operationId: v.id("overseer_siteOperations") },
    returns: v.object({
      importId: v.string(),
      rowsWritten: v.number(),
      sourceSnapshotId: v.string(),
      preparedChecksumSha256: v.string(),
      preservedManagementTableCount: v.number(),
    }),
  })
  .handler(async (step, args): Promise<{
    importId: string;
    rowsWritten: number;
    sourceSnapshotId: string;
    preparedChecksumSha256: string;
    preservedManagementTableCount: number;
  }> => {
    await step.runMutation(
      internal.operations.internal.begin,
      { operationId: args.operationId },
      { name: "operation.begin", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.revalidate",
        state: "running",
      },
      { name: "target.revalidate.begin", inline: true },
    );
    await step.runAction(
      internal.operations.actions.revalidateSnapshotTarget,
      { operationId: args.operationId, purpose: "pre-restore" },
      { name: "target.revalidate", retry: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.revalidate",
        state: "succeeded",
        checkpointCode: "target.identity.verified",
      },
      { name: "target.revalidate.complete", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.prebackup.export",
        state: "running",
      },
      { name: "target.prebackup.export.begin", inline: true },
    );
    const artifact = await step.runAction(
      internal.operations.actions.exportSnapshotArtifact,
      { operationId: args.operationId, purpose: "pre-restore" },
      { name: "target.prebackup.export", retry: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.prebackup.export",
        state: "succeeded",
        checkpointCode: artifact.snapshotId,
      },
      { name: "target.prebackup.export.complete", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.prebackup.verify",
        state: "running",
      },
      { name: "target.prebackup.verify.begin", inline: true },
    );
    const verified = await step.runAction(
      internal.operations.actions.verifySnapshotArtifact,
      {
        operationId: args.operationId,
        purpose: "pre-restore",
        artifactStorageId: artifact.artifactStorageId,
        snapshotId: artifact.snapshotId,
      },
      { name: "target.prebackup.verify", retry: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.prebackup.verify",
        state: "succeeded",
        checkpointCode: verified.checksumSha256,
      },
      { name: "target.prebackup.verify.complete", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "snapshot.import",
        state: "running",
      },
      { name: "snapshot.import.begin", inline: true },
    );
    const imported = await step.runAction(
      internal.operations.actions.importRestoreSnapshot,
      { operationId: args.operationId },
      { name: "snapshot.import", retry: false },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "snapshot.import",
        state: "succeeded",
        checkpointCode: imported.importId,
      },
      { name: "snapshot.import.complete", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.verify",
        state: "running",
      },
      { name: "target.verify.begin", inline: true },
    );
    await step.runAction(
      internal.operations.actions.revalidateSnapshotTarget,
      { operationId: args.operationId, purpose: "pre-restore" },
      { name: "target.verify", retry: true },
    );
    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "target.verify",
        state: "succeeded",
        checkpointCode: "target.identity.verified-after-import",
      },
      { name: "target.verify.complete", inline: true },
    );

    await step.runMutation(
      internal.operations.internal.checkpoint,
      {
        operationId: args.operationId,
        stepKey: "operation.finalize",
        state: "running",
      },
      { name: "operation.finalize.begin", inline: true },
    );
    return imported;
  });

function defineReplacementWorkflow(config: {
  sourcePurpose: "clone-source" | "promote-source";
  targetPurpose: "pre-clone" | "pre-promote";
}) {
  return lifecycleWorkflow
    .define({
      args: { operationId: v.id("overseer_siteOperations") },
      returns: v.object({
        importId: v.string(),
        rowsWritten: v.number(),
        sourceSnapshotId: v.string(),
        preparedChecksumSha256: v.string(),
        preservedManagementTableCount: v.number(),
      }),
    })
    .handler(async (step, args): Promise<{
      importId: string;
      rowsWritten: number;
      sourceSnapshotId: string;
      preparedChecksumSha256: string;
      preservedManagementTableCount: number;
    }> => {
      await step.runMutation(
        internal.operations.internal.begin,
        { operationId: args.operationId },
        { name: "operation.begin", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "source.revalidate",
          state: "running",
        },
        { name: "source.revalidate.begin", inline: true },
      );
      await step.runAction(
        internal.operations.actions.revalidateSnapshotTarget,
        {
          operationId: args.operationId,
          purpose: config.sourcePurpose,
        },
        { name: "source.revalidate", retry: true },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "source.revalidate",
          state: "succeeded",
          checkpointCode: "source.identity.verified",
        },
        { name: "source.revalidate.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.revalidate",
          state: "running",
        },
        { name: "target.revalidate.begin", inline: true },
      );
      await step.runAction(
        internal.operations.actions.revalidateSnapshotTarget,
        {
          operationId: args.operationId,
          purpose: config.targetPurpose,
        },
        { name: "target.revalidate", retry: true },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.revalidate",
          state: "succeeded",
          checkpointCode: "target.identity.verified",
        },
        { name: "target.revalidate.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "source.snapshot.export",
          state: "running",
        },
        { name: "source.snapshot.export.begin", inline: true },
      );
      const sourceArtifact = await step.runAction(
        internal.operations.actions.exportSnapshotArtifact,
        {
          operationId: args.operationId,
          purpose: config.sourcePurpose,
        },
        { name: "source.snapshot.export", retry: true },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "source.snapshot.export",
          state: "succeeded",
          checkpointCode: sourceArtifact.snapshotId,
        },
        { name: "source.snapshot.export.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "source.snapshot.verify",
          state: "running",
        },
        { name: "source.snapshot.verify.begin", inline: true },
      );
      const sourceVerified = await step.runAction(
        internal.operations.actions.verifySnapshotArtifact,
        {
          operationId: args.operationId,
          purpose: config.sourcePurpose,
          artifactStorageId: sourceArtifact.artifactStorageId,
          snapshotId: sourceArtifact.snapshotId,
        },
        { name: "source.snapshot.verify", retry: true },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "source.snapshot.verify",
          state: "succeeded",
          checkpointCode: sourceVerified.checksumSha256,
        },
        { name: "source.snapshot.verify.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.prebackup.export",
          state: "running",
        },
        { name: "target.prebackup.export.begin", inline: true },
      );
      const targetArtifact = await step.runAction(
        internal.operations.actions.exportSnapshotArtifact,
        {
          operationId: args.operationId,
          purpose: config.targetPurpose,
        },
        { name: "target.prebackup.export", retry: true },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.prebackup.export",
          state: "succeeded",
          checkpointCode: targetArtifact.snapshotId,
        },
        { name: "target.prebackup.export.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.prebackup.verify",
          state: "running",
        },
        { name: "target.prebackup.verify.begin", inline: true },
      );
      const targetVerified = await step.runAction(
        internal.operations.actions.verifySnapshotArtifact,
        {
          operationId: args.operationId,
          purpose: config.targetPurpose,
          artifactStorageId: targetArtifact.artifactStorageId,
          snapshotId: targetArtifact.snapshotId,
        },
        { name: "target.prebackup.verify", retry: true },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.prebackup.verify",
          state: "succeeded",
          checkpointCode: targetVerified.checksumSha256,
        },
        { name: "target.prebackup.verify.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.snapshot.import",
          state: "running",
        },
        { name: "target.snapshot.import.begin", inline: true },
      );
      const imported = await step.runAction(
        internal.operations.actions.importReplacementSnapshot,
        { operationId: args.operationId },
        { name: "target.snapshot.import", retry: false },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.snapshot.import",
          state: "succeeded",
          checkpointCode: imported.importId,
        },
        { name: "target.snapshot.import.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.verify",
          state: "running",
        },
        { name: "target.verify.begin", inline: true },
      );
      await step.runAction(
        internal.operations.actions.revalidateSnapshotTarget,
        {
          operationId: args.operationId,
          purpose: config.targetPurpose,
        },
        { name: "target.verify", retry: true },
      );
      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "target.verify",
          state: "succeeded",
          checkpointCode: "target.identity.verified-after-import",
        },
        { name: "target.verify.complete", inline: true },
      );

      await step.runMutation(
        internal.operations.internal.checkpoint,
        {
          operationId: args.operationId,
          stepKey: "operation.finalize",
          state: "running",
        },
        { name: "operation.finalize.begin", inline: true },
      );
      return imported;
    });
}

export const cloneWorkflow = defineReplacementWorkflow({
  sourcePurpose: "clone-source",
  targetPurpose: "pre-clone",
});

export const promoteWorkflow = defineReplacementWorkflow({
  sourcePurpose: "promote-source",
  targetPurpose: "pre-promote",
});
