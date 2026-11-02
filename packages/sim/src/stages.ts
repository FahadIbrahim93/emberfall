/**
 * Thin adapter (ADR 0003): the Solar Tour stage registry lives in
 * ../../../js/catalog.js — the exact file the client loads as a classic
 * script (the eight STAGES rows plus the derived TOUR_CUM / TOUR_FINALE
 * constants and tourWorldsDone). This module owns NO tables and NO
 * campaign numbers; the sky *renderer* stays in the payload, the sim only
 * needs the campaign structure, and it now reads it from the live path.
 */
import '../../../js/catalog.js';

export type StageDef = {
  id: string;
  name: string;
  tagline: string;
  tint: number;
  crater: number;
  ring: number;
  storm: number;
  lights: number;
  hue: number;
  sat: number;
  bri: number;
  waves: number;
  haz?: string;
  hazK?: number;
};

interface CatalogModule {
  STAGES: StageDef[];
  TOUR_CUM: readonly number[];
  TOUR_FINALE: number;
  tourWorldsDone(n: number): number;
}

const C = (globalThis as unknown as { CATALOG?: CatalogModule }).CATALOG;
if (!C) throw new Error('single-path wiring broken: js/catalog.js did not register CATALOG');

/** the live registry — the client's own object reference */
export const STAGES: readonly StageDef[] = C.STAGES;

/** cumulative wave count before each world (derived identically by the runtime) */
export const TOUR_CUM: readonly number[] = C.TOUR_CUM;

/** the campaign's final wave — the Kuiper Gate capital */
export const TOUR_FINALE: number = C.TOUR_FINALE;

/** worlds fully cleared when wave n starts (0 while inside world 1) */
export function tourWorldsDone(n: number): number {
  return C.tourWorldsDone(n);
}
