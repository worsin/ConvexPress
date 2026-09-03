import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";

import { terminateOwnedProcess } from "./process-lifecycle.mjs";

function groupExists(pid) {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("owned process lifecycle", () => {
  test("terminates a detached process group including its grandchild", async () => {
    if (process.platform === "win32") return;
    const child = spawn(
      process.execPath,
      [
        "-e",
        `const {spawn}=require("node:child_process");spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});setInterval(()=>{},1000);`,
      ],
      { detached: true, stdio: "ignore" },
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(groupExists(child.pid)).toBe(true);

    const result = await terminateOwnedProcess(child, {
      label: "lifecycle regression fixture",
      graceMs: 1_000,
      groupOwned: true,
    });

    expect(result.exited).toBe(true);
    expect(groupExists(child.pid)).toBe(false);
  });

  test("cleans descendants even when the process-group leader already exited", async () => {
    if (process.platform === "win32") return;
    const child = spawn(
      process.execPath,
      [
        "-e",
        `const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});child.unref();`,
      ],
      { detached: true, stdio: "ignore" },
    );
    try {
      await new Promise((resolve) => child.once("exit", resolve));
      expect(groupExists(child.pid)).toBe(true);
      const result = await terminateOwnedProcess(child, {
        label: "exited leader regression fixture",
        graceMs: 1_000,
        groupOwned: true,
      });
      expect(result.exited).toBe(true);
      expect(groupExists(child.pid)).toBe(false);
    } finally {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The expected cleanup path already removed the group.
      }
    }
  });
});
