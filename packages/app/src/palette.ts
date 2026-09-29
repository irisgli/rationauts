import { Terrain } from '@rationauts/core';

/**
 * The single source of colour for the client.
 *
 * Canvas cannot read CSS custom properties without a `getComputedStyle` round trip
 * per frame, and duplicating hex values between a stylesheet and a draw call is how
 * a palette quietly drifts apart. So the values live here, and `main.tsx` writes
 * them onto the document root as custom properties for the DOM to use.
 *
 * The direction is a survey plate: drafting film over a light table at night. Ink
 * and graphite carry the sheet, brass marks the route a planner chose, and teal is
 * reserved exclusively for what the planner examined. Nothing else is allowed to be
 * teal — the overlay is the one thing this interface exists to show.
 */
export const PALETTE = {
  ink: '#0E1417',
  plate: '#141D21',
  rule: '#27353B',
  ruleSoft: '#1A2428',
  graphite: '#8CA0A7',
  graphiteDim: '#5D6E75',
  paper: '#E7EDE9',
  brass: '#D8A657',
  brassDim: '#8A6B37',
  teal: '#57A89B',
  rust: '#C4614B',
} as const;

/** Terrain fills, kept deliberately low-contrast so the overlay reads on top. */
export const TERRAIN_FILL: Readonly<Record<Terrain, string>> = {
  [Terrain.Plains]: '#1B262A',
  [Terrain.Forest]: '#213328',
  [Terrain.Mud]: '#33301D',
  [Terrain.Rock]: '#090F11',
  [Terrain.Water]: '#122730',
};

/** Human labels for the legend, with the cost that makes each one matter. */
export const TERRAIN_LABEL: Readonly<Record<Terrain, string>> = {
  [Terrain.Plains]: 'Plains',
  [Terrain.Forest]: 'Forest',
  [Terrain.Mud]: 'Mud',
  [Terrain.Rock]: 'Rock',
  [Terrain.Water]: 'Water',
};
