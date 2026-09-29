import { positionKey, type Position, type WorldState } from '@rationauts/core';
import type { PlanTelemetry } from '@rationauts/sim';
import { useEffect, useRef } from 'react';
import { PALETTE, TERRAIN_FILL } from './palette.js';

/**
 * The map, drawn as a survey plate.
 *
 * The signature of this interface is the expansion overlay. A planner's examined
 * tiles are shaded in teal, banded by expansion order, so the shape of the search is
 * visible rather than merely counted: uniform-cost search spreads outward in
 * equal-cost contours, while A* leans into an ellipse aimed at the goal. Both return
 * the same route at the same cost, and the only difference between them is the shape
 * of that stain. Showing it is the reason this client exists.
 */

interface SurveyPlateProps {
  readonly state: WorldState;
  readonly plan: PlanTelemetry | null;
  /** Position keys already visited, so surveyed groves can be struck off. */
  readonly visited: ReadonlySet<string>;
  /** Suppresses the contour fade for viewers who asked for less motion. */
  readonly animate: boolean;
}

/** Quantising the overlay into bands is what turns a gradient into contours. */
const CONTOUR_BANDS = 7;

const GRID_LABEL_EVERY = 5;

const MIN_TILE = 6;
const MAX_TILE = 44;

export function SurveyPlate({
  state,
  plan,
  visited,
  animate,
}: SurveyPlateProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas === null || container === null) return undefined;

    const draw = (): void => {
      const context = canvas.getContext('2d');
      if (context === null) return;

      const { grid } = state;
      const bounds = container.getBoundingClientRect();
      // Square tiles, sized to whichever axis runs out first, and capped so a small
      // grid renders as a readable plate rather than a handful of enormous blocks.
      const tile = Math.min(
        MAX_TILE,
        Math.max(
          MIN_TILE,
          Math.floor(Math.min(bounds.width / grid.width, bounds.height / grid.height)),
        ),
      );
      const width = tile * grid.width;
      const height = tile * grid.height;
      const ratio = window.devicePixelRatio || 1;

      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${String(width)}px`;
      canvas.style.height = `${String(height)}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      context.fillStyle = PALETTE.ink;
      context.fillRect(0, 0, width, height);

      drawTerrain(context, state, tile);
      drawExploration(context, plan, tile, animate);
      drawGraticule(context, state, tile);
      drawRoute(context, plan, tile);
      drawEntities(context, state, tile, visited);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [state, plan, visited, animate]);

  return (
    <div className="plate" ref={containerRef}>
      <canvas ref={canvasRef} role="img" aria-label={describe(state, plan)} />
    </div>
  );
}

/** A text equivalent of the plate, so the canvas is not a hole for screen readers. */
function describe(state: WorldState, plan: PlanTelemetry | null): string {
  const bot = state.bots[0];
  const carrying = bot?.carrying ?? null;
  const where =
    bot === undefined ? 'nowhere' : `${String(bot.position.x)}, ${String(bot.position.y)}`;
  const examined = plan === null ? 0 : plan.explored.length;
  return [
    `Survey plate, ${String(state.grid.width)} by ${String(state.grid.height)} tiles.`,
    `Bot at ${where}${carrying === null ? '' : `, carrying ${carrying}`}.`,
    plan === null ? '' : `Last plan examined ${String(examined)} tiles.`,
  ]
    .filter(Boolean)
    .join(' ');
}

function drawTerrain(context: CanvasRenderingContext2D, state: WorldState, tile: number): void {
  const { grid } = state;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const terrain = grid.tiles[y * grid.width + x];
      if (terrain === undefined) continue;
      context.fillStyle = TERRAIN_FILL[terrain];
      context.fillRect(x * tile, y * tile, tile, tile);
    }
  }
}

/**
 * Shades the tiles a planner examined, banded by expansion order.
 *
 * Earlier expansions are darker, so the bands read as contours radiating from where
 * the search began. The quantisation is the whole trick: a smooth alpha ramp would
 * be a fog, and a fog does not show that uniform-cost search moves in rings.
 */
function drawExploration(
  context: CanvasRenderingContext2D,
  plan: PlanTelemetry | null,
  tile: number,
  animate: boolean,
): void {
  if (plan === null || plan.explored.length === 0) return;

  const total = plan.explored.length;
  // Only the first visit to a tile matters; later ones are re-openings.
  const firstSeen = new Map<string, number>();
  plan.explored.forEach((position, order) => {
    const key = positionKey(position);
    if (!firstSeen.has(key)) firstSeen.set(key, order);
  });

  context.save();
  for (const [key, order] of firstSeen) {
    const [rawX = '0', rawY = '0'] = key.split(',');
    const band = Math.floor((order / total) * CONTOUR_BANDS);
    context.globalAlpha = 0.34 - band * 0.035;
    context.fillStyle = PALETTE.teal;
    context.fillRect(Number(rawX) * tile, Number(rawY) * tile, tile, tile);
  }

  // A brighter edge on the outermost band reads as the frontier the search stopped at.
  context.globalAlpha = animate ? 0.5 : 0.35;
  context.fillStyle = PALETTE.teal;
  for (const [key, order] of firstSeen) {
    if (order < total - Math.max(1, Math.floor(total / CONTOUR_BANDS))) continue;
    const [rawX = '0', rawY = '0'] = key.split(',');
    context.fillRect(Number(rawX) * tile + tile / 2 - 1, Number(rawY) * tile + tile / 2 - 1, 2, 2);
  }
  context.restore();
}

/** Hairline grid and edge ticks, which is what makes it read as a plate. */
function drawGraticule(context: CanvasRenderingContext2D, state: WorldState, tile: number): void {
  const { grid } = state;
  context.save();
  context.strokeStyle = PALETTE.ruleSoft;
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= grid.width; x++) {
    context.moveTo(x * tile + 0.5, 0);
    context.lineTo(x * tile + 0.5, grid.height * tile);
  }
  for (let y = 0; y <= grid.height; y++) {
    context.moveTo(0, y * tile + 0.5);
    context.lineTo(grid.width * tile, y * tile + 0.5);
  }
  context.stroke();

  if (tile >= 14) {
    context.fillStyle = PALETTE.graphiteDim;
    context.font = '500 9px "IBM Plex Mono", monospace';
    context.textBaseline = 'top';
    for (let x = 0; x < grid.width; x += GRID_LABEL_EVERY) {
      context.fillText(String(x), x * tile + 3, 3);
    }
    for (let y = GRID_LABEL_EVERY; y < grid.height; y += GRID_LABEL_EVERY) {
      context.fillText(String(y), 3, y * tile + 3);
    }
  }
  context.restore();
}

function drawRoute(
  context: CanvasRenderingContext2D,
  plan: PlanTelemetry | null,
  tile: number,
): void {
  if (plan === null || plan.route.length < 2) return;
  const centre = (position: Position): [number, number] => [
    position.x * tile + tile / 2,
    position.y * tile + tile / 2,
  ];

  context.save();
  context.strokeStyle = PALETTE.brass;
  context.lineWidth = Math.max(1.5, tile * 0.12);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.globalAlpha = 0.9;
  context.beginPath();
  const [startX, startY] = centre(plan.route[0] ?? { x: 0, y: 0 });
  context.moveTo(startX, startY);
  for (const position of plan.route.slice(1)) {
    const [x, y] = centre(position);
    context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function drawEntities(
  context: CanvasRenderingContext2D,
  state: WorldState,
  tile: number,
  visited: ReadonlySet<string>,
): void {
  const centre = (position: Position): [number, number] => [
    position.x * tile + tile / 2,
    position.y * tile + tile / 2,
  ];

  // Groves: a survey station ring, struck through once recorded.
  for (const node of state.nodes) {
    const [x, y] = centre(node.position);
    const recorded = node.remaining === 0 || visited.has(positionKey(node.position));
    const colour = recorded ? PALETTE.graphiteDim : '#7FB08A';
    const radius = tile * 0.28;
    context.save();
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = Math.max(1, tile * 0.08);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    if (recorded) {
      // A surveyor's tick: the station has been recorded and needs no revisit.
      context.beginPath();
      context.moveTo(x - radius * 0.7, y - radius * 0.7);
      context.lineTo(x + radius * 0.7, y + radius * 0.7);
      context.moveTo(x + radius * 0.7, y - radius * 0.7);
      context.lineTo(x - radius * 0.7, y + radius * 0.7);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(x, y, tile * 0.08, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  // Depot: a benchmark square.
  for (const depot of state.depots) {
    const [x, y] = centre(depot.position);
    const half = tile * 0.3;
    context.save();
    context.strokeStyle = PALETTE.paper;
    context.lineWidth = Math.max(1, tile * 0.08);
    context.strokeRect(x - half, y - half, half * 2, half * 2);
    context.beginPath();
    context.moveTo(x - half, y);
    context.lineTo(x + half, y);
    context.moveTo(x, y - half);
    context.lineTo(x, y + half);
    context.stroke();
    context.restore();
  }

  // Bot: brass, the only filled disc on the plate.
  for (const bot of state.bots) {
    const [x, y] = centre(bot.position);
    context.save();
    context.fillStyle = PALETTE.brass;
    context.beginPath();
    context.arc(x, y, tile * 0.3, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.ink;
    context.lineWidth = Math.max(1, tile * 0.07);
    context.stroke();
    if (bot.carrying !== null) {
      context.fillStyle = PALETTE.ink;
      context.beginPath();
      context.arc(x, y, tile * 0.11, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
}
