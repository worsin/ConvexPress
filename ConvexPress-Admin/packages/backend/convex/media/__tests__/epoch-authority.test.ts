import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import {
  MEDIA_INDEX_EPOCH_NAME,
  transitionMediaEpoch,
  type EpochTransition,
  type EpochReply,
} from "@convexpress/site-contract/media-index-epoch";
import { currentReferenceGeneration } from "../reverseIndex";
const ref = makeFunctionReference<
  "mutation",
  EpochTransition & { phase: "prepare" | "dispatch" | "verify" },
  EpochReply
>("media/epochAuthority:coordinate");
const modules = {
  "./_generated/server.js": () => import("../../_generated/server.js"),
  "./media/epochAuthority.ts": () => import("../epochAuthority"),
};
async function fixture(run: (t: ReturnType<typeof convexTest>) => Promise<void>) {
  const previous = process.env[MEDIA_INDEX_EPOCH_NAME];
  delete process.env[MEDIA_INDEX_EPOCH_NAME];
  try {
    await run(convexTest({ schema, modules }));
  } finally {
    if (previous === undefined) delete process.env[MEDIA_INDEX_EPOCH_NAME];
    else process.env[MEDIA_INDEX_EPOCH_NAME] = previous;
  }
}
const initial: EpochTransition = {
  kind: "initialize",
  requestId: "initialize",
  expected: null,
  next: "initial_1234567890abcdef",
};
test("shared registered authority gives concurrent independent initializers one dispatch and reuses its stable epoch", async () =>
  fixture(async (t) => {
    const coordinate = (phase: "prepare" | "dispatch" | "verify", transition: EpochTransition) =>
      t.mutation(ref, { ...transition, phase });
    const [a, b] = await Promise.all([
      coordinate("prepare", initial),
      coordinate("prepare", { ...initial, next: "other_1234567890abcdef" }),
    ]);
    expect(a.claim?.next).toBe(b.claim?.next);
    const [first, second] = await Promise.all([
      coordinate("dispatch", initial),
      coordinate("dispatch", initial),
    ]);
    expect([first.dispatch, second.dispatch]).toEqual([true, false]);
    await expect(coordinate("verify", initial)).rejects.toThrow();
    process.env[MEDIA_INDEX_EPOCH_NAME] = initial.next;
    expect((await coordinate("verify", initial)).claim?.phase).toBe("verified");
    let writes = 0;
    expect(
      await transitionMediaEpoch(
        {
          coordinate,
          write: async () => {
            writes++;
          },
        },
        { ...initial, next: "third_1234567890abcdef" },
      ),
    ).toBe(initial.next);
    expect(writes).toBe(0);
  }));
test("lost write acknowledgement reconciles once; unknown dispatch fences all controllers without lease takeover", async () =>
  fixture(async (t) => {
    const coordinate = (phase: "prepare" | "dispatch" | "verify", transition: EpochTransition) =>
      t.mutation(ref, { ...transition, phase });
    let writes = 0;
    await expect(
      transitionMediaEpoch(
        {
          coordinate,
          write: async () => {
            writes++;
            throw Error("lost");
          },
        },
        initial,
      ),
    ).rejects.toThrow();
    await expect(
      transitionMediaEpoch(
        {
          coordinate,
          write: async () => {
            writes++;
          },
        },
        initial,
      ),
    ).rejects.toThrow();
    expect(writes).toBe(1);
    await expect(
      coordinate("prepare", {
        kind: "import",
        requestId: "import:abc",
        expected: null,
        next: `mi_pending_${"a".repeat(24)}_${"b".repeat(32)}`,
      }),
    ).rejects.toThrow();
    process.env[MEDIA_INDEX_EPOCH_NAME] = initial.next;
    expect(
      await transitionMediaEpoch(
        {
          coordinate,
          write: async () => {
            writes++;
          },
        },
        initial,
      ),
    ).toBe(initial.next);
    expect(writes).toBe(1);
  }));
test("pending import blocks indexing and initialization through database replacement until known-ID completion activates", async () =>
  fixture(async (t) => {
    const coordinate = (phase: "prepare" | "dispatch" | "verify", transition: EpochTransition) =>
      t.mutation(ref, { ...transition, phase });
    const io = {
      coordinate,
      write: async (value: string) => {
        process.env[MEDIA_INDEX_EPOCH_NAME] = value;
      },
    };
    const pending = `mi_pending_${"a".repeat(24)}_${"b".repeat(32)}`;
    await transitionMediaEpoch(io, {
      kind: "import",
      requestId: "import:abc",
      expected: null,
      next: pending,
    });
    expect(() => currentReferenceGeneration()).toThrow();
    await expect(transitionMediaEpoch(io, initial)).rejects.toThrow();
    await expect(
      transitionMediaEpoch(io, {
        kind: "activate",
        requestId: "premature",
        expected: pending,
        next: `mi_ready_${"b".repeat(32)}`,
      }),
    ).rejects.toThrow();
    await transitionMediaEpoch(io, {
      kind: "bind-import",
      requestId: "bind:abc",
      expected: pending,
      next: `${pending}_knownimport`,
    });
    // Actual replaceAll may remove all authority rows; external known identity survives.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("media_epoch_claim").unique();
      if (row) await ctx.db.delete(row._id);
    });
    await expect(transitionMediaEpoch(io, initial)).rejects.toThrow();
    await transitionMediaEpoch(io, {
      kind: "activate",
      requestId: "activate:abc",
      expected: `${pending}_knownimport`,
      next: `mi_ready_${"b".repeat(32)}`,
    });
    expect(currentReferenceGeneration()?.epoch).toBe(`mi_ready_${"b".repeat(32)}`);
  }));
