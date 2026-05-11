import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const { app } = require("electron") as typeof import("electron");

interface JsonStoreOptions<T extends Record<string, unknown>> {
  name: string;
  defaults?: T;
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class JsonStore<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly name: string;
  private readonly defaults: T;

  constructor(options: JsonStoreOptions<T>) {
    this.name = options.name;
    this.defaults = options.defaults ?? ({} as T);
  }

  private getFilePath(): string {
    return path.join(app.getPath("userData"), `${this.name}.json`);
  }

  private readState(): Record<string, unknown> {
    const filePath = this.getFilePath();
    if (!existsSync(filePath)) {
      return { ...this.defaults };
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return { ...this.defaults, ...parsed };
    } catch {
      return { ...this.defaults };
    }
  }

  private writeState(state: Record<string, unknown>): void {
    const filePath = this.getFilePath();
    ensureParentDir(filePath);
    writeFileSync(filePath, JSON.stringify(state, null, 2));
  }

  get(key: string): unknown;
  get<V>(key: string, defaultValue: V): V;
  get<V>(key: string, defaultValue?: V): V | unknown {
    const state = this.readState();
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      return state[key] as V;
    }
    return defaultValue;
  }

  set(key: string, value: unknown): void {
    const state = this.readState();
    state[key] = value;
    this.writeState(state);
  }

  delete(key: string): void {
    const state = this.readState();
    delete state[key];
    this.writeState(state);
  }
}
