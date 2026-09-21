import { expect, test } from "bun:test";
import { runDeploymentProcess } from "./process";

const runtime = {
  packaged: false,
  resourcesPath: "",
  userDataPath: "",
  execPath: process.execPath,
};

test("process deadline terminates a hung command and permits a subsequent command", async () => {
  const started = Date.now();
  await expect(
    runDeploymentProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      cwd: process.cwd(),
      env: process.env,
      runtime,
      timeoutMs: 100,
    }),
  ).rejects.toThrow("timed out");
  expect(Date.now() - started).toBeLessThan(5000);
  const result = await runDeploymentProcess(process.execPath, ["-e", "console.log('ready')"], {
    cwd: process.cwd(),
    env: process.env,
    runtime,
    timeoutMs: 5000,
  });
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe("ready");
});

test("process cancellation terminates work and output capture remains bounded", async () => {
  const controller = new AbortController();
  const running = runDeploymentProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    cwd: process.cwd(),
    env: process.env,
    runtime,
    signal: controller.signal,
  });
  controller.abort();
  await expect(running).rejects.toThrow("cancelled");
  const result = await runDeploymentProcess(
    process.execPath,
    ["-e", "console.log('x'.repeat(300000))"],
    { cwd: process.cwd(), env: process.env, runtime, timeoutMs: 5000 },
  );
  expect(result.stdout.length).toBeLessThanOrEqual(262144);
});

test("inventory output overflow fails closed and process receipt errors terminate work", async () => {
  await expect(
    runDeploymentProcess(process.execPath, ["-e", "console.log('x'.repeat(300000))"], {
      cwd: process.cwd(),
      env: process.env,
      runtime,
      requireCompleteOutput: true,
    }),
  ).rejects.toThrow("capture limit");
  let closed = false;
  await expect(
    runDeploymentProcess(process.execPath, ["-e", "setInterval(() => {},1000)"], {
      cwd: process.cwd(),
      env: process.env,
      runtime,
      onSpawn: () => {
        throw new Error("disk failed");
      },
      onClose: () => {
        closed = true;
      },
    }),
  ).rejects.toThrow("persist deployment process receipt");
  expect(closed).toBe(true);
});
