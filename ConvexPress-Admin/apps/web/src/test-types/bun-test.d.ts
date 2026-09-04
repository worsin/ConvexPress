declare module "bun:test" {
	export function describe(name: string, fn: () => void): void;
	export function test(name: string, fn: () => void | Promise<void>): void;

	interface Matchers<T> {
		toBe(expected: T): void;
		toEqual(expected: unknown): void;
		toStrictEqual(expected: unknown): void;
		toMatchObject(expected: object): void;
		toBeDefined(): void;
		toBeUndefined(): void;
		toBeNull(): void;
		toBeTruthy(): void;
		toBeFalsy(): void;
		toContain(expected: unknown): void;
		toHaveLength(expected: number): void;
		toBeGreaterThan(expected: number): void;
		toBeGreaterThanOrEqual(expected: number): void;
		toBeLessThan(expected: number): void;
		toBeLessThanOrEqual(expected: number): void;
		toThrow(expected?: string | RegExp | Error): void;
	}

	export function expect<T>(value: T): Matchers<T> & { not: Matchers<T> };
}
