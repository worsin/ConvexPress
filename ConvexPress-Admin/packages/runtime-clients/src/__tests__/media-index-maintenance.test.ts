import { expect, test } from "bun:test";
import { runMediaIndexMaintenance, type MediaIndexProgress } from "../media-index-maintenance";
const progress = (
  sequence = 0,
  status: MediaIndexProgress["status"] = "building",
): MediaIndexProgress => ({
  generation: "epoch_123456789012:version",
  sequence,
  status,
  owner: status === "ready" ? null : "posts",
  completedOwners: status === "ready" ? 26 : 0,
  totalOwners: 26,
  pages: sequence,
  documents: sequence,
});
test("bounded continuation resumes authoritative sequence, independently verifies ready and stops on blocked/scope change", async () => {
  let current = progress();
  let steps = 0;
  const saved: number[] = [];
  const io = {
    read: async () => current,
    begin: async () => current,
    step: async ({ expectedSequence }: { generation: string; expectedSequence: number }) => {
      expect(expectedSequence).toBe(current.sequence);
      steps++;
      return (current = progress(current.sequence + 1, steps === 30 ? "ready" : "building"));
    },
    active: () => true,
    onProgress: (p: MediaIndexProgress) => {
      saved.push(p.sequence);
    },
  };
  expect((await runMediaIndexMaintenance(io)).status).toBe("building");
  expect(steps).toBe(25);
  expect((await runMediaIndexMaintenance(io)).status).toBe("ready");
  expect(steps).toBe(30);
  current = progress(30, "blocked");
  await runMediaIndexMaintenance(io);
  expect(steps).toBe(30);
  current = progress();
  await runMediaIndexMaintenance({ ...io, active: () => false });
  expect(steps).toBe(30);
});
test("generation change, forged ready, no progress and authorization failure stop before further writes", async () => {
  const io = {
    read: async () => progress(),
    begin: async () => progress(),
    active: () => true,
    onProgress: () => {},
  };
  for (const changed of [
    { ...progress(1), generation: "other" },
    { ...progress(1, "ready"), completedOwners: 0 },
    progress(),
  ])
    await expect(runMediaIndexMaintenance({ ...io, step: async () => changed })).rejects.toThrow();
  await expect(
    runMediaIndexMaintenance({
      ...io,
      step: async () => {
        throw Error("revoked");
      },
    }),
  ).rejects.toThrow("revoked");
});
