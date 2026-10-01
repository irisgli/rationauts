import { isQuotaMet } from '@rationauts/core';
import { describe, expect, it } from 'vitest';
import { PLANNER_IDS } from './navigators.js';
import {
  encodeReplay,
  parseReplay,
  playReplay,
  REPLAY_LIMITS,
  REPLAY_VERSION,
  ReplayError,
  type Replay,
} from './replay.js';
import { runScenario } from './runner.js';
import { SCENARIOS, scenarioById } from './scenarios.js';

function recordRun(scenarioId: string, planner: (typeof PLANNER_IDS)[number]): Replay {
  const scenario = scenarioById(scenarioId);
  if (scenario === undefined) throw new Error(`no scenario ${scenarioId}`);
  const report = runScenario(scenario, planner);
  return { version: REPLAY_VERSION, scenario: scenario.id, planner, intents: report.intents };
}

/** A minimal replay that parses, used as the base for negative cases. */
function valid(): Record<string, unknown> {
  return {
    version: REPLAY_VERSION,
    scenario: 'open-field',
    planner: 'astar',
    intents: [[{ kind: 'wait', bot: 'bot-1' }]],
  };
}

describe('round trip', () => {
  it('reproduces the recorded run exactly, for every scenario and planner', () => {
    for (const scenario of SCENARIOS) {
      for (const planner of PLANNER_IDS) {
        const report = runScenario(scenario, planner);
        const replay = recordRun(scenario.id, planner);
        const state = playReplay(parseReplay(encodeReplay(replay)));
        expect(state, `${scenario.id} / ${planner}`).toEqual(report.finalState);
      }
    }
  });

  it('preserves whether the objective was met', () => {
    const replay = recordRun('mudflats', 'ucs');
    expect(isQuotaMet(playReplay(parseReplay(encodeReplay(replay))))).toBe(true);
  });

  it('is small, because states are recomputed rather than stored', () => {
    // A replay carries intents only. If this ever grows by orders of magnitude,
    // something has started serialising world state into the file.
    const bytes = encodeReplay(recordRun('great-plain', 'astar')).length;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});

describe('parseReplay rejects malformed input', () => {
  it('rejects values that are not objects', () => {
    for (const input of [null, undefined, 42, true, [], 'nonsense']) {
      expect(() => parseReplay(input), JSON.stringify(input)).toThrow(ReplayError);
    }
  });

  it('rejects invalid JSON', () => {
    expect(() => parseReplay('{ not json')).toThrow(/not valid JSON/);
  });

  it('refuses a version it does not understand', () => {
    expect(() => parseReplay({ ...valid(), version: REPLAY_VERSION + 1 })).toThrow(
      /unsupported replay version/,
    );
    expect(() => parseReplay({ ...valid(), version: '1' })).toThrow(/unsupported replay version/);
    const withoutVersion = valid();
    delete withoutVersion.version;
    expect(() => parseReplay(withoutVersion)).toThrow(/unsupported replay version/);
  });

  it('refuses a scenario it cannot build', () => {
    expect(() => parseReplay({ ...valid(), scenario: 'does-not-exist' })).toThrow(
      /unknown scenario/,
    );
    expect(() => parseReplay({ ...valid(), scenario: 123 })).toThrow(/scenario must be a string/);
  });

  it('refuses an unknown planner', () => {
    expect(() => parseReplay({ ...valid(), planner: 'telepathy' })).toThrow(/unknown planner/);
  });

  it('refuses malformed intents', () => {
    const cases: [unknown, RegExp][] = [
      [{ ...valid(), intents: 'nope' }, /intents must be an array/],
      [{ ...valid(), intents: [42] }, /expected an array of intents/],
      [{ ...valid(), intents: [[null]] }, /expected an object/],
      [{ ...valid(), intents: [[{ kind: 'teleport', bot: 'b' }]] }, /unknown intent kind/],
      [{ ...valid(), intents: [[{ kind: 'move', bot: 'b' }]] }, /expected one of/],
      [{ ...valid(), intents: [[{ kind: 'move', bot: 'b', direction: 'up' }]] }, /expected one of/],
      [{ ...valid(), intents: [[{ kind: 'wait' }]] }, /bot must be a non-empty string/],
      [{ ...valid(), intents: [[{ kind: 'wait', bot: '' }]] }, /bot must be a non-empty string/],
    ];
    for (const [input, pattern] of cases) {
      expect(() => parseReplay(input), JSON.stringify(input)).toThrow(pattern);
    }
  });

  it('names the tick and slot that failed', () => {
    expect(() =>
      parseReplay({
        ...valid(),
        intents: [[{ kind: 'wait', bot: 'b' }], [{ kind: 'wait', bot: 'b' }, { kind: 'bogus' }]],
      }),
    ).toThrow(/tick 1, intent 1/);
  });
});

describe('parseReplay bounds its input', () => {
  it('refuses more ticks than the limit', () => {
    const intents = Array.from({ length: REPLAY_LIMITS.maxTicks + 1 }, () => []);
    expect(() => parseReplay({ ...valid(), intents })).toThrow(/the limit is/);
  });

  it('refuses more intents in one tick than the limit', () => {
    const tick = Array.from({ length: REPLAY_LIMITS.maxIntentsPerTick + 1 }, () => ({
      kind: 'wait',
      bot: 'bot-1',
    }));
    expect(() => parseReplay({ ...valid(), intents: [tick] })).toThrow(/the limit is/);
  });
});

describe('parseReplay returns only data it rebuilt', () => {
  it('drops unknown top-level and intent properties', () => {
    const parsed = parseReplay({
      ...valid(),
      smuggled: 'ignore me',
      intents: [[{ kind: 'wait', bot: 'bot-1', smuggled: 'ignore me' }]],
    });
    expect(Object.keys(parsed).sort()).toEqual(['intents', 'planner', 'scenario', 'version']);
    expect(Object.keys(parsed.intents[0]?.[0] ?? {})).toEqual(['kind', 'bot']);
  });

  it('does not let a file reach Object.prototype', () => {
    // JSON.parse does not treat __proto__ as a setter, but the parser also never
    // spreads or assigns the input into an accumulator, so there is no second path.
    const hostile = `{"version":1,"scenario":"open-field","planner":"astar",
      "intents":[[{"kind":"wait","bot":"bot-1","__proto__":{"polluted":true}}]]}`;
    parseReplay(hostile);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('shares no structure with its input', () => {
    const input = valid();
    const parsed = parseReplay(input);
    expect(parsed.intents).not.toBe(input.intents);
    expect(parsed.intents[0]).not.toBe((input.intents as unknown[])[0]);
  });
});

describe('playReplay', () => {
  it('refuses a scenario that cannot be built', () => {
    const forged = { ...recordRun('open-field', 'astar'), scenario: 'invented' };
    expect(() => playReplay(forged)).toThrow(ReplayError);
  });
});
