import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../../../backend/convex/schema";
import type { EpochTransition, EpochReply } from "@convexpress/site-contract/media-index-epoch";
/** Real site registered coordinator; only provider environment transport is injected. */
export function epochFixture(read: () => { name: string; value: string } | null) {
  const t = convexTest({
    schema,
    modules: {
      "./_generated/server.js": () => import("../../../../backend/convex/_generated/server.js"),
      "./media/epochAuthority.ts": () => import("../../../../backend/convex/media/epochAuthority"),
    },
  });
  const inEnvironment = async <T>(run: () => Promise<T>): Promise<T> => {
    const old = process.env.MEDIA_REFERENCE_INDEX_EPOCH,
      current = read();
    if (current) process.env.MEDIA_REFERENCE_INDEX_EPOCH = current.value;
    else delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;
    try {
      return await run();
    } finally {
      if (old === undefined) delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;
      else process.env.MEDIA_REFERENCE_INDEX_EPOCH = old;
    }
  };
  return {
    readMediaReferenceEpoch: async () => read(),
    readCompletedImport: () =>
      inEnvironment(() =>
        t.query(
          makeFunctionReference<
            "query",
            { importKey: string },
            {
              importId: string;
              pendingEpoch: string;
              activeEpoch: string;
              verified: boolean;
            } | null
          >("media/epochAuthority:completedImport"),
          { importKey: "a".repeat(24) },
        ),
      ),
    coordinateEpoch: async (
      phase: "prepare" | "dispatch" | "verify",
      value: EpochTransition,
    ): Promise<EpochReply> => {
      const old = process.env.MEDIA_REFERENCE_INDEX_EPOCH;
      const current = read();
      if (current) process.env.MEDIA_REFERENCE_INDEX_EPOCH = current.value;
      else delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;
      try {
        return await t.mutation(
          makeFunctionReference<"mutation", EpochTransition & { phase: typeof phase }, EpochReply>(
            "media/epochAuthority:coordinate",
          ),
          { ...value, phase },
        );
      } finally {
        if (old === undefined) delete process.env.MEDIA_REFERENCE_INDEX_EPOCH;
        else process.env.MEDIA_REFERENCE_INDEX_EPOCH = old;
      }
    },
  };
}
