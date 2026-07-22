declare module 'bun:test' {
  export const mock: {
    module(name: string, factory: () => unknown): void;
  };
  export function describe(name: string, body: () => void): void;
  export function test(name: string, body: () => void | Promise<void>): void;
  export function expect(value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    not: { toContain(expected: unknown): void };
  };
}
