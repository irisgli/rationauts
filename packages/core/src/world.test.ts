import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Direction } from './geometry.js';
import { parseMap } from './grid.js';
import {
  createWorld,
  emptyStore,
  isQuotaMet,
  step,
  totalStored,
  type Bot,
  type Intent,
  type WorldState,
} from './world.js';

/** A three-wide strip: plains, mud, plains — the cheapest possible cost fixture. */
function strip(): WorldState {
  const { grid } = parseMap('.,.');
  return createWorld({
    grid,
    bots: [{ id: 'bot-1', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 }],
  });
}

function bot(state: WorldState, id: string): Bot {
  const found = state.bots.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No bot ${id}`);
  return found;
}

/** Runs the simulation until `intents` runs dry, returning the final state. */
function run(initial: WorldState, intents: readonly (readonly Intent[])[]): WorldState {
  return intents.reduce<WorldState>((state, batch) => step(state, batch).state, initial);
}

describe('createWorld', () => {
  it('rejects a bot placed on impassable terrain', () => {
    const { grid } = parseMap('.#');
    expect(() =>
      createWorld({
        grid,
        bots: [{ id: 'b', position: { x: 1, y: 0 }, carrying: null, cooldown: 0 }],
      }),
    ).toThrow(RangeError);
  });

  it('rejects two bots sharing a starting tile', () => {
    const { grid } = parseMap('..');
    expect(() =>
      createWorld({
        grid,
        bots: [
          { id: 'a', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 },
          { id: 'b', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 },
        ],
      }),
    ).toThrow(RangeError);
  });

  it('rejects an unreachable depot', () => {
    const { grid } = parseMap('.~');
    expect(() =>
      createWorld({
        grid,
        bots: [{ id: 'b', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 }],
        depots: [{ id: 'd', position: { x: 1, y: 0 }, stored: emptyStore() }],
      }),
    ).toThrow(RangeError);
  });
});

describe('step: movement', () => {
  it('moves a bot and reports the terrain cost', () => {
    const { state, events } = step(strip(), [
      { kind: 'move', bot: 'bot-1', direction: Direction.East },
    ]);
    expect(bot(state, 'bot-1').position).toEqual({ x: 1, y: 0 });
    expect(events).toEqual([
      { type: 'moved', bot: 'bot-1', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, cost: 8 },
    ]);
  });

  it('locks a bot on cooldown for the terrain cost of the tile it entered', () => {
    // Mud costs 8, so the bot is immobile for the 7 ticks after the move resolves.
    let state = step(strip(), [{ kind: 'move', bot: 'bot-1', direction: Direction.East }]).state;
    expect(bot(state, 'bot-1').cooldown).toBe(7);

    for (let i = 0; i < 7; i++) {
      const result = step(state, [{ kind: 'move', bot: 'bot-1', direction: Direction.East }]);
      expect(result.events).toEqual([
        { type: 'action-failed', bot: 'bot-1', reason: 'on-cooldown' },
      ]);
      state = result.state;
    }

    expect(bot(state, 'bot-1').cooldown).toBe(0);
    const freed = step(state, [{ kind: 'move', bot: 'bot-1', direction: Direction.East }]);
    expect(bot(freed.state, 'bot-1').position).toEqual({ x: 2, y: 0 });
  });

  it('refuses to walk into impassable terrain', () => {
    const { grid } = parseMap('.#');
    const world = createWorld({
      grid,
      bots: [{ id: 'b', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 }],
    });
    const { state, events } = step(world, [{ kind: 'move', bot: 'b', direction: Direction.East }]);
    expect(events).toEqual([{ type: 'action-failed', bot: 'b', reason: 'impassable' }]);
    expect(bot(state, 'b').position).toEqual({ x: 0, y: 0 });
  });

  it('distinguishes leaving the grid from hitting a wall', () => {
    const { events } = step(strip(), [{ kind: 'move', bot: 'bot-1', direction: Direction.North }]);
    expect(events).toEqual([{ type: 'action-failed', bot: 'bot-1', reason: 'out-of-bounds' }]);
  });

  it('refuses to move onto an occupied tile', () => {
    const { grid } = parseMap('..');
    const world = createWorld({
      grid,
      bots: [
        { id: 'a', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 },
        { id: 'b', position: { x: 1, y: 0 }, carrying: null, cooldown: 0 },
      ],
    });
    const { events } = step(world, [{ kind: 'move', bot: 'a', direction: Direction.East }]);
    expect(events).toEqual([{ type: 'action-failed', bot: 'a', reason: 'occupied' }]);
  });

  it('lets a bot follow another into the tile it vacates in the same tick', () => {
    // Intents resolve in bot-id order, so 'a' moves before 'b' is considered.
    const { grid } = parseMap('...');
    const world = createWorld({
      grid,
      bots: [
        { id: 'a', position: { x: 1, y: 0 }, carrying: null, cooldown: 0 },
        { id: 'b', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 },
      ],
    });
    const { state } = step(world, [
      { kind: 'move', bot: 'b', direction: Direction.East },
      { kind: 'move', bot: 'a', direction: Direction.East },
    ]);
    expect(bot(state, 'a').position).toEqual({ x: 2, y: 0 });
    expect(bot(state, 'b').position).toEqual({ x: 1, y: 0 });
  });
});

describe('step: determinism', () => {
  it('ignores the order in which the caller supplies intents', () => {
    const { grid } = parseMap('...\n...\n...');
    const world = createWorld({
      grid,
      bots: [
        { id: 'a', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 },
        { id: 'b', position: { x: 2, y: 2 }, carrying: null, cooldown: 0 },
      ],
    });
    const intents: Intent[] = [
      { kind: 'move', bot: 'a', direction: Direction.East },
      { kind: 'move', bot: 'b', direction: Direction.West },
    ];
    const forward = step(world, intents);
    const reversed = step(world, [...intents].reverse());
    expect(reversed.state).toEqual(forward.state);
    expect(reversed.events).toEqual(forward.events);
  });

  it('honours at most one intent per bot per tick', () => {
    const { state } = step(strip(), [
      { kind: 'move', bot: 'bot-1', direction: Direction.East },
      { kind: 'move', bot: 'bot-1', direction: Direction.East },
    ]);
    expect(bot(state, 'bot-1').position).toEqual({ x: 1, y: 0 });
  });

  it('never mutates the state it is given', () => {
    const world = strip();
    const snapshot = structuredClone(world);
    step(world, [{ kind: 'move', bot: 'bot-1', direction: Direction.East }]);
    expect(world).toEqual(snapshot);
  });

  it('produces identical results for identical inputs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<Direction>(
            Direction.North,
            Direction.East,
            Direction.South,
            Direction.West,
          ),
          { maxLength: 40 },
        ),
        (directions) => {
          const build = (): WorldState => {
            const { grid } = parseMap('....\n.,,.\n....\n....');
            return createWorld({
              grid,
              bots: [{ id: 'bot-1', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 }],
            });
          };
          const batches = directions.map((direction): Intent[] => [
            { kind: 'move', bot: 'bot-1', direction },
          ]);
          return JSON.stringify(run(build(), batches)) === JSON.stringify(run(build(), batches));
        },
      ),
    );
  });
});

describe('step: harvesting and depositing', () => {
  function harvestWorld(): WorldState {
    const { grid } = parseMap('..');
    return createWorld({
      grid,
      bots: [{ id: 'b', position: { x: 0, y: 0 }, carrying: null, cooldown: 0 }],
      nodes: [{ id: 'tree', position: { x: 0, y: 0 }, kind: 'wood', remaining: 1 }],
      depots: [{ id: 'depot', position: { x: 1, y: 0 }, stored: emptyStore() }],
      quota: { wood: 1 },
    });
  }

  it('picks up a resource and depletes the node', () => {
    const { state, events } = step(harvestWorld(), [{ kind: 'harvest', bot: 'b' }]);
    expect(events).toEqual([{ type: 'harvested', bot: 'b', node: 'tree', kind: 'wood' }]);
    expect(bot(state, 'b').carrying).toBe('wood');
    expect(state.nodes[0]?.remaining).toBe(0);
  });

  it('refuses to harvest a depleted node', () => {
    const afterFirst = step(harvestWorld(), [{ kind: 'harvest', bot: 'b' }]).state;
    const emptied = {
      ...afterFirst,
      bots: [{ ...bot(afterFirst, 'b'), carrying: null, cooldown: 0 }],
    };
    const { events } = step(emptied, [{ kind: 'harvest', bot: 'b' }]);
    expect(events).toEqual([{ type: 'action-failed', bot: 'b', reason: 'node-depleted' }]);
  });

  it('refuses to harvest with full hands', () => {
    const carrying = harvestWorld();
    const loaded = { ...carrying, bots: [{ ...bot(carrying, 'b'), carrying: 'wood' as const }] };
    const { events } = step(loaded, [{ kind: 'harvest', bot: 'b' }]);
    expect(events).toEqual([{ type: 'action-failed', bot: 'b', reason: 'hands-full' }]);
  });

  it('refuses to harvest away from a node', () => {
    const world = harvestWorld();
    const moved = { ...world, bots: [{ ...bot(world, 'b'), position: { x: 1, y: 0 } }] };
    const { events } = step(moved, [{ kind: 'harvest', bot: 'b' }]);
    expect(events).toEqual([{ type: 'action-failed', bot: 'b', reason: 'no-node-here' }]);
  });

  it('refuses to deposit empty-handed or away from a depot', () => {
    const world = harvestWorld();
    expect(step(world, [{ kind: 'deposit', bot: 'b' }]).events).toEqual([
      { type: 'action-failed', bot: 'b', reason: 'hands-empty' },
    ]);

    const loaded = { ...world, bots: [{ ...bot(world, 'b'), carrying: 'wood' as const }] };
    expect(step(loaded, [{ kind: 'deposit', bot: 'b' }]).events).toEqual([
      { type: 'action-failed', bot: 'b', reason: 'no-depot-here' },
    ]);
  });

  it('completes a harvest-carry-deposit cycle and reports the quota being met', () => {
    const batches: Intent[][] = [
      [{ kind: 'harvest', bot: 'b' }],
      [{ kind: 'wait', bot: 'b' }],
      [{ kind: 'wait', bot: 'b' }],
      [{ kind: 'move', bot: 'b', direction: Direction.East }],
      [{ kind: 'deposit', bot: 'b' }],
    ];
    let state = harvestWorld();
    let sawQuotaMet = false;
    for (const batch of batches) {
      const result = step(state, batch);
      state = result.state;
      sawQuotaMet ||= result.events.some((event) => event.type === 'quota-met');
    }
    expect(bot(state, 'b').carrying).toBeNull();
    expect(totalStored(state, 'wood')).toBe(1);
    expect(isQuotaMet(state)).toBe(true);
    expect(sawQuotaMet).toBe(true);
  });
});

describe('step: unknown bots', () => {
  it('reports an intent for a bot that does not exist', () => {
    const { events } = step(strip(), [{ kind: 'wait', bot: 'ghost' }]);
    expect(events).toEqual([{ type: 'action-failed', bot: 'ghost', reason: 'unknown-bot' }]);
  });
});

describe('isQuotaMet', () => {
  it('is vacuously true with no quota', () => {
    expect(isQuotaMet(strip())).toBe(true);
  });
});
