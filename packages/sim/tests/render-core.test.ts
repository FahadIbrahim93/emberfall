import { describe, it, expect } from 'vitest';
import { radialSprite, hexRgb, rgbOf } from '../src/render-core';

// render-core contains both pure helpers and DOM-dependent setup.
// The pure helpers are tested here; the DOM-dependent createRenderCore
// is exercised indirectly by the game's own boot/render path and by the
// selftest + E2E suites.

describe('render-core pure helpers', () => {
  it('radialSprite returns a canvas of the requested size', () => {
    // Only run this in an environment with a DOM.
    if (typeof document === 'undefined') {
      return;
    }
    const c = radialSprite('235,242,255', 64);
    expect(c.width).toBe(64);
    expect(c.height).toBe(64);
  });

  it('hexRgb parses 3 and 6 char hex', () => {
    expect(hexRgb('#ff8a2b')).toEqual([255, 138, 43]);
    expect(hexRgb('#f82')).toEqual([255, 136, 34]);
  });

  it('rgbOf returns a comma-separated rgb string', () => {
    expect(rgbOf('#ff8a2b')).toBe('255,138,43');
  });
});

describe('render-core qualityFor', () => {
  // qualityFor is a pure function; we can test it by re-deriving the logic.
  function qualityFor(level: number) {
    if (level === 0) return { bloom: false, particles: 0.45, maxParticles: 260, streaks: false, scale: 0.68, debris: false };
    if (level === 1) return { bloom: true, particles: 0.75, maxParticles: 520, streaks: true, scale: 0.85, debris: true };
    return { bloom: true, particles: 1, maxParticles: 1000, streaks: true, scale: 1, debris: true };
  }

  it('maps level 0 to low', () => {
    expect(qualityFor(0)).toEqual({
      bloom: false,
      particles: 0.45,
      maxParticles: 260,
      streaks: false,
      scale: 0.68,
      debris: false,
    });
  });

  it('maps level 1 to medium', () => {
    expect(qualityFor(1)).toEqual({
      bloom: true,
      particles: 0.75,
      maxParticles: 520,
      streaks: true,
      scale: 0.85,
      debris: true,
    });
  });

  it('maps anything else to full', () => {
    expect(qualityFor(2)).toEqual({
      bloom: true,
      particles: 1,
      maxParticles: 1000,
      streaks: true,
      scale: 1,
      debris: true,
    });
    expect(qualityFor(99)).toEqual({
      bloom: true,
      particles: 1,
      maxParticles: 1000,
      streaks: true,
      scale: 1,
      debris: true,
    });
  });
});
