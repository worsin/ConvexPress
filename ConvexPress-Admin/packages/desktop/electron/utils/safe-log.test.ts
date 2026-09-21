import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("asynchronous output-pipe errors do not enter the global exception logger or starve the event loop", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-output-guard-"));
  try {
    const compiled = new Bun.Transpiler({ loader: "ts", target: "node" }).transformSync(
      readFileSync(path.join(import.meta.dir, "safe-log.ts"), "utf8"),
    );
    const script = `
      import {writeFileSync} from 'node:fs';
      const {safeLog,safeError}=await import('data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}');
      let errors=0;
      process.on('uncaughtException', error=>{
        errors++;
        if(errors>5) {writeFileSync(process.env.REPORT,JSON.stringify({errors,heartbeat:false}));process.exit(1)}
        safeError('uncaught',error);
      });
      // Electron/launcher console forwarding can write asynchronously, unlike
      // Node's default Console which adds its own temporary error listener.
      console.log=console.error=()=>queueMicrotask(()=>process.stderr.emit('error',Object.assign(new Error('write EPIPE'),{code:'EPIPE'})));
      queueMicrotask(()=>process.stdout.emit('error',Object.assign(new Error('write EPIPE'),{code:'EPIPE'})));
      safeLog('ordinary log');safeError('ordinary error');
      setTimeout(()=>{
        safeLog('later log');safeError('later error');
        writeFileSync(process.env.REPORT,JSON.stringify({errors,heartbeat:true}));
      },40);
    `;
    const report = path.join(dir, "result.json");
    const result = Bun.spawnSync(["node", "--input-type=module", "-e", script], {
      env: { ...process.env, REPORT: report }, timeout: 5000,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(report, "utf8"))).toEqual({ errors: 0, heartbeat: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
