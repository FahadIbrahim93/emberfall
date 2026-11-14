/** Types for host/env.mjs — the headless loader for the shipped game. */

export declare const ROOT: string;

export declare function fixedRandom(seed?: number): () => number;

export declare function scriptSources(): { srcs: string[]; inlines: string[] };

export type ShippedCore = {
  context: unknown;
  /** evaluate an expression inside the shipped global scope */
  run(code: string, filename?: string): any;
};

export declare function loadShippedCore(opts?: { randomSeed?: number }): ShippedCore;
