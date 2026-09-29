import type { PlannerId, Run, RunSnapshot, Scenario } from '@rationauts/sim';
import { createRun } from '@rationauts/sim';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drives a scenario one tick at a time against a wall clock.
 *
 * The simulation itself has no notion of real time, since it advances by whole ticks
 * and nothing else, so this hook is the only place where the two are reconciled. It
 * accumulates elapsed milliseconds and spends them on whole ticks, which keeps the
 * run identical regardless of frame rate: a dropped frame catches up rather than
 * producing a different simulation.
 */
export interface RunController {
  readonly snapshot: RunSnapshot;
  readonly playing: boolean;
  readonly ticksPerSecond: number;
  /**
   * Actions are function-typed properties rather than methods, because every one of
   * them is handed straight to an event handler. Declared as methods they would
   * carry an implicit `this`, which is both untrue here and a lint error at the
   * call site.
   */
  readonly play: () => void;
  readonly pause: () => void;
  readonly stepOnce: () => void;
  readonly reset: () => void;
  readonly setTicksPerSecond: (rate: number) => void;
}

/** Catching up more than this many ticks in one frame would look like a jump cut. */
const MAX_CATCH_UP_TICKS = 8;

export function useRun(scenario: Scenario, planner: PlannerId): RunController {
  const runRef = useRef<Run>(createRun(scenario, planner));
  const [snapshot, setSnapshot] = useState<RunSnapshot>(() => runRef.current.snapshot());
  const [playing, setPlaying] = useState(false);
  const [ticksPerSecond, setTicksPerSecond] = useState(10);

  const restart = useCallback(() => {
    runRef.current = createRun(scenario, planner);
    setSnapshot(runRef.current.snapshot());
    setPlaying(false);
  }, [scenario, planner]);

  // Changing the sheet or the module starts a fresh run. Keeping the old one would
  // mean showing metrics that belong to a configuration no longer on screen.
  useEffect(() => {
    restart();
  }, [restart]);

  useEffect(() => {
    if (!playing) return undefined;

    let frame = 0;
    let previous = performance.now();
    let owed = 0;

    const loop = (now: number): void => {
      const elapsed = now - previous;
      previous = now;
      owed += (elapsed / 1000) * ticksPerSecond;

      let ticks = Math.min(Math.floor(owed), MAX_CATCH_UP_TICKS);
      owed -= ticks;
      let latest = runRef.current.snapshot();
      while (ticks > 0 && !latest.finished) {
        latest = runRef.current.tick();
        ticks--;
      }
      setSnapshot(latest);

      if (latest.finished) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, ticksPerSecond]);

  const stepOnce = useCallback(() => {
    setPlaying(false);
    setSnapshot(runRef.current.tick());
  }, []);

  return {
    snapshot,
    playing,
    ticksPerSecond,
    play: useCallback(() => {
      // Restarting a finished run on play is friendlier than a dead button.
      if (runRef.current.snapshot().finished) {
        runRef.current = createRun(scenario, planner);
        setSnapshot(runRef.current.snapshot());
      }
      setPlaying(true);
    }, [scenario, planner]),
    pause: useCallback(() => {
      setPlaying(false);
    }, []),
    stepOnce,
    reset: restart,
    setTicksPerSecond,
  };
}
