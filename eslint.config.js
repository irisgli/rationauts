// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Sources of non-determinism that are forbidden inside the simulation core and the
 * agent library. Randomness must come from the seeded PRNG carried in `WorldState`,
 * and no simulation logic may depend on wall-clock time.
 *
 * `@rationauts/sim` is deliberately exempt: it measures wall-clock time on purpose
 * when benchmarking, and it is not part of the simulated state transition.
 */
const nondeterministicGlobals = [
  {
    name: 'Date',
    message:
      'Simulation code must not read the clock. Thread time through WorldState.tick instead.',
  },
  {
    name: 'performance',
    message: 'Simulation code must not read the clock. Benchmarking belongs in @rationauts/sim.',
  },
];

const nondeterministicProperties = [
  {
    object: 'Math',
    property: 'random',
    message: 'Use the seeded PRNG from @rationauts/core (`nextFloat`) so runs stay reproducible.',
  },
  {
    object: 'Date',
    property: 'now',
    message:
      'Simulation code must not read the clock. Thread time through WorldState.tick instead.',
  },
];

/** Enforces the one-way dependency graph: app -> sim -> agents -> core. */
const forbiddenImports = (patterns, reason) => ({
  'no-restricted-imports': [
    'error',
    { patterns: patterns.map((group) => ({ ...group, message: reason })) },
  ],
});

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'warn',
    },
  },

  // --- Layer boundaries -------------------------------------------------------
  {
    files: ['packages/core/src/**/*.ts'],
    rules: forbiddenImports(
      [{ group: ['@rationauts/agents*', '@rationauts/sim*', '@rationauts/app*'] }],
      'core is the bottom layer: it must not depend on agents, sim or app.',
    ),
  },
  {
    files: ['packages/agents/src/**/*.ts'],
    rules: forbiddenImports(
      [{ group: ['@rationauts/*'] }],
      'agents depends on nothing, including core. Adapters belong in sim (ADR 4).',
    ),
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: forbiddenImports(
      [{ group: ['@rationauts/app*'] }],
      'sim is headless: it must not depend on the browser client.',
    ),
  },

  // --- Determinism ------------------------------------------------------------
  {
    files: ['packages/core/src/**/*.ts', 'packages/agents/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...nondeterministicGlobals],
      'no-restricted-properties': ['error', ...nondeterministicProperties],
      'no-console': 'error',
    },
  },

  // --- Environment overrides --------------------------------------------------
  {
    files: ['packages/app/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Command line tools and build scripts exist to print things.
    files: ['packages/sim/src/cli.ts', 'packages/*/scripts/**/*.ts', 'scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    // Spread first: `disableTypeChecked` carries its own `languageOptions`, so it
    // would otherwise replace the globals rather than merge with them.
    ...tseslint.configs.disableTypeChecked,
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    files: ['**/*.config.{ts,js}', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
