// electron/app-updater.ts
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import {
  readManifest,
  writeManifest,
  type ConvexpressVersionManifest,
} from "./version.js";

const { net } = require("electron") as typeof import("electron");

const execFileAsync = promisify(execFile);

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentSha: string;
  remoteSha: string;
  repo: string;
  branch: string;
}

export interface UpdateProgress {
  phase:
    | "checking"
    | "pulling"
    | "installing-deps"
    | "regenerating-extensions"
    | "building"
    | "finalizing"
    | "rolling-back"
    | "complete"
    | "error"
    | "up-to-date";
  message: string;
  percent: number;
}

export class AppUpdater extends EventEmitter {
  private installPath: string;
  private checkIntervalMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isChecking = false;
  private isUpdating = false;

  constructor(installPath: string, checkIntervalMs = 4 * 60 * 60 * 1000) {
    super();
    this.installPath = installPath;
    this.checkIntervalMs = checkIntervalMs;
  }

  startPeriodicCheck(): void {
    this.stopPeriodicCheck();
    // First check after 10 seconds to let app settle
    setTimeout(() => this.checkForUpdate(), 10_000);
    this.intervalHandle = setInterval(
      () => this.checkForUpdate(),
      this.checkIntervalMs
    );
  }

  stopPeriodicCheck(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async checkForUpdate(): Promise<UpdateCheckResult | null> {
    if (this.isChecking) return null;
    this.isChecking = true;
    try {
      const manifest = readManifest(this.installPath);
      if (!manifest) {
        this.emit(
          "update-check-error",
          new Error("Version manifest not found. App may need reinstalling.")
        );
        return null;
      }

      const remoteSha = await this.getRemoteHeadSha(
        manifest.repo,
        manifest.branch
      );

      const result: UpdateCheckResult = {
        updateAvailable: remoteSha !== manifest.commitSha,
        currentSha: manifest.commitSha,
        remoteSha,
        repo: manifest.repo,
        branch: manifest.branch,
      };

      if (result.updateAvailable) {
        this.emit("update-available", result);
      }

      return result;
    } catch (err) {
      this.emit("update-check-error", err);
      return null;
    } finally {
      this.isChecking = false;
    }
  }

  async performUpdate(): Promise<void> {
    if (this.isUpdating) {
      this.emit(
        "update-check-error",
        new Error("An update is already in progress.")
      );
      return;
    }
    this.isUpdating = true;

    try {
      const manifest = readManifest(this.installPath);
      if (!manifest) throw new Error("No version manifest found");

      const previousSha = await this.getCurrentSha();

      this.emit("update-progress", {
        phase: "pulling",
        message: "Pulling latest changes...",
        percent: 10,
      } satisfies UpdateProgress);

      const pm = await this.detectPackageManager();

      try {
        await this.gitPull();

        this.emit("update-progress", {
          phase: "installing-deps",
          message: "Updating dependencies...",
          percent: 40,
        } satisfies UpdateProgress);

        await execFileAsync(pm, ["install"], {
          cwd: this.installPath,
          shell: true,
        });

        // ── Extension v2: regenerate the Convex schema index ─────────────
        // The backend codegen aggregates schemas from both extension roots
        // (extensions/* and extensions.local/*) into a single index file
        // that schema.ts imports. The codegen runs as a `predev`/`predeploy`
        // hook in normal flows, but the updater is neither — call it
        // explicitly here so the post-update build sees the right schema.
        this.emit("update-progress", {
          phase: "regenerating-extensions",
          message: "Regenerating extension index...",
          percent: 50,
        } satisfies UpdateProgress);

        try {
          await execFileAsync(
            pm,
            ["run", "--filter", "@convexpress-admin/backend", "codegen:extensions"],
            { cwd: this.installPath, shell: true },
          );
        } catch (extErr) {
          // Don't fail the whole update on a codegen miss — surface a
          // warning event and continue. A missing/empty index file falls
          // through to `export const extensionTables = {}` which is valid.
          // The rebuild will succeed; the user's extensions just won't be
          // active until they re-run codegen.
          this.emit("update-progress", {
            phase: "regenerating-extensions",
            message: `Extension regen warning: ${extErr instanceof Error ? extErr.message : String(extErr)}`,
            percent: 55,
          } satisfies UpdateProgress);
        }

        this.emit("update-progress", {
          phase: "building",
          message: "Rebuilding application...",
          percent: 60,
        } satisfies UpdateProgress);

        await execFileAsync(pm, ["run", "build"], {
          cwd: this.installPath,
          shell: true,
        });
      } catch (err) {
        await this.rollback(previousSha, pm);
        throw new Error(
          `Update failed and was rolled back: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      this.emit("update-progress", {
        phase: "finalizing",
        message: "Finalizing update...",
        percent: 90,
      } satisfies UpdateProgress);

      let newSha = "unknown";
      try {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd: this.installPath,
          shell: true,
        });
        newSha = stdout.trim();
      } catch {
        // ignore
      }

      const updatedManifest: ConvexpressVersionManifest = {
        ...manifest,
        commitSha: newSha,
        builtAt: new Date().toISOString(),
      };
      writeManifest(this.installPath, updatedManifest);

      this.emit("update-progress", {
        phase: "complete",
        message: "Update complete! Restart to apply.",
        percent: 100,
      } satisfies UpdateProgress);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("update-progress", {
        phase: "error",
        message,
        percent: -1,
      } satisfies UpdateProgress);
      throw err;
    } finally {
      this.isUpdating = false;
    }
  }

  private async getCurrentSha(): Promise<string> {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: this.installPath,
      shell: true,
    });
    return stdout.trim();
  }

  private async rollback(previousSha: string, pm?: string): Promise<void> {
    this.emit("update-progress", {
      phase: "rolling-back",
      message: "Update failed. Rolling back to previous version...",
      percent: 0,
    } satisfies UpdateProgress);
    try {
      await execFileAsync("git", ["reset", "--hard", previousSha], {
        cwd: this.installPath,
        shell: true,
      });
      const packageManager = pm ?? (await this.detectPackageManager());
      await execFileAsync(packageManager, ["install"], {
        cwd: this.installPath,
        shell: true,
      });
    } catch {
      // Rollback best-effort; original error will still propagate
    }
  }

  private async gitPull(): Promise<void> {
    const manifest = readManifest(this.installPath);
    const branch = manifest?.branch ?? "main";

    await execFileAsync("git", ["fetch", "--depth", "1", "origin", branch], {
      cwd: this.installPath,
      shell: true,
    });
    await execFileAsync("git", ["reset", "--hard", `origin/${branch}`], {
      cwd: this.installPath,
      shell: true,
    });

    // Validate that reset succeeded — HEAD should match remote
    const { stdout: currentSha } = await execFileAsync(
      "git",
      ["rev-parse", "HEAD"],
      {
        cwd: this.installPath,
        shell: true,
      }
    );
    const { stdout: remoteSha } = await execFileAsync(
      "git",
      ["rev-parse", `origin/${branch}`],
      {
        cwd: this.installPath,
        shell: true,
      }
    );
    if (currentSha.trim() !== remoteSha.trim()) {
      throw new Error(
        "Git reset validation failed — HEAD does not match remote. Update aborted."
      );
    }
  }

  private async getRemoteHeadSha(
    repo: string,
    branch: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
      const request = net.request({
        url,
        method: "GET",
      });

      request.setHeader("Accept", "application/vnd.github.v3+json");
      request.setHeader("User-Agent", "ConvexPress-Updater");

      // 15-second timeout to prevent hanging on network issues
      const timeout = setTimeout(() => {
        request.abort();
        reject(new Error("GitHub API request timed out after 15 seconds"));
      }, 15_000);

      request.on("response", (response) => {
        clearTimeout(timeout);
        const statusCode = response.statusCode;

        // Handle HTTP errors before attempting to parse
        if (statusCode !== 200) {
          let errorBody = "";
          response.on("data", (chunk) => {
            errorBody += chunk.toString();
          });
          response.on("end", () => {
            if (statusCode === 404)
              reject(new Error(`Repository ${repo} not found on GitHub`));
            else if (statusCode === 403)
              reject(
                new Error(
                  "GitHub API rate limit exceeded — try again later"
                )
              );
            else reject(new Error(`GitHub API error: HTTP ${statusCode}`));
          });
          return;
        }

        let body = "";
        response.on("data", (chunk) => {
          body += chunk.toString();
        });
        response.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.sha) {
              resolve(data.sha);
            } else {
              reject(new Error(`No SHA in GitHub response`));
            }
          } catch {
            reject(new Error(`Failed to parse GitHub response`));
          }
        });
      });

      request.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      request.end();
    });
  }

  private async detectPackageManager(): Promise<string> {
    if (
      existsSync(join(this.installPath, "bun.lock")) ||
      existsSync(join(this.installPath, ".bun-version"))
    ) {
      try {
        await execFileAsync("bun", ["--version"], { shell: true });
        return "bun";
      } catch {
        // fall through
      }
    }
    return "npm";
  }
}
