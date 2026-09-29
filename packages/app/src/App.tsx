import { Terrain, TERRAIN_COST } from '@rationauts/core';
import { PLANNERS, PLANNER_IDS, SCENARIOS, type PlannerId } from '@rationauts/sim';
import { useEffect, useMemo, useState } from 'react';
import { SurveyPlate } from './SurveyPlate.js';
import { TERRAIN_LABEL } from './palette.js';
import { useRun } from './useRun.js';

const REFLEX_BLURB = 'Steps toward the target and nothing else. No map, no memory.';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    query.addEventListener('change', listener);
    return () => {
      query.removeEventListener('change', listener);
    };
  }, []);
  return reduced;
}

export function App(): React.JSX.Element {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]?.id ?? '');
  const [planner, setPlanner] = useState<PlannerId>('reflex');
  const reducedMotion = usePrefersReducedMotion();

  const scenario = useMemo(
    () => SCENARIOS.find((candidate) => candidate.id === scenarioId) ?? SCENARIOS[0],
    [scenarioId],
  );
  if (scenario === undefined) throw new Error('No scenarios are defined');

  const run = useRun(scenario, planner);
  const { snapshot } = run;
  const plan = [...snapshot.plans.values()][0] ?? null;
  const sheetNumber = String(SCENARIOS.indexOf(scenario) + 1).padStart(2, '0');

  const status = snapshot.succeeded
    ? 'complete'
    : snapshot.finished
      ? 'stalled'
      : run.playing
        ? 'running'
        : 'ready';

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__identity">
          <h1 className="wordmark">Rationauts</h1>
          <p className="tagline">Colony survey: teach the bots to think</p>
        </div>
        <div className="masthead__sheet">
          <span className="eyebrow">Sheet {sheetNumber}</span>
          <span className="sheet-name">{scenario.name}</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <section className="rail__group">
            <h2 className="eyebrow">Sheets</h2>
            <ul className="list">
              {SCENARIOS.map((candidate, index) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={`list__item ${candidate.id === scenario.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setScenarioId(candidate.id);
                    }}
                    aria-pressed={candidate.id === scenario.id}
                  >
                    <span className="list__index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="list__label">{candidate.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rail__group">
            <h2 className="eyebrow">Modules</h2>
            <ul className="list">
              {PLANNER_IDS.map((id) => {
                const label = id === 'reflex' ? 'Reflex' : PLANNERS[id].label;
                const blurb = id === 'reflex' ? REFLEX_BLURB : PLANNERS[id].blurb;
                const optimal = id !== 'reflex' && PLANNERS[id].optimal;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`list__item list__item--module ${id === planner ? 'is-active' : ''}`}
                      onClick={() => {
                        setPlanner(id);
                      }}
                      aria-pressed={id === planner}
                    >
                      <span className="list__label">
                        {label}
                        {optimal ? <span className="badge">optimal</span> : null}
                      </span>
                      <span className="list__blurb">{blurb}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        <main className="main">
          <SurveyPlate
            state={snapshot.state}
            plan={plan}
            visited={snapshot.visited}
            animate={!reducedMotion}
          />

          <p className="fieldnote">
            <span className="fieldnote__mark">Field note</span>
            {scenario.brief} {scenario.lesson}
          </p>
        </main>
      </div>

      <footer className="ledger">
        <div className="controls">
          <button
            type="button"
            className="control control--primary"
            onClick={run.playing ? run.pause : run.play}
          >
            {run.playing ? 'Pause' : snapshot.finished ? 'Run again' : 'Run'}
          </button>
          <button
            type="button"
            className="control"
            onClick={run.stepOnce}
            disabled={snapshot.finished}
          >
            Step
          </button>
          <button type="button" className="control" onClick={run.reset}>
            Reset
          </button>
          <label className="speed">
            <span className="eyebrow">Speed</span>
            <input
              type="range"
              min={1}
              max={60}
              value={run.ticksPerSecond}
              onChange={(event) => {
                run.setTicksPerSecond(Number(event.target.value));
              }}
            />
            <span className="speed__value">{run.ticksPerSecond}/s</span>
          </label>
        </div>

        <dl className="metrics">
          <Metric label="Ticks" value={snapshot.metrics.ticks} />
          <Metric label="Path cost" value={snapshot.metrics.pathCost} />
          <Metric label="Tiles examined" value={snapshot.metrics.expanded} accent />
          <Metric label="Plans" value={snapshot.metrics.plans} />
          <Metric label="Refused" value={snapshot.metrics.failures} />
        </dl>

        <p className={`status status--${status}`}>{statusLine(status, snapshot.metrics.ticks)}</p>
      </footer>

      <div className="legend">
        {[Terrain.Plains, Terrain.Forest, Terrain.Mud, Terrain.Rock, Terrain.Water].map(
          (terrain) => (
            <span className="legend__item" key={terrain}>
              <span className={`swatch swatch--${terrain}`} />
              {TERRAIN_LABEL[terrain]}
              <span className="legend__cost">
                {Number.isFinite(TERRAIN_COST[terrain])
                  ? `cost ${String(TERRAIN_COST[terrain])}`
                  : 'impassable'}
              </span>
            </span>
          ),
        )}
        <span className="legend__item legend__item--overlay">
          <span className="swatch swatch--explored" />
          Tiles examined, shaded by when the planner reached them
        </span>
      </div>
    </div>
  );
}

function statusLine(status: string, ticks: number): string {
  switch (status) {
    case 'complete':
      return `Objective met in ${String(ticks)} ticks.`;
    case 'stalled':
      return 'Out of ticks. This module cannot finish this sheet. Try the next one down.';
    case 'running':
      return 'Running.';
    default:
      return 'Ready.';
  }
}

interface MetricProps {
  readonly label: string;
  readonly value: number;
  readonly accent?: boolean;
}

function Metric({ label, value, accent = false }: MetricProps): React.JSX.Element {
  return (
    <div className={`metric ${accent ? 'metric--accent' : ''}`}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString('en-US')}</dd>
    </div>
  );
}
