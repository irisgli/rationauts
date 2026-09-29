/**
 * Seeded, purely functional pseudo-random number generation.
 *
 * Every stochastic decision in the simulation draws from this generator, and the
 * generator's state is carried inside {@link WorldState}. Nothing in the engine or
 * the agent library may call `Math.random` — a lint rule enforces it. The payoff is
 * that a scenario is fully described by `(initialState, seed, intents)`, which is
 * what makes replays, golden tests and benchmarking possible at all.
 *
 * The algorithm is mulberry32: a 32-bit generator that is small, fast and has a
 * period of 2^32. It is not cryptographically secure and is not intended to be.
 */

/** Immutable generator state. Advance it with {@link nextUint32} and friends. */
export interface Rng {
  readonly state: number;
}

/** Creates a generator from an arbitrary integer seed. */
export function makeRng(seed: number): Rng {
  // Force the seed into an unsigned 32-bit integer so that negative and
  // fractional seeds still produce a well-defined, reproducible stream.
  return { state: Math.trunc(seed) >>> 0 };
}

/**
 * Draws the next 32-bit unsigned integer.
 *
 * @returns the drawn value and the advanced generator. The input is not mutated.
 */
export function nextUint32(rng: Rng): readonly [number, Rng] {
  const state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, { state }];
}

/** Draws a float in the half-open interval `[0, 1)`. */
export function nextFloat(rng: Rng): readonly [number, Rng] {
  const [value, next] = nextUint32(rng);
  return [value / 0x1_0000_0000, next];
}

/**
 * Draws an integer in the half-open interval `[0, maxExclusive)`.
 *
 * @throws RangeError if `maxExclusive` is not a positive integer.
 */
export function nextInt(rng: Rng, maxExclusive: number): readonly [number, Rng] {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(
      `maxExclusive must be a positive integer, received ${String(maxExclusive)}`,
    );
  }
  const [value, next] = nextUint32(rng);
  return [value % maxExclusive, next];
}

/**
 * Returns a uniformly shuffled copy of `items` (Fisher-Yates).
 *
 * Provided so that callers never reach for an ad-hoc `sort(() => random - 0.5)`,
 * which is both biased and, more importantly here, not reproducible.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): readonly [readonly T[], Rng] {
  const out = [...items];
  let current = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(current, i + 1);
    current = next;
    const a = out[i];
    const b = out[j];
    // `noUncheckedIndexedAccess` widens these to `T | undefined`; both indices are
    // provably in range, so the guard is a formality that keeps the types honest.
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return [out, current];
}
