import { positionKey, samePosition, translate, type Direction, type Position } from './geometry.js';
import { enterCost, isWalkable, type Grid } from './grid.js';
import { makeRng, type Rng } from './rng.js';

/** Opaque-ish identifiers. Kept as strings so states stay trivially serialisable. */
export type BotId = string;
export type ResourceNodeId = string;
export type DepotId = string;

export const ResourceKind = {
  Wood: 'wood',
  Ore: 'ore',
} as const;

export type ResourceKind = (typeof ResourceKind)[keyof typeof ResourceKind];

export const RESOURCE_KINDS: readonly ResourceKind[] = [ResourceKind.Wood, ResourceKind.Ore];

/** Ticks a bot spends harvesting before it can act again. */
export const HARVEST_TICKS = 2;

/** Ticks a bot spends depositing before it can act again. */
export const DEPOSIT_TICKS = 1;

export interface Bot {
  readonly id: BotId;
  readonly position: Position;
  /** The single resource this bot is carrying, if any. Bots carry at most one. */
  readonly carrying: ResourceKind | null;
  /**
   * Ticks remaining before this bot may act again.
   *
   * This is how terrain cost is *felt* rather than merely scored: stepping into mud
   * leaves a bot immobile for eight ticks. A breadth-first router that ignores
   * terrain does not just score worse, it visibly crawls.
   */
  readonly cooldown: number;
}

export interface ResourceNode {
  readonly id: ResourceNodeId;
  readonly position: Position;
  readonly kind: ResourceKind;
  readonly remaining: number;
}

export interface Depot {
  readonly id: DepotId;
  readonly position: Position;
  readonly stored: Readonly<Record<ResourceKind, number>>;
}

/**
 * The complete state of a simulation at one instant.
 *
 * Everything needed to compute the next state lives here, including the random
 * generator. There is no hidden state anywhere in the engine, which is what makes
 * `(initialState, intents[]) -> finalState` a total, reproducible function.
 */
export interface WorldState {
  readonly tick: number;
  readonly grid: Grid;
  readonly bots: readonly Bot[];
  readonly nodes: readonly ResourceNode[];
  readonly depots: readonly Depot[];
  /** Delivery targets. A scenario succeeds when every entry is satisfied. */
  readonly quota: Readonly<Partial<Record<ResourceKind, number>>>;
  /**
   * The seeded generator.
   *
   * Unused by the deterministic Search tier, and deliberately so: it is threaded
   * through the state from day one because the MDP and reinforcement-learning
   * tiers introduce slippage and noisy sensors, and retrofitting a random source
   * into a state type after replays exist is a breaking change.
   */
  readonly rng: Rng;
}

/** An action an agent wishes to take. Intents are requests, not guarantees. */
export type Intent =
  | { readonly kind: 'move'; readonly bot: BotId; readonly direction: Direction }
  | { readonly kind: 'harvest'; readonly bot: BotId }
  | { readonly kind: 'deposit'; readonly bot: BotId }
  | { readonly kind: 'wait'; readonly bot: BotId };

/** Why a requested action did not happen. Surfaced to the UI and to metrics. */
export type FailureReason =
  | 'out-of-bounds'
  | 'impassable'
  | 'occupied'
  | 'no-node-here'
  | 'node-depleted'
  | 'hands-full'
  | 'no-depot-here'
  | 'hands-empty'
  | 'on-cooldown'
  | 'unknown-bot';

/**
 * Something that happened during a tick.
 *
 * Events are the single source of truth for everything downstream: the renderer
 * animates them, the metrics collector counts them, and the replay format stores
 * them. Neither the UI nor the harness re-derives what happened by diffing states.
 */
export type SimEvent =
  | {
      readonly type: 'moved';
      readonly bot: BotId;
      readonly from: Position;
      readonly to: Position;
      readonly cost: number;
    }
  | { readonly type: 'action-failed'; readonly bot: BotId; readonly reason: FailureReason }
  | {
      readonly type: 'harvested';
      readonly bot: BotId;
      readonly node: ResourceNodeId;
      readonly kind: ResourceKind;
    }
  | {
      readonly type: 'deposited';
      readonly bot: BotId;
      readonly depot: DepotId;
      readonly kind: ResourceKind;
    }
  | { readonly type: 'quota-met'; readonly tick: number };

export interface StepResult {
  readonly state: WorldState;
  readonly events: readonly SimEvent[];
}

/** Options for {@link createWorld}. `rng` defaults to a generator seeded with 0. */
export interface CreateWorldOptions {
  readonly grid: Grid;
  readonly bots: readonly Bot[];
  readonly nodes?: readonly ResourceNode[];
  readonly depots?: readonly Depot[];
  readonly quota?: Readonly<Partial<Record<ResourceKind, number>>>;
  readonly seed?: number;
}

/**
 * Builds a validated initial state.
 *
 * @throws RangeError if any entity is placed off-grid, on impassable terrain, or
 *   on top of another bot. Catching this at construction keeps `step` free of
 *   defensive checks for states that could never legally exist.
 */
export function createWorld(options: CreateWorldOptions): WorldState {
  const { grid, bots, nodes = [], depots = [], quota = {}, seed = 0 } = options;

  const occupied = new Set<string>();
  for (const bot of bots) {
    if (!isWalkable(grid, bot.position)) {
      throw new RangeError(`Bot ${bot.id} placed on unwalkable tile ${positionKey(bot.position)}`);
    }
    const key = positionKey(bot.position);
    if (occupied.has(key)) {
      throw new RangeError(`Two bots share the starting tile ${key}`);
    }
    occupied.add(key);
  }
  for (const node of nodes) {
    if (!isWalkable(grid, node.position)) {
      throw new RangeError(
        `Resource node ${node.id} is unreachable at ${positionKey(node.position)}`,
      );
    }
  }
  for (const depot of depots) {
    if (!isWalkable(grid, depot.position)) {
      throw new RangeError(`Depot ${depot.id} is unreachable at ${positionKey(depot.position)}`);
    }
  }

  return { tick: 0, grid, bots, nodes, depots, quota, rng: makeRng(seed) };
}

/** Total quantity of `kind` delivered to depots across the colony. */
export function totalStored(state: WorldState, kind: ResourceKind): number {
  return state.depots.reduce((sum, depot) => sum + depot.stored[kind], 0);
}

/** True when every quota entry has been satisfied. */
export function isQuotaMet(state: WorldState): boolean {
  // Iterating the canonical kind list rather than the quota's own keys keeps this
  // free of unchecked casts: `Object.entries` erases the key type to `string`.
  return RESOURCE_KINDS.every((kind) => totalStored(state, kind) >= (state.quota[kind] ?? 0));
}

/** An empty depot inventory. */
export function emptyStore(): Record<ResourceKind, number> {
  return { wood: 0, ore: 0 };
}

/**
 * Advances the simulation by exactly one tick.
 *
 * This is the only way world state ever changes, and it is a pure function: the
 * input state is never mutated and no ambient randomness or clock is consulted.
 *
 * Intents are applied in ascending bot-id order rather than in the order the
 * caller supplied them. That detail matters more than it looks: without it, two
 * agents contending for the same tile would resolve differently depending on how
 * the caller happened to collect their intents, and replays would stop being
 * reproducible across callers.
 *
 * At most one intent per bot is honoured per tick; extras are ignored.
 */
export function step(state: WorldState, intents: readonly Intent[]): StepResult {
  const events: SimEvent[] = [];

  const ordered = [...intents].sort((a, b) => (a.bot < b.bot ? -1 : a.bot > b.bot ? 1 : 0));
  const claimed = new Set<BotId>();

  const bots = new Map(state.bots.map((bot) => [bot.id, bot]));
  const nodes = new Map(state.nodes.map((node) => [node.id, node]));
  const depots = new Map(state.depots.map((depot) => [depot.id, depot]));
  const occupied = new Set(state.bots.map((bot) => positionKey(bot.position)));

  for (const intent of ordered) {
    if (claimed.has(intent.bot)) continue;
    claimed.add(intent.bot);

    const bot = bots.get(intent.bot);
    if (bot === undefined) {
      events.push({ type: 'action-failed', bot: intent.bot, reason: 'unknown-bot' });
      continue;
    }
    if (bot.cooldown > 0) {
      events.push({ type: 'action-failed', bot: bot.id, reason: 'on-cooldown' });
      continue;
    }

    switch (intent.kind) {
      case 'move': {
        const target = translate(bot.position, intent.direction);
        const cost = enterCost(state.grid, target);
        if (!Number.isFinite(cost)) {
          const reason: FailureReason = inBoundsOf(state.grid, target)
            ? 'impassable'
            : 'out-of-bounds';
          events.push({ type: 'action-failed', bot: bot.id, reason });
          break;
        }
        if (occupied.has(positionKey(target))) {
          events.push({ type: 'action-failed', bot: bot.id, reason: 'occupied' });
          break;
        }
        occupied.delete(positionKey(bot.position));
        occupied.add(positionKey(target));
        bots.set(bot.id, { ...bot, position: target, cooldown: cost });
        events.push({ type: 'moved', bot: bot.id, from: bot.position, to: target, cost });
        break;
      }

      case 'harvest': {
        if (bot.carrying !== null) {
          events.push({ type: 'action-failed', bot: bot.id, reason: 'hands-full' });
          break;
        }
        const node = findAt(state.nodes, bot.position);
        if (node === undefined) {
          events.push({ type: 'action-failed', bot: bot.id, reason: 'no-node-here' });
          break;
        }
        const current = nodes.get(node.id) ?? node;
        if (current.remaining <= 0) {
          events.push({ type: 'action-failed', bot: bot.id, reason: 'node-depleted' });
          break;
        }
        nodes.set(current.id, { ...current, remaining: current.remaining - 1 });
        bots.set(bot.id, { ...bot, carrying: current.kind, cooldown: HARVEST_TICKS });
        events.push({ type: 'harvested', bot: bot.id, node: current.id, kind: current.kind });
        break;
      }

      case 'deposit': {
        const carrying = bot.carrying;
        if (carrying === null) {
          events.push({ type: 'action-failed', bot: bot.id, reason: 'hands-empty' });
          break;
        }
        const depot = findAt(state.depots, bot.position);
        if (depot === undefined) {
          events.push({ type: 'action-failed', bot: bot.id, reason: 'no-depot-here' });
          break;
        }
        const current = depots.get(depot.id) ?? depot;
        depots.set(current.id, {
          ...current,
          stored: { ...current.stored, [carrying]: current.stored[carrying] + 1 },
        });
        bots.set(bot.id, { ...bot, carrying: null, cooldown: DEPOSIT_TICKS });
        events.push({ type: 'deposited', bot: bot.id, depot: current.id, kind: carrying });
        break;
      }

      case 'wait':
        break;
    }
  }

  // Cooldowns tick down once per simulation tick, after actions resolve — including
  // for the bot that just acted. An action costing C therefore occupies exactly C
  // ticks: the tick it was issued on, plus `C - 1` ticks of enforced idleness.
  const nextBots = state.bots.map((original) => {
    const updated = bots.get(original.id) ?? original;
    return updated.cooldown > 0 ? { ...updated, cooldown: updated.cooldown - 1 } : updated;
  });

  const nextState: WorldState = {
    ...state,
    tick: state.tick + 1,
    bots: nextBots,
    nodes: state.nodes.map((node) => nodes.get(node.id) ?? node),
    depots: state.depots.map((depot) => depots.get(depot.id) ?? depot),
  };

  if (!isQuotaMet(state) && isQuotaMet(nextState)) {
    events.push({ type: 'quota-met', tick: nextState.tick });
  }

  return { state: nextState, events };
}

function inBoundsOf(grid: Grid, position: Position): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < grid.width && position.y < grid.height;
}

function findAt<T extends { readonly position: Position }>(
  items: readonly T[],
  position: Position,
): T | undefined {
  return items.find((item) => samePosition(item.position, position));
}
