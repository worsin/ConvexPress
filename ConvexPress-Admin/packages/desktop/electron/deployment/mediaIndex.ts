import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  transitionMediaEpoch,
  MEDIA_INDEX_EPOCH_NAME,
  parseEpochReply,
} from "@convexpress/site-contract/media-index-epoch";
import { runDeploymentProcess, type DeploymentProcessOptions } from "./process.js";

export function mediaEpochFromEnvList(output: string): string | null {
  const matches = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith(MEDIA_INDEX_EPOCH_NAME + "="));
  if (matches.length > 1) throw Error("Duplicate media index configuration.");
  if (!matches.length) return null;
  const raw = matches[0].slice(MEDIA_INDEX_EPOCH_NAME.length + 1).trim();
  if (raw.startsWith('"')) {
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value === "string") return value;
    } catch {}
    throw Error("Invalid media index configuration.");
  }
  return raw;
}
/** Values stay in protected temporary files; environment output is never logged. */
export async function initializeDeploymentMediaIndex(
  targetArgs: string[],
  options: DeploymentProcessOptions,
): Promise<string> {
  const run = async (args: string[]) => {
    options.signal?.throwIfAborted();
    const result = await runDeploymentProcess("bunx", ["convex", ...args, ...targetArgs], {
      ...options,
      timeoutMs: Math.min(options.timeoutMs ?? 60_000, 60_000),
      requireCompleteOutput: true,
      onLine: () => {},
    });
    if (result.code !== 0)
      throw Error(
        "Media indexing configuration could not be verified. Retry with current deployment credentials.",
      );
    return result.stdout;
  };
  return transitionMediaEpoch(
    {
      coordinate: async (phase, transition) => {
        const output = await run([
          "run",
          "media/epochAuthority:coordinate",
          JSON.stringify({ ...transition, phase }),
        ]);
        return parseEpochReply(JSON.parse(output));
      },
      write: async (value) => {
        const directory = mkdtempSync(path.join(tmpdir(), "convexpress-media-index-"));
        const file = path.join(directory, "epoch.env");
        writeFileSync(file, `${MEDIA_INDEX_EPOCH_NAME}=${value}\n`, { mode: 0o600 });
        try {
          await run(["env", "set", "--from-file", file, "--force"]);
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      },
    },
    {
      kind: "initialize",
      requestId: "initialize",
      expected: null,
      next: randomUUID().replace(/-/g, ""),
    },
  );
}
