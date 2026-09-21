/**
 * Solar Tour stage registry — mirrored from index.html's STAGES table.
 * Parity is enforced by tests/golden2.test.ts, which extracts the live
 * table and pins every field. The sky *renderer* stays in the payload;
 * the sim only needs the campaign structure: world order, wave spans,
 * hazard assignments, and the derived cumulative/finale constants.
 */

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

export const STAGES: readonly StageDef[] = [
  { id: 'mercury', name: 'Mercury', tagline: 'Sun-scoured clutter belt', tint: 0.5, crater: 1.9, ring: 0, storm: 0.12, lights: 0, hue: 38, sat: 1.12, bri: 1.06, waves: 4, haz: 'flare', hazK: 1 },
  { id: 'venus', name: 'Venus', tagline: 'Crushing shroud, amber static', tint: 0.34, crater: 0.25, ring: 0.35, storm: 0.75, lights: 0.2, hue: 14, sat: 1.1, bri: 1.04, waves: 5, haz: 'cloudbank', hazK: 1 },
  { id: 'earth', name: 'Earth', tagline: 'Home lights behind you', tint: 0, crater: 0.3, ring: 0, storm: 0.4, lights: 1, hue: 0, sat: 1, bri: 1, waves: 5 },
  { id: 'mars', name: 'Mars', tagline: 'Rust storms, thin air', tint: 0.2, crater: 1.5, ring: 0, storm: 0.95, lights: 0.35, hue: 16, sat: 1.06, bri: 1.02, waves: 6, haz: 'storm', hazK: 1 },
  { id: 'jupiter', name: 'Jupiter', tagline: 'The magnetosphere answers back', tint: 0.3, crater: 0.2, ring: 0.6, storm: 1, lights: 0, hue: 26, sat: 1.12, bri: 1.02, waves: 6, haz: 'gravity', hazK: 1 },
  { id: 'saturn', name: 'Saturn', tagline: 'Carriers breed in the rings', tint: 0.3, crater: 0.2, ring: 1.4, storm: 0.55, lights: 0, hue: 40, sat: 1.04, bri: 1, waves: 7, haz: 'haze', hazK: 0.45 },
  { id: 'neptune', name: 'Neptune', tagline: 'Cold velocity, dim instruments', tint: 0.55, crater: 0.3, ring: 0.3, storm: 0.3, lights: 0.15, hue: -22, sat: 1.05, bri: 0.98, waves: 7, haz: 'frost', hazK: 1 },
  { id: 'gate', name: 'Kuiper Gate', tagline: 'The thing the tide came through', tint: 0.7, crater: 0.8, ring: 0.2, storm: 0.8, lights: 0, hue: -14, sat: 1.05, bri: 0.96, waves: 8, haz: 'gravity', hazK: 1.5 },
];

/** cumulative wave count before each world (index.html derives it identically) */
export const TOUR_CUM: readonly number[] = STAGES.reduce<number[]>((a, s) => (a.push((a[a.length - 1] || 0) + s.waves), a), []);

/** the campaign's final wave — the Kuiper Gate capital */
export const TOUR_FINALE = TOUR_CUM[TOUR_CUM.length - 1];

/** worlds fully cleared when wave n starts (0 while inside world 1) */
export function tourWorldsDone(n: number): number {
  return TOUR_CUM.filter(c => c < n).length;
}
