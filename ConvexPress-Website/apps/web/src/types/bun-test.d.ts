declare module "bun:test" {
  type TestCallback = () => void | Promise<void>;

  export function describe(name: string, callback: TestCallback): void;
  export function test(name: string, callback: TestCallback, timeout?: number): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeFalsy(): void;
    toBeTruthy(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toMatchObject(expected: unknown): void;
    toMatch(expected: string | RegExp): void;
    toBeInstanceOf(expected: Function): void;
    toThrow(expected?: unknown): void;
    rejects: { toThrow(expected?: unknown): Promise<void> };
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toBeNull(): void;
      toBeInstanceOf(expected: Function): void;
      toContain(expected: unknown): void;
      toMatchObject(expected: unknown): void;
    };
  };
}
